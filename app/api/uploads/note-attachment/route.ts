import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth/guard";
import { getAdminStorageBucket } from "@/lib/firebase/admin";

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
    const safeName = rawName.replace(/[^\w.\u0590-\u05FF\- ]+/g, "_").slice(0, 180);
    const id = randomUUID();
    const path = `crm-note-attachments/${id}-${safeName}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const bucket = getAdminStorageBucket();
    const gcsFile = bucket.file(path);
    await gcsFile.save(buf, {
      metadata: {
        contentType: file.type || "application/octet-stream",
      },
    });

    try {
      await gcsFile.makePublic();
    } catch {
      const [signedUrl] = await gcsFile.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      return NextResponse.json({
        ok: true,
        attachment: {
          id,
          fileName: rawName,
          url: signedUrl,
        },
      });
    }

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = `https://storage.googleapis.com/${bucket.name}/${encodedPath}`;

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
      { ok: false, error: e instanceof Error ? e.message : "העלאה נכשלה" } satisfies ApiErr,
      { status: 500 }
    );
  }
}
