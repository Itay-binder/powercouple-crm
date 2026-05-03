import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isValidIngestApiKeyAsync } from "@/lib/ingest/apiKey";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiErr = { ok: false; error: string };

function normalizeStages(stages: unknown): string[] {
  if (!Array.isArray(stages)) return [];
  return Array.from(
    new Set(
      stages
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
    )
  );
}

export async function POST(req: NextRequest) {
  if (!(await isValidIngestApiKeyAsync(req))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" } satisfies ApiErr,
      { status: 401 }
    );
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      pipelines?: Array<{
        id?: string;
        name?: string;
        stages?: string[];
      }>;
    };
    const rows = Array.isArray(body.pipelines) ? body.pipelines : [];
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "pipelines is required" } satisfies ApiErr,
        { status: 400 }
      );
    }
    const db = await getAdminDb();
    const out: Array<{ id: string; name: string; stages: string[] }> = [];
    for (const p of rows) {
      const id = String(p.id ?? "").trim();
      const name = String(p.name ?? "").trim();
      const stages = normalizeStages(p.stages);
      if (!id || !name || stages.length === 0) continue;
      const ref = db.collection("pipelines").doc(id);
      await ref.set(
        {
          name,
          stages,
          scope: "opportunity",
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      out.push({ id, name, stages });
    }
    return NextResponse.json({ ok: true, pipelines: out });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" } satisfies ApiErr,
      { status: 400 }
    );
  }
}
