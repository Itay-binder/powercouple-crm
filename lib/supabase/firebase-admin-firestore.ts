/**
 * Drop-in replacement for the `firebase-admin/firestore` module.
 *
 * next.config.ts aliases `firebase-admin/firestore` to this file, so every existing
 * `import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore"`
 * resolves here and transparently uses the Supabase-backed shim.
 */
export {
  FieldValue,
  Timestamp,
  Firestore,
  getFirestore,
  DocumentReference,
  CollectionReference,
  Query,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  QuerySnapshot,
  WriteBatch,
  Transaction,
} from "./firestoreShim";

export type { DocumentData } from "./firestoreShim";
