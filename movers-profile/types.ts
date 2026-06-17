import type { MoverDisplayTheme } from "./viewTheme";

export type MoverService = "apartment" | "small" | "office" | "loading";

export const SERVICE_LABELS: Record<MoverService, string> = {
  apartment: "הובלת דירה",
  small: "הובלות קטנות",
  office: "הובלות משרדים",
  loading: "פירוק והרכבה",
};

export const SERVICE_ICONS: Record<MoverService, string> = {
  apartment: "🏠",
  small: "📦",
  office: "🏢",
  loading: "🔧",
};

export type MoverProfile = {
  id: string;
  slug: string;
  name: string;
  phone: string;
  bio: string;
  services: MoverService[];
  profileImageUrl: string;
  coverArea: string;
  /** תצוגת דף הכרטיס הציבורי: בהיר (ברירת מחדל) או כהה */
  displayTheme: MoverDisplayTheme;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  rating: number;
  reviewCount: number;
  ratingBreakdown: Record<number, number>;
};

export type MoverReview = {
  id: string;
  reviewerName: string;
  rating: number;
  text: string;
  isHidden: boolean;
  createdAt: Date;
  googleUid?: string;
  reviewerPhoto?: string;
};

export type MoverPhoto = {
  id: string;
  url: string;
  caption?: string;
  uploadedBy: "mover" | "customer";
  isHidden: boolean;
  createdAt: Date;
};

export type PublicMoverData = MoverProfile & {
  reviews: MoverReview[];
  photos: MoverPhoto[];
};

export type MoverProfileFormData = {
  name: string;
  phone: string;
  bio: string;
  services: MoverService[];
  profileImageUrl: string;
  coverArea: string;
};