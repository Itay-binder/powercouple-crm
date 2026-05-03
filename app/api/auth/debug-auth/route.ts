import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth/profile";
import { getAdminDb } from "@/lib/firebase/admin";
import { getVerifiedAuthFromRequest } from "@/lib/auth/fromRequest";

function getExpectedIngestKey(): string | null {
  return process.env.CRM_INGEST_API_KEY?.trim() ?? null;
}

function getProvidedKey(req: NextRequest): string | null {
  const direct = req.headers.get("x-crm-api-key");
  if (direct?.trim()) return direct.trim();
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) return authz.slice(7).trim();
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
  try {
    const expected = getExpectedIngestKey();
    const provided = getProvidedKey(req);
    if (!expected || !provided || provided !== expected) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const auth = await getVerifiedAuthFromRequest(req);

    // We primarily need the email that the server sees.
    const email = auth?.email ?? req.nextUrl.searchParams.get("email") ?? undefined;
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Missing email (no verified auth and no email param)" },
        { status: 400 }
      );
    }

    const normalized = normalizeEmail(email);

    const db = await getAdminDb();
    const invitesDoc = await db.collection("invites").doc(normalized).get();
    const invitesByEmailField = await db
      .collection("invites")
      .where("email", "==", normalized)
      .limit(1)
      .get();

    const isAdmin = isAdminEmail(auth?.email ?? email);

    return NextResponse.json({
      ok: true,
      server: {
        firebaseServiceAccountProjectId: parseServiceAccountProjectId(),
        firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID?.trim() || "(default)",
        checkedEmail: normalized,
        isAdmin,
        authEmailFromToken: auth?.email ?? null,
        invites: {
          docIdExists: invitesDoc.exists,
          byEmailFieldExists: !invitesByEmailField.empty,
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
        firebaseServiceAccountProjectId: parseServiceAccountProjectId(),
        firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID?.trim() || "(default)",
      },
      { status: 500 }
    );
  }
}

