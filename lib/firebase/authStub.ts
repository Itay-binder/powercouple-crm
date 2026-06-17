/**
 * Runtime stub for the removed `firebase/auth` and `firebase/app` packages.
 *
 * next.config.ts aliases those module specifiers here so the out-of-scope
 * mover-profile components still bundle. Any actual call throws — Firebase client
 * auth was replaced by Supabase Auth. Reimplement mover auth on Supabase to revive.
 */
function notAvailable(): never {
  throw new Error("Firebase auth was removed (migrated to Supabase Auth).");
}

// firebase/app
export function getApps(): unknown[] {
  return [];
}
export function initializeApp(): never {
  return notAvailable();
}

// firebase/auth
export class GoogleAuthProvider {}
export class RecaptchaVerifier {
  constructor() {
    notAvailable();
  }
}
export function getAuth(): never {
  return notAvailable();
}
export function signInWithPopup(): never {
  return notAvailable();
}
export function signInWithPhoneNumber(): never {
  return notAvailable();
}
export function onAuthStateChanged(): () => void {
  return () => {};
}
export function signOut(): Promise<void> {
  return Promise.resolve();
}
