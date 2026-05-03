import { NextRequest, NextResponse } from "next/server";
import {
  migrateContactDocId,
  resolveMigrateContactParams,
} from "@/lib/leads/migrateContactDocId";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

type Body = {
  secret?: string;
  dryRun?: boolean;
  databaseId?: string;
  fromContactId?: string;
  matchName?: string;
};

/**
 * מיגרציה חד־פעמית: מזהה מסמך leads (איש קשר) → מספר טלפון מנורמל.
 * POST עם Authorization: Bearer <CONTACT_MIGRATE_SECRET> או body.secret.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CONTACT_MIGRATE_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CONTACT_MIGRATE_SECRET is not configured" } satisfies ApiErr,
      { status: 503 }
    );
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const authHdr = req.headers.get("authorization")?.trim() ?? "";
  const bearer = authHdr.toLowerCase().startsWith("bearer ")
    ? authHdr.slice(7).trim()
    : "";
  const token = bearer || (typeof body.secret === "string" ? body.secret.trim() : "");
  if (token !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" } satisfies ApiErr, { status: 401 });
  }

  try {
    const { db, fromId, toId } = await resolveMigrateContactParams({
      databaseId: body.databaseId,
      fromContactId: body.fromContactId,
      matchName: body.matchName,
    });

    const result = await migrateContactDocId({
      db,
      fromId,
      toId,
      dryRun: body.dryRun === true,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
