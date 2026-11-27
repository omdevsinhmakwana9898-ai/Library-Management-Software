/**
 * Shared Super Admin date-period presets.
 * Calendar math matches server/src/businessCollections.js presetRange
 * (Asia/Kolkata by default).
 */

export const DATE_PERIOD_TZ = 'Asia/Kolkata';

export const DATE_PERIOD_PRESETS = [
  ['last_7_days', 'Last 7 days'],
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_2_months', 'Last 2 months'],
  ['last_3_months', 'Last 3 months'],
  ['last_6_months', 'Last 6 months'],
  ['last_1_year', 'Last 1 year'],
  ['last_3_years', 'Last 3 years'],
  ['all_time', 'All time'],
  ['custom', 'Custom'],
];

const pad = (n) => String(n).padStart(2, '0');

export function zonedYmd(date = new Date(), tz = DATE_PERIOD_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function addCalendarDays(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addCalendarMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
}

export function monthEndYmd(ym) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m, 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Inclusive calendar bounds. all_time and custom return null bounds. */
export function resolveDatePeriod(preset, now = new Date(), tz = DATE_PERIOD_TZ) {
  const today = zonedYmd(now, tz);
  const month = today.slice(0, 7);
  switch (preset) {
    case 'last_7_days': return { from: addCalendarDays(today, -6), to: today };
    case 'this_month': return { from: `${month}-01`, to: monthEndYmd(month) };
    case 'last_month': {
      const prev = addCalendarMonths(month, -1);
      return { from: `${prev}-01`, to: monthEndYmd(prev) };
    }
    case 'last_2_months': return { from: `${addCalendarMonths(month, -1)}-01`, to: monthEndYmd(month) };
    case 'last_3_months': return { from: `${addCalendarMonths(month, -2)}-01`, to: monthEndYmd(month) };
    case 'last_6_months': return { from: `${addCalendarMonths(month, -5)}-01`, to: monthEndYmd(month) };
    case 'last_1_year': return { from: `${addCalendarMonths(month, -11)}-01`, to: monthEndYmd(month) };
    case 'last_3_years': return { from: `${addCalendarMonths(month, -35)}-01`, to: monthEndYmd(month) };
    case 'all_time': return { from: null, to: null };
    case 'custom': return { from: null, to: null };
    default: return null;
  }
}

export function datePeriodLabel(preset, { from, to } = {}) {
  if (preset === 'custom') return `Custom${from || to ? `: ${from || '…'} – ${to || '…'}` : ''}`;
  return DATE_PERIOD_PRESETS.find(([id]) => id === preset)?.[1] || preset;
}
