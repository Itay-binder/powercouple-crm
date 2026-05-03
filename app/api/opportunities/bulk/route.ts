import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { deleteOpportunity, updateOpportunity } from "@/lib/opportunities/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
    )
  );
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    ids?: unknown;
    patch?: {
      stage?: string;
      status?: "פתוח" | "זכיה" | "הפסד";
      assignedRep?: string;
    };
  };
  const ids = normalizeIds(body.ids);
  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ids is required" } satisfies ApiErr,
      { status: 400 }
    );
  }
  if (ids.length > 500) {
    return NextResponse.json(
      { ok: false, error: "Maximum 500 opportunities per request" } satisfies ApiErr,
      { status: 400 }
    );
  }

  const patch = body.patch ?? {};
  const update: {
    stage?: string;
    status?: "פתוח" | "זכיה" | "הפסד";
    assignedRep?: string;
  } = {};
  if (typeof patch.stage === "string" && patch.stage.trim()) update.stage = patch.stage.trim();
  if (patch.status === "פתוח" || patch.status === "זכיה" || patch.status === "הפסד") {
    update.status = patch.status;
  }
  if (typeof patch.assignedRep === "string") update.assignedRep = patch.assignedRep.trim();

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid bulk update fields provided" } satisfies ApiErr,
      { status: 400 }
    );
  }

  const failed: Array<{ id: string; error: string }> = [];
  let updated = 0;
  for (const id of ids) {
    try {
      await updateOpportunity(id, update);
      updated += 1;
    } catch (e) {
      failed.push({
        id,
        error: e instanceof Error ? e.message : "Failed to update",
      });
    }
  }

  return NextResponse.json({ ok: true, total: ids.length, updated, failed });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error } satisfies ApiErr,
      { status: auth.status }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    ids?: unknown;
    confirm?: string;
  };
  const ids = normalizeIds(body.ids);
  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ids is required" } satisfies ApiErr,
      { status: 400 }
    );
  }
  if (ids.length > 500) {
    return NextResponse.json(
      { ok: false, error: "Maximum 500 opportunities per request" } satisfies ApiErr,
      { status: 400 }
    );
  }
  if (body.confirm?.trim() !== "DELETE") {
    return NextResponse.json(
      { ok: false, error: "confirm must be DELETE" } satisfies ApiErr,
      { status: 400 }
    );
  }

  const failed: Array<{ id: string; error: string }> = [];
  let deleted = 0;
  for (const id of ids) {
    try {
      await deleteOpportunity(id);
      deleted += 1;
    } catch (e) {
      failed.push({
        id,
        error: e instanceof Error ? e.message : "Failed to delete",
      });
    }
  }

  return NextResponse.json({ ok: true, total: ids.length, deleted, failed });
}
