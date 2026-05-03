export type UserProfile = {
  email: string;
  role: "admin" | "user";
  approved: boolean;
  // Optional: keep Firestore extensibility for future features.
  utmSource?: string;
};

