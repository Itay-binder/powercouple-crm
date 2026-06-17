import type { MoverProfile, MoverReview, MoverPhoto, MoverService } from "./types";
import { normalizeMoverDisplayTheme } from "./viewTheme";
import type { CollectionReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

// ────────────── Profile CRUD ──────────────

export async function getMoverProfileBySlug(
  db: Firestore,
  slug: string
): Promise<MoverProfile | null> {
  const snap = await db
    .collection("moverProfiles")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return docToProfile(snap.docs[0]);
}

export async function getMoverProfileById(
  db: Firestore,
  id: string
): Promise<MoverProfile | null> {
  const doc = await db.collection("moverProfiles").doc(id).get();
  if (!doc.exists) return null;
  return docToProfile(doc);
}

export async function listMoverProfiles(db: Firestore): Promise<MoverProfile[]> {
  const snap = await db
    .collection("moverProfiles")
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map(docToProfile);
}

export async function createMoverProfile(
  db: Firestore,
  data: {
    slug: string;
    name: string;
    phone: string;
    bio?: string;
    services?: MoverService[];
    profileImageUrl?: string;
    coverArea?: string;
  }
): Promise<MoverProfile> {
  const ref = db.collection("moverProfiles").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    slug: data.slug,
    name: data.name,
    phone: data.phone,
    bio: data.bio ?? "",
    services: data.services ?? [],
    profileImageUrl: data.profileImageUrl ?? "",
    coverArea: data.coverArea ?? "פעיל בכל הארץ",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    rating: 0,
    reviewCount: 0,
    ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    displayTheme: "light",
  });
  const doc = await ref.get();
  return docToProfile(doc);
}

export async function updateMoverProfile(
  db: Firestore,
  id: string,
  updates: Partial<
    Pick<
      MoverProfile,
      | "name"
      | "slug"
      | "bio"
      | "services"
      | "profileImageUrl"
      | "coverArea"
      | "isActive"
      | "phone"
      | "displayTheme"
    >
  >
): Promise<void> {
  await db
    .collection("moverProfiles")
    .doc(id)
    .update({ ...updates, updatedAt: FieldValue.serverTimestamp() });
}

async function deleteCollectionBatch(db: Firestore, col: CollectionReference): Promise<void> {
  const snap = await col.limit(450).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const d of snap.docs) {
    batch.delete(d.ref);
  }
  await batch.commit();
  if (snap.size >= 450) {
    await deleteCollectionBatch(db, col);
  }
}

/** מוחק מסמך פרופיל וגם reviews + photos */
export async function deleteMoverProfile(db: Firestore, id: string): Promise<void> {
  const docRef = db.collection("moverProfiles").doc(id);
  await deleteCollectionBatch(db, docRef.collection("reviews"));
  await deleteCollectionBatch(db, docRef.collection("photos"));
  await docRef.delete();
}

// ────────────── Reviews ──────────────

export async function hasGoogleReviewed(
  db: Firestore,
  profileId: string,
  googleUid: string
): Promise<boolean> {
  const snap = await db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("reviews")
    .where("googleUid", "==", googleUid)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function addReview(
  db: Firestore,
  profileId: string,
  review: { reviewerName: string; rating: number; text: string; googleUid?: string; reviewerPhoto?: string }
): Promise<MoverReview> {
  const ref = db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("reviews")
    .doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    reviewerName: review.reviewerName,
    rating: review.rating,
    text: review.text,
    isHidden: false,
    createdAt: now,
    ...(review.googleUid ? { googleUid: review.googleUid } : {}),
    ...(review.reviewerPhoto ? { reviewerPhoto: review.reviewerPhoto } : {}),
  });

  // Update aggregate stats in a transaction
  await db.runTransaction(async (tx) => {
    const profileRef = db.collection("moverProfiles").doc(profileId);
    const profileDoc = await tx.get(profileRef);
    const d = profileDoc.data() ?? {};
    const breakdown: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      ...(d.ratingBreakdown ?? {}),
    };
    breakdown[review.rating] = (breakdown[review.rating] ?? 0) + 1;
    const newCount = (d.reviewCount ?? 0) + 1;
    const totalStars = Object.entries(breakdown).reduce(
      (sum, [stars, count]) => sum + Number(stars) * Number(count),
      0
    );
    const newRating = Math.round((totalStars / newCount) * 10) / 10;
    tx.update(profileRef, {
      reviewCount: newCount,
      ratingBreakdown: breakdown,
      rating: newRating,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const doc = await ref.get();
  return docToReview(doc);
}

export async function getReviews(
  db: Firestore,
  profileId: string,
  includeHidden = false
): Promise<MoverReview[]> {
  const snap = await db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("reviews")
    .orderBy("createdAt", "desc")
    .get();
  const all = snap.docs.map(docToReview);
  return includeHidden ? all : all.filter((r) => !r.isHidden);
}

export async function toggleReviewHidden(
  db: Firestore,
  profileId: string,
  reviewId: string,
  isHidden: boolean
): Promise<void> {
  await db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("reviews")
    .doc(reviewId)
    .update({ isHidden });
}

/** מחיקה קבועה + עדכון דירוג מצטבר בפרופיל — false אם אין מסמך */
export async function deleteReview(
  db: Firestore,
  profileId: string,
  reviewId: string
): Promise<boolean> {
  const reviewRef = db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("reviews")
    .doc(reviewId);
  const profileRef = db.collection("moverProfiles").doc(profileId);
  let deleted = false;
  await db.runTransaction(async (tx) => {
    const reviewSnap = await tx.get(reviewRef);
    if (!reviewSnap.exists) return;
    deleted = true;
    const profileSnap = await tx.get(profileRef);
    const r = reviewSnap.data() ?? {};
    const rating = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5)));
    const d = profileSnap.data() ?? {};
    const breakdown: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      ...(d.ratingBreakdown ?? {}),
    };
    breakdown[rating] = Math.max(0, (breakdown[rating] ?? 0) - 1);
    const newCount = Math.max(0, (d.reviewCount ?? 0) - 1);
    const totalStars = Object.entries(breakdown).reduce(
      (sum, [stars, count]) => sum + Number(stars) * Number(count),
      0
    );
    const newRating =
      newCount > 0 ? Math.round((totalStars / newCount) * 10) / 10 : 0;
    tx.delete(reviewRef);
    tx.update(profileRef, {
      reviewCount: newCount,
      ratingBreakdown: breakdown,
      rating: newRating,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return deleted;
}

// ────────────── Photos ──────────────

export async function addPhoto(
  db: Firestore,
  profileId: string,
  photo: { url: string; caption?: string; uploadedBy: "mover" | "customer" }
): Promise<MoverPhoto> {
  const ref = db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("photos")
    .doc();
  await ref.set({
    url: photo.url,
    caption: photo.caption ?? "",
    uploadedBy: photo.uploadedBy,
    isHidden: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return docToPhoto(doc);
}

export async function getPhotos(
  db: Firestore,
  profileId: string,
  includeHidden = false
): Promise<MoverPhoto[]> {
  const snap = await db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("photos")
    .orderBy("createdAt", "desc")
    .get();
  const all = snap.docs.map(docToPhoto);
  return includeHidden ? all : all.filter((p) => !p.isHidden);
}

export async function togglePhotoHidden(
  db: Firestore,
  profileId: string,
  photoId: string,
  isHidden: boolean
): Promise<void> {
  await db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("photos")
    .doc(photoId)
    .update({ isHidden });
}

export async function deletePhotoDoc(
  db: Firestore,
  profileId: string,
  photoId: string
): Promise<{ url: string } | null> {
  const ref = db
    .collection("moverProfiles")
    .doc(profileId)
    .collection("photos")
    .doc(photoId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const url = String((snap.data() as { url?: string })?.url ?? "");
  await ref.delete();
  return { url };
}

// ────────────── Converters ──────────────

function docToProfile(doc: DocumentSnapshot): MoverProfile {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    slug: d.slug ?? "",
    name: d.name ?? "",
    phone: d.phone ?? "",
    bio: d.bio ?? "",
    services: d.services ?? [],
    profileImageUrl: d.profileImageUrl ?? "",
    coverArea: d.coverArea ?? "פעיל בכל הארץ",
    isActive: d.isActive ?? true,
    createdAt: d.createdAt?.toDate() ?? new Date(),
    updatedAt: d.updatedAt?.toDate() ?? new Date(),
    rating: d.rating ?? 0,
    reviewCount: d.reviewCount ?? 0,
    ratingBreakdown: d.ratingBreakdown ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    displayTheme: normalizeMoverDisplayTheme(d.displayTheme, { ifMissing: "dark" }),
  };
}

function docToReview(doc: DocumentSnapshot): MoverReview {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    reviewerName: d.reviewerName ?? "",
    rating: d.rating ?? 5,
    text: d.text ?? "",
    isHidden: d.isHidden ?? false,
    createdAt: d.createdAt?.toDate() ?? new Date(),
    ...(d.googleUid ? { googleUid: d.googleUid } : {}),
    ...(d.reviewerPhoto ? { reviewerPhoto: d.reviewerPhoto } : {}),
  };
}

function docToPhoto(doc: DocumentSnapshot): MoverPhoto {
  const d = doc.data() ?? {};
  return {
    id: doc.id,
    url: d.url ?? "",
    caption: d.caption,
    uploadedBy: d.uploadedBy ?? "customer",
    isHidden: d.isHidden ?? false,
    createdAt: d.createdAt?.toDate() ?? new Date(),
  };
}