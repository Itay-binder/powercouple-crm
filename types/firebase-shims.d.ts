/**
 * Ambient stubs for the legacy `firebase/*` client modules.
 *
 * The `firebase` package was removed in the Supabase migration. The only remaining
 * importers are the out-of-scope mover-profile components, which are dead until that
 * feature is reimplemented on Supabase. These loose declarations let the project
 * type-check without reinstalling Firebase.
 */
declare module "firebase/app" {
  export type FirebaseApp = unknown;
  export function getApps(): unknown[];
  export function initializeApp(config: unknown): FirebaseApp;
}

declare module "firebase/auth" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export type Auth = any;
  export type ConfirmationResult = {
    confirm(code: string): Promise<{ user: any }>;
  };
  export class GoogleAuthProvider {}
  export class RecaptchaVerifier {
    constructor(...args: any[]);
    render(): Promise<any>;
    clear(): void;
  }
  export function getAuth(app?: any): Auth;
  export function signInWithPopup(auth: any, provider: any): Promise<{ user: any }>;
  export function signInWithPhoneNumber(
    auth: any,
    phone: string,
    verifier: any
  ): Promise<ConfirmationResult>;
  export function onAuthStateChanged(auth: any, cb: (user: any) => void): () => void;
  export function signOut(auth: any): Promise<void>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
