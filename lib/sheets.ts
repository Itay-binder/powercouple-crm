import { google } from "googleapis";
import { parseCellToYmd } from "@/lib/dateParse";

function getServiceAccountCredentials(): {
  client_email: string;
  private_key: string;
} {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key");
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

export async function fetchSheetMatrix(): Promise<string[][]> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SPREADSHEET_ID");

  const range =
    process.env.GOOGLE_SHEET_RANGE?.trim() ||
    "'Leads'!A:Z";

  const creds = getServiceAccountCredentials();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = res.data.values;
  if (!values?.length) return [];
  return values as string[][];
}

export function matrixToObjects(rows: string[][]): {
  headers: string[];
  records: Record<string, string>[];
} {
  if (rows.length < 2) return { headers: rows[0] ?? [], records: [] };
  const headers = rows[0].map((h) => String(h ?? "").trim());
  const records: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `col_${c}`;
      obj[key] = row?.[c] != null ? String(row[c]) : "";
    }
    records.push(obj);
  }

  return { headers, records };
}

export function resolveDateColumn(headers: string[]): string | null {
  const env = process.env.GOOGLE_DATE_COLUMN?.trim();
  if (env && headers.includes(env)) return env;

  const candidates = ["created_at", "תאריך יצירה", "תאריך", "date", "created"];
  for (const c of candidates) {
    const found = headers.find((h) => h.trim().toLowerCase() === c.toLowerCase());
    if (found) return found;
  }

  const fuzzy = headers.find((h) => h.includes("תאריך") || h.toLowerCase().includes("date"));
  return fuzzy ?? null;
}

export function filterByDateRange(
  records: Record<string, string>[],
  headers: string[],
  dateFrom: string | null,
  dateTo: string | null
): Record<string, string>[] {
  if (!dateFrom?.trim() && !dateTo?.trim()) return records;
  const col = resolveDateColumn(headers);
  if (!col) return records;

  const from = dateFrom?.trim() ?? "";
  const to = dateTo?.trim() ?? "";

  return records.filter((row) => {
    const ymd = parseCellToYmd(row[col] ?? "");
    if (!ymd) return false;
    if (from && ymd < from) return false;
    if (to && ymd > to) return false;
    return true;
  });
}

export function resolveStageColumn(headers: string[]): string | null {
  const env = process.env.GOOGLE_LEADS_STAGE_COLUMN?.trim();
  if (env && headers.includes(env)) return env;

  const candidates = [
    "סטטוס ליד",
    "סטטוס",
    "lead_status",
    "lead stage",
    "stage",
    "Stage",
    "שלב",
    "status",
  ];

  for (const c of candidates) {
    const found = headers.find((h) => h.trim().toLowerCase() === c.toLowerCase());
    if (found) return found;
  }

  const fuzzy = headers.find((h) => h.includes("סטטוס") || h.toLowerCase().includes("stage") || h.toLowerCase().includes("status"));
  return fuzzy ?? null;
}

export function resolveUniqueContactColumn(headers: string[]): string | null {
  const env = process.env.GOOGLE_CONTACT_UNIQUE_KEY_COLUMN?.trim();
  if (env && headers.includes(env)) return env;

  const candidates = [
    "email",
    "Email",
    "e-mail",
    "אימייל",
    "מייל",
    "phone",
    "Phone",
    "טלפון",
  ];

  for (const c of candidates) {
    const found = headers.find((h) => h.trim().toLowerCase() === c.toLowerCase());
    if (found) return found;
  }

  const fuzzy = headers.find((h) => h.toLowerCase().includes("email") || h.toLowerCase().includes("e-mail"));
  return fuzzy ?? null;
}

export function uniqueBy(records: Record<string, string>[], key: string): Record<string, string>[] {
  const map = new Map<string, Record<string, string>>();
  for (const r of records) {
    const val = (r[key] ?? "").trim();
    if (!val) continue;
    if (!map.has(val)) map.set(val, r);
  }
  return Array.from(map.values());
}

