import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * Supabase Storage helpers — replace Firebase Storage.
 * The default public bucket holds CRM note attachments and mover profile media.
 */
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "crm-media";

export type UploadResult = { path: string; url: string };

/** Upload a file and return its public URL. */
export async function uploadPublicFile(
  objectPath: string,
  body: Buffer | Uint8Array | ArrayBuffer,
  contentType: string
): Promise<UploadResult> {
  const supabase = createServiceSupabase();
  const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
  return { path: objectPath, url: data.publicUrl };
}

/** Delete an object (best effort). */
export async function deletePublicFile(objectPath: string): Promise<void> {
  const supabase = createServiceSupabase();
  await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
}

export function formatStorageError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.length > 400 ? raw.slice(0, 400) + "…" : raw;
}
