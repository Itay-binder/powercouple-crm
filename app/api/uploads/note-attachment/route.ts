import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { uploadPublicFile, formatStorageError } from "@/lib/supabase/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

type ApiErr = { ok: false; error: string };

export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error } satisfies ApiErr, { status: auth.status });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "file is required" } satisfies ApiErr, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "קובץ גדול מדי (מקסימום 15MB)" } satisfies ApiErr, {
        status: 400,
      });
    }

    const rawName = file.name?.trim() || "file";
    const safeName = rawName.replace(/[^\w.֐-׿\- ]+/g, "_").slice(0, 180);
    const id = randomUUID();
    const objectPath = `crm-note-attachments/${id}-${safeName}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadPublicFile(
      objectPath,
      buf,
      file.type || "application/octet-stream"
    );

    return NextResponse.json({
      ok: true,
      attachment: {
        id,
        fileName: rawName,
        url,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: formatStorageError(e) } satisfies ApiErr,
      { status: 500 }
    );
  }
}
