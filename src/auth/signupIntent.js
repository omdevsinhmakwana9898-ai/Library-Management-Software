/**
 * Marketing pages on mylibraryos.in deep-link into the app's Create account
 * view. Sign in stays the default when no signup flag is present.
 *
 * Supported locations:
 *   #signup
 *   #signup&plan=standard
 *   #?signup=1&plan=standard
 *   ?signup=1&plan=standard
 *   #referral=CODE  (existing share links already open Create account)
 */

export function readSignupIntent(location) {
  const loc = location || (typeof window !== 'undefined' ? window.location : null);
  if (!loc) return { openSignup: false, planId: '' };
  const hash = String(loc.hash || '');
  const search = String(loc.search || '');
  const openSignup = hasSignupFlag(hash) || hasSignupFlag(search) || hasReferral(hash) || hasReferral(search);
  return { openSignup, planId: readPlanId(hash) || readPlanId(search) };
}

export function appSignupHash(planId) {
  const id = String(planId || '').trim();
  return id ? `#signup&plan=${encodeURIComponent(id)}` : '#signup';
}

function hasReferral(value) {
  return /(?:[?&#]|^)referral=/.test(String(value || ''));
}

function hasSignupFlag(value) {
  return /(?:^|[?&#])signup(?:[=&]|\/?$)/.test(String(value || ''));
}

function readPlanId(value) {
  const match = String(value || '').match(/[?&]plan=([^&]+)/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return '';
  }
}
