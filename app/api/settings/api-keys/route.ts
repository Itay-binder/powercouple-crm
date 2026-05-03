import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { isAdminEmail } from "@/lib/auth/profile";
import {
  createIngestApiKey,
  listIngestApiKeys,
} from "@/lib/ingest/apiKeysRepo";

export const dynamic = "force-dynamic";

function canManageApiKeys(user: {
  profile: { role: string };
  email?: string;
}): boolean {
  return user.profile.role === "admin" || isAdminEmail(user.email);
}

export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManageApiKeys(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const keys = await listIngestApiKeys();
    return NextResponse.json({
      ok: true,
      keys: keys.map((k) => ({
        id: k.id,
        label: k.label,
        createdAt: k.createdAt?.toISOString() ?? null,
        createdBy: k.createdBy,
        revoked: k.revoked,
        hint: k.hint,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!canManageApiKeys(auth.user)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  let body: { label?: string };
  try {
    body = (await req.json()) as { label?: string };
  } catch {
    body = {};
  }
  try {
    const { id, plaintext } = await createIngestApiKey({
      label: body.label,
      createdBy: auth.user.email ?? auth.user.profile.email,
    });
    return NextResponse.json({
      ok: true,
      id,
      /** Shown only once — store securely (same headers as before: x-api-key, Bearer, x-crm-api-key). */
      apiKey: plaintext,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 }
    );
  }
}
