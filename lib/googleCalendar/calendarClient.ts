import { google } from "googleapis";
import type { StoredGoogleCalendarTokens } from "@/lib/googleCalendar/tokensRepo";
import { saveGoogleCalendarTokensForTenant } from "@/lib/googleCalendar/tokensRepo";

function getClientCreds() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET not configured");
  }
  return { clientId, clientSecret };
}

export function getCalendarOAuth2Client() {
  const { clientId, clientSecret } = getClientCreds();
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
    (process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/google-calendar/callback`
      : "");
  if (!redirectUri) {
    throw new Error("Set GOOGLE_CALENDAR_REDIRECT_URI or NEXT_PUBLIC_APP_URL for OAuth callback");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = getCalendarOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  return tokens;
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { email?: string };
    return j.email?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function oauth2FromStored(stored: StoredGoogleCalendarTokens) {
  const oauth2 = getCalendarOAuth2Client();
  oauth2.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    scope: stored.scope,
    token_type: stored.tokenType,
    expiry_date: stored.expiryDate,
  });
  return oauth2;
}

/** Refresh access token if expired; persists new access token to Firestore. */
export async function getAuthorizedCalendarClient(stored: StoredGoogleCalendarTokens) {
  const oauth2 = oauth2FromStored(stored);
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const now = Date.now();
  const exp = stored.expiryDate ?? 0;
  const needsRefresh = exp > 0 && now > exp - 60_000;
  if (needsRefresh && stored.refreshToken) {
    const { credentials } = await oauth2.refreshAccessToken();
    await saveGoogleCalendarTokensForTenant({
      accessToken: credentials.access_token ?? stored.accessToken,
      refreshToken: credentials.refresh_token ?? stored.refreshToken,
      scope: credentials.scope ?? stored.scope,
      tokenType: credentials.token_type ?? stored.tokenType,
      expiryDate: credentials.expiry_date ?? stored.expiryDate,
      accountEmail: stored.accountEmail,
    });
    oauth2.setCredentials(credentials);
  }

  return { calendar, oauth2 };
}

export type CalendarListEntry = { id: string; summary?: string; primary?: boolean };

export async function listWritableCalendars(stored: StoredGoogleCalendarTokens): Promise<CalendarListEntry[]> {
  const { calendar } = await getAuthorizedCalendarClient(stored);
  const out: CalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar.calendarList.list({
      pageToken,
      maxResults: 250,
      showHidden: true,
    });
    for (const item of res.data.items ?? []) {
      const access = item.accessRole;
      if (access !== "owner" && access !== "writer") continue;
      const id = item.id;
      if (!id) continue;
      out.push({ id, summary: item.summary ?? id, primary: item.primary === true });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  out.sort((a, b) => (a.primary === b.primary ? (a.summary ?? "").localeCompare(b.summary ?? "", "he") : a.primary ? -1 : 1));
  return out;
}
