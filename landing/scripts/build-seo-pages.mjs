/**
 * Writes static HTML for /login, /signup, /free-trial, /features and /pricing so the first
 * response contains a real title, description, canonical and visible content.
 * Prices come from the public catalogue (live API, then the committed snapshot).
 * This script never changes prices; it only displays what the catalogue already has.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const landingRoot = join(here, '..');
const DEFAULT_SITE = 'https://mylibraryos.in';
const DEFAULT_APP = 'https://app.mylibraryos.in';
const DEFAULT_API = 'https://api.mylibraryos.in';

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function absoluteAppUrl(value) {
  const raw = trimSlash(value || DEFAULT_APP);
  if (!raw || raw === '/app') return DEFAULT_APP;
  if (raw.startsWith('http')) return raw;
  return DEFAULT_APP;
}

function formatInrFromMinor(minor) {
  const rupees = Number(minor || 0) / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function intervalOf(plan, name) {
  return (plan.intervals || []).find((row) => row.interval === name && row.available) || null;
}

async function loadPlans(apiBase) {
  const snapshot = JSON.parse(readFileSync(join(here, 'plan-snapshot.json'), 'utf8'));
  const url = `${trimSlash(apiBase)}/api/public/software-plans`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.plans) || body.plans.length === 0) throw new Error('empty catalogue');
    return { plans: body.plans, source: url };
  } catch (error) {
    console.warn(`Using plan snapshot (${error.message})`);
    return { plans: snapshot.plans, source: 'snapshot' };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function planCards(plans, { selectable = false, ctaHref = '', ctaLabel = 'Start free trial' } = {}) {
  return plans.map((plan) => {
    const month = intervalOf(plan, 'month');
    const year = intervalOf(plan, 'year');
    const monthLabel = month ? `${formatInrFromMinor(month.finalMinor)}` : '';
    const yearLabel = year ? `${formatInrFromMinor(year.finalMinor)} / year` : '';
    const trial = Number(plan.trialDays) > 0 ? `${plan.trialDays}-day free trial` : '';
    const lines = (plan.highlights || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
    const recommended = plan.recommended ? '<span class="pill">Recommended</span>' : '';
    const title = escapeHtml(plan.name);
    const body = `
      ${recommended}
      <h2>${title}</h2>
      ${monthLabel ? `<p class="price">${escapeHtml(monthLabel)}<span> / month</span></p>` : ''}
      ${yearLabel ? `<p class="year">${escapeHtml(yearLabel)}</p>` : ''}
      ${trial ? `<span class="trial">${escapeHtml(trial)}</span>` : ''}
      <ul>${lines}</ul>
    `;
    if (selectable) {
      return `<label class="plan${plan.recommended ? ' recommended' : ''}">
        <input type="radio" name="plan" value="${escapeHtml(plan.planId)}" ${plan.recommended ? 'checked' : ''}>
        ${body}
      </label>`;
    }
    const href = ctaHref || '#';
    return `<article class="plan${plan.recommended ? ' recommended' : ''}">
      ${body}
      <a class="btn ${plan.recommended ? 'btn-gold' : 'btn-outline'}" style="margin-top:16px" href="${escapeHtml(href)}">${escapeHtml(ctaLabel)}</a>
    </article>`;
  }).join('\n');
}

function pageTemplate({
  site,
  title,
  description,
  path,
  heading,
  lead,
  content,
  jsonLd,
}) {
  const url = `${site}${path}`;
  const ld = jsonLd || {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: 'My Library OS', url: `${site}/` },
  };
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="My Library OS" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:image" content="${escapeHtml(site)}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(site)}/og-image.png" />
    <link rel="stylesheet" href="/seo-pages.css" />
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
  </head>
  <body>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/">
          <img src="/logo-icon.png" width="32" height="32" alt="">
          <span>My Library <span class="os">OS</span></span>
        </a>
        <nav class="nav-links" aria-label="Main">
          <a href="/login">Sign in</a>
          <a href="/signup">Create account</a>
          <a href="/free-trial">Free trial</a>
          <a href="/features">Features</a>
          <a href="/pricing">Pricing</a>
        </nav>
      </div>
    </header>
    <main>
      <div class="wrap">
        <section class="hero">
          <h1>${escapeHtml(heading)}</h1>
          <p>${lead}</p>
        </section>
        ${content}
      </div>
    </main>
    <footer class="site-footer">
      <div class="wrap">
        <p>© ${new Date().getFullYear()} My Library OS (mylibraryos.in). All rights reserved.</p>
        <p>
          <a href="/login">Sign in</a> ·
          <a href="/signup">Create account</a> ·
          <a href="/free-trial">Free trial</a> ·
          <a href="/features">Features</a> ·
          <a href="/pricing">Pricing</a> ·
          <a href="/privacy">Privacy</a>
        </p>
      </div>
    </footer>
  </body>
</html>
`;
}

function signupUrl(app, planId) {
  const hash = planId ? `#signup&plan=${encodeURIComponent(planId)}` : '#signup';
  return `${app}/${hash}`;
}

async function main() {
  const outRoot = argValue('--out', join(landingRoot, 'public'));
  const site = trimSlash(process.env.VITE_SITE_URL || DEFAULT_SITE) || DEFAULT_SITE;
  const app = absoluteAppUrl(process.env.VITE_APP_URL);
  const api = trimSlash(process.env.VITE_API_URL || DEFAULT_API) || DEFAULT_API;
  const { plans, source } = await loadPlans(api);
  const signInUrl = `${app}/`;
  const createAccountUrl = signupUrl(app);

  const pages = {
    login: pageTemplate({
      site,
      path: '/login',
      title: 'Sign in - My Library OS (mylibraryos.in)',
      description: 'Sign in to My Library OS (mylibraryos.in) to manage seats, shifts, admissions and fees for your study library.',
      heading: 'Sign in to My Library OS',
      lead: 'Use your My Library OS email or mobile number and password to open your library dashboard at app.mylibraryos.in.',
      content: `
        <div class="actions">
          <a class="btn btn-gold" href="${escapeHtml(signInUrl)}">Continue to sign in</a>
          <a class="btn btn-outline" href="/signup">Create an account</a>
        </div>
        <p class="muted" style="margin-top:20px">New to My Library OS? <a href="/free-trial">Start a free trial</a> — you only choose a plan, and you do not pay to begin.</p>
      `,
    }),
    signup: pageTemplate({
      site,
      path: '/signup',
      title: 'Create account - My Library OS (mylibraryos.in)',
      description: 'Create a My Library OS account at mylibraryos.in. Open the Create account screen — not Sign in — and start managing your study library.',
      heading: 'Create your My Library OS account',
      lead: 'This page takes you to the Create account screen on app.mylibraryos.in, not the Sign in screen. If you already have an account, sign in instead.',
      content: `
        <div class="actions">
          <a class="btn btn-gold" href="${escapeHtml(createAccountUrl)}">Create account</a>
          <a class="btn btn-outline" href="/login">Sign in</a>
        </div>
        <p class="muted" style="margin-top:20px">Want to pick a plan first? <a href="/free-trial">Start a free trial</a>. You only choose a plan — no payment is needed to begin.</p>
      `,
    }),
    'free-trial': pageTemplate({
      site,
      path: '/free-trial',
      title: 'Get a free trial - My Library OS (mylibraryos.in)',
      description: 'Start a My Library OS free trial. Choose a plan for your trial only — no payment is needed — then create your account at app.mylibraryos.in.',
      heading: 'Get a free trial of My Library OS',
      lead: 'Choose one of our plans so we can set up your trial. You are only selecting a plan. You do not need to pay to start the free trial.',
      content: `
        <p class="note"><strong>No payment is needed.</strong> Pick a plan for your free trial, then continue to Create account. You can use My Library OS through the trial period without paying first.</p>
        <form id="trial-form">
          <div class="plans">${planCards(plans, { selectable: true })}</div>
          <div class="actions">
            <button class="btn btn-gold" type="submit" id="trial-continue">Continue to create account</button>
            <a class="btn btn-outline" href="/pricing">Compare plans</a>
          </div>
        </form>
        <script>
          (function () {
            var app = ${JSON.stringify(app)};
            var form = document.getElementById('trial-form');
            if (!form) return;
            form.addEventListener('submit', function (event) {
              event.preventDefault();
              var selected = form.querySelector('input[name="plan"]:checked');
              if (!selected) return;
              window.location.href = app + '/#signup&plan=' + encodeURIComponent(selected.value);
            });
          })();
        </script>
      `,
    }),
    features: pageTemplate({
      site,
      path: '/features',
      title: 'Features - My Library OS (mylibraryos.in)',
      description: 'My Library OS features for reading libraries and study rooms: live seat map, shifts and timings, student admissions, printable receipts, expenses, payments, reports, and branches.',
      heading: 'Everything a reading library runs on',
      lead: 'The tools a study room uses every day, from the seat map to the monthly numbers.',
      content: `
        <div class="feature-list">
          <article>
            <h2>Live seat map</h2>
            <p>See which seats are taken, free or under maintenance, and assign one for the right shift.</p>
          </article>
          <article>
            <h2>Shifts &amp; timings</h2>
            <p>Morning, evening or full-day shifts, each with its own fee.</p>
          </article>
          <article>
            <h2>Student admissions</h2>
            <p>Admit students with their documents, in bulk or one at a time.</p>
          </article>
          <article>
            <h2>Printable receipts</h2>
            <p>Print a receipt with your library’s details at the desk.</p>
          </article>
          <article>
            <h2>Expenses</h2>
            <p>Log rent, salaries and supplies next to what you collect.</p>
          </article>
          <article>
            <h2>Payments &amp; split payments</h2>
            <p>Take a fee in cash, UPI, card, or a mix of all three.</p>
          </article>
          <article>
            <h2>Reports &amp; P&amp;L</h2>
            <p>Collections, expenses and profit for the month, side by side.</p>
          </article>
          <article>
            <h2>Branches &amp; permissions</h2>
            <p>Manage every branch in one place, with secure role-based permissions so each person only sees their work.</p>
          </article>
          <article>
            <h2>Google sign-in</h2>
            <p>Sign in with Google. The email on the account sets the role.</p>
          </article>
        </div>
        <div class="actions">
          <a class="btn btn-gold" href="/free-trial">Start free trial</a>
          <a class="btn btn-outline" href="/pricing">Pricing</a>
        </div>
      `,
    }),
        pricing: pageTemplate({
      site,
      path: '/pricing',
      title: 'Pricing - My Library OS (mylibraryos.in)',
      description: 'My Library OS pricing for study libraries in India. Compare plans and start a free trial — you only choose a plan, and no payment is needed to begin.',
      heading: 'My Library OS pricing',
      lead: 'Simple plans for reading libraries and study rooms in India. Every plan includes a free trial. On the free trial page you only choose a plan — you do not pay to start.',
      content: `
        <p class="note">Prices below are our current public plans. Starting a free trial does not require payment.</p>
        <div class="plans">${planCards(plans, { ctaHref: '/free-trial', ctaLabel: 'Start free trial' })}</div>
        <div class="actions">
          <a class="btn btn-outline" href="/demo">Book a demo</a>
        </div>
      `,
    }),
  };

  for (const [slug, html] of Object.entries(pages)) {
    const dir = join(outRoot, slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
  }
  console.log(`Wrote ${Object.keys(pages).join(', ')} to ${outRoot} (plans from ${source}; app ${app})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
