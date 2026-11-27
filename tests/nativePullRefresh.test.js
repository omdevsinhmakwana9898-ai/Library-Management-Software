import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const memoryStore = () => {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
  };
};

const bundleDir = mkdtempSync(join(tmpdir(), 'native-ptr-'));
const bundlePath = join(bundleDir, 'auth.mjs');
const projectRoot = new URL('..', import.meta.url).pathname;
await build({
  absWorkingDir: projectRoot,
  stdin: {
    contents: `
      export { getToken, setToken } from './src/utils/api.js';
      export { AuthProvider, useAuth } from './src/auth/AuthContext.jsx';
    `,
    resolveDir: projectRoot,
    sourcefile: 'native-ptr-entry.mjs',
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  jsx: 'automatic',
  plugins: [{
    name: 'external-react',
    setup(build) {
      build.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => ({
        path: require.resolve(args.path),
        external: true,
      }));
    },
  }],
});
const authBundle = await import(pathToFileURL(bundlePath).href);
const { AuthProvider, useAuth, getToken, setToken } = authBundle;

after(() => { rmSync(bundleDir, { recursive: true, force: true }); });

beforeEach(() => {
  globalThis.localStorage = memoryStore();
  globalThis.sessionStorage = memoryStore();
});

const initialStatus = () => {
  let status = 'missing';
  function Probe() {
    status = useAuth().status;
    return React.createElement('span', null, status);
  }
  renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(Probe)));
  return status;
};

test('mobile document allows the browser native pull-to-refresh', () => {
  const css = read('../src/responsive.css');
  const mobileAt = css.indexOf('@media (max-width: 767px)');
  assert.ok(mobileAt > 0);
  const mobile = css.slice(mobileAt);
  assert.match(mobile, /html, body \{ height: auto; overscroll-behavior-y: auto; \}/);
  assert.doesNotMatch(css, /overscroll-behavior-y:\s*none/);
  assert.match(mobile, /overflow-x:\s*clip/);
  assert.match(mobile, /header\.glass-panel:has\(\.header-nav\.drawer-open\)[\s\S]*?overscroll-behavior:\s*contain/);
  assert.doesNotMatch(css, /addEventListener\(\s*['"]touchmove['"]/);
});

test('a normal login token is still in localStorage for a reloaded page', () => {
  setToken('reload-session-token');
  assert.equal(globalThis.localStorage.getItem('library_api_token'), 'reload-session-token');
  assert.equal(globalThis.sessionStorage.getItem('library_api_token_tab'), null);
  assert.equal(globalThis.sessionStorage.getItem('library_api_token_tab_isolated'), null);
  // A full reload runs getToken() again against storage. There is no in-memory token cache.
  assert.equal(getToken(), 'reload-session-token');
  assert.equal(initialStatus(), 'loading');
  assert.notEqual(initialStatus(), 'anonymous');
  assert.equal(globalThis.localStorage.getItem('library_api_token'), 'reload-session-token');
  assert.equal(getToken(), 'reload-session-token');
});

test('with no stored token, auth starts signed out', () => {
  assert.equal(getToken(), null);
  assert.equal(initialStatus(), 'anonymous');
});

test('tab-isolated invite tokens stay in this tab and do not replace the shared login', () => {
  setToken('owner-token');
  setToken('invite-token', { tab: true });
  assert.equal(getToken(), 'invite-token');
  assert.equal(globalThis.sessionStorage.getItem('library_api_token_tab'), 'invite-token');
  assert.equal(globalThis.sessionStorage.getItem('library_api_token_tab_isolated'), '1');
  assert.equal(globalThis.localStorage.getItem('library_api_token'), 'owner-token');
  assert.equal(initialStatus(), 'loading');
});
