/**
 * Public Supabase config. The project URL and anon key are PUBLIC by design
 * (they ship in the browser bundle; security is enforced by Postgres RLS and the
 * service-role-only data path). Hardcoded as the source of truth so the client
 * bundle always has them, with an optional env override.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : "https://tlqeerjwejbwskqlbmfl.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRscWVlcmp3ZWpid3NrcWxibWZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTMxNjMsImV4cCI6MjA5NzI2OTE2M30.189neEeyjo6KApsTr-KeQHQVu3pJBxH1iamhwpCVJZw";
