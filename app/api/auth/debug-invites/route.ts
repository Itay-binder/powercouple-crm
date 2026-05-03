import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

function getIngestApiKey(): string | null {
  return process.env.CRM_INGEST_API_KEY?.trim() ?? null;
}

function getProvidedKey(req: NextRequest): string | null {
  const direct = req.headers.get("x-crm-api-key");
  if (direct?.trim()) return direct.trim();
  return null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseServiceAccountProjectId(): string | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { project_id?: string };
    return parsed.project_id ?? null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expected = getIngestApiKey();
  const provided = getProvidedKey(req);
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing email param" }, { status: 400 });
  }

  const normalized = normalizeEmail(email);
  const docId = normalized;

  const db = await getAdminDb();

  const docSnap = await db.collection("invites").doc(docId).get();
  const byEmailField = await db
    .collection("invites")
    .where("email", "==", normalized)
    .limit(1)
    .get();

  return NextResponse.json({
    ok: true,
    env: {
      firebaseServiceAccountProjectId: parseServiceAccountProjectId(),
      checkedEmail: normalized,
    },
    invites: {
      docId,
      docExists: docSnap.exists,
      byEmailFieldExists: !byEmailField.empty,
    },
  });
}

