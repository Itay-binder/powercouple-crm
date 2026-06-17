"use client";

/**
 * Firebase client auth was removed in the Supabase migration. PowerCouple CRM auth
 * now uses Supabase (see lib/supabase/browser.ts). These stubs remain only so the
 * out-of-scope mover-profile components keep compiling; calling them throws.
 */
function notAvailable(): never {
  throw new Error("Firebase client auth is no longer available (migrated to Supabase).");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function getFirebaseApp(): any {
  return notAvailable();
}

export function getFirebaseAuth(): any {
  return notAvailable();
}

export function getGoogleProvider(): any {
  return notAvailable();
}
/* eslint-enable @typescript-eslint/no-explicit-any */
