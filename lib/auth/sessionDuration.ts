/**
 * משך תוקף עוגיית session (Firebase session cookie).
 * Firebase תומך עד בערך 14 ימים.
 */
export function getSessionExpiresMs(): number {
  const raw = process.env.SESSION_MAX_AGE_DAYS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  const days = Number.isFinite(parsed) ? parsed : 5;
  const clamped = Math.min(14, Math.max(1, days));
  return 1000 * 60 * 60 * 24 * clamped;
}

