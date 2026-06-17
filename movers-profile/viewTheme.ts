export type MoverDisplayTheme = "light" | "dark";

export function normalizeMoverDisplayTheme(
  raw: unknown,
  opts?: { ifMissing: MoverDisplayTheme }
): MoverDisplayTheme {
  if (raw === "dark") return "dark";
  if (raw === "light") return "light";
  return opts?.ifMissing ?? "light";
}

/** צבעים לדף תצוגת פרופיל ציבורי — בהיר (ברירת מחדל מותג) או כהה (קלאסי) */
export type MoverViewPalette = {
  pageBg: string;
  text: string;
  textMuted: string;
  textSoft: string;
  textBio: string;
  brand: string;
  brandBright: string;
  headerBorder: string;
  headerPillBg: string;
  headerPillBorder: string;
  headerPillText: string;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  sectionTitle: string;
  verifiedBg: string;
  verifiedBorder: string;
  verifiedText: string;
  avatarBorder: string;
  avatarPlaceholderBg: string;
  serviceChipBg: string;
  serviceChipBorder: string;
  serviceChipText: string;
  reviewInnerBg: string;
  reviewInnerBorder: string;
  reviewQuote: string;
  reviewBody: string;
  photoCellBg: string;
  barBg: string;
  barBorder: string;
  inputBg: string;
  inputBorder: string;
  dashedUploadBorder: string;
  subtleSurface: string;
  starBarTrack: string;
  breakdownNumber: string;
  navBtnBorder: string;
  navBtnBg: string;
  navBtnColor: string;
  telBorder: string;
  telBg: string;
  telColor: string;
  secondaryBtnBorder: string;
  secondaryBtnBg: string;
  secondaryBtnColor: string;
};

export function getMoverViewPalette(theme: MoverDisplayTheme): MoverViewPalette {
  if (theme === "dark") {
    return {
      pageBg: "linear-gradient(135deg, #0d0d1a 0%, #130d2b 100%)",
      text: "#f9fafb",
      textMuted: "#9ca3af",
      textSoft: "#c4b5fd",
      textBio: "#d1d5db",
      brand: "#a78bfa",
      brandBright: "#c4b5fd",
      headerBorder: "rgba(139,92,246,0.15)",
      headerPillBg: "rgba(139,92,246,0.2)",
      headerPillBorder: "rgba(139,92,246,0.4)",
      headerPillText: "#c4b5fd",
      cardBg: "rgba(255,255,255,0.04)",
      cardBorder: "rgba(139,92,246,0.25)",
      cardShadow: "none",
      sectionTitle: "#c4b5fd",
      verifiedBg: "rgba(124,58,237,0.25)",
      verifiedBorder: "rgba(124,58,237,0.5)",
      verifiedText: "#c4b5fd",
      avatarBorder: "#7c3aed",
      avatarPlaceholderBg: "rgba(124,58,237,0.3)",
      serviceChipBg: "rgba(124,58,237,0.12)",
      serviceChipBorder: "rgba(124,58,237,0.25)",
      serviceChipText: "#c4b5fd",
      reviewInnerBg: "rgba(124,58,237,0.1)",
      reviewInnerBorder: "rgba(124,58,237,0.2)",
      reviewQuote: "#7c3aed",
      reviewBody: "#e5e7eb",
      photoCellBg: "rgba(124,58,237,0.15)",
      barBg: "rgba(13,13,26,0.95)",
      barBorder: "rgba(139,92,246,0.2)",
      inputBg: "rgba(255,255,255,0.06)",
      inputBorder: "rgba(139,92,246,0.3)",
      dashedUploadBorder: "rgba(139,92,246,0.3)",
      subtleSurface: "rgba(255,255,255,0.04)",
      starBarTrack: "rgba(255,255,255,0.1)",
      breakdownNumber: "#f9fafb",
      navBtnBorder: "rgba(139,92,246,0.3)",
      navBtnBg: "rgba(124,58,237,0.1)",
      navBtnColor: "#c4b5fd",
      telBorder: "rgba(139,92,246,0.4)",
      telBg: "rgba(124,58,237,0.1)",
      telColor: "#c4b5fd",
      secondaryBtnBorder: "rgba(139,92,246,0.3)",
      secondaryBtnBg: "transparent",
      secondaryBtnColor: "#9ca3af",
    };
  }
  return {
    pageBg: "linear-gradient(180deg, #fdfcff 0%, #f7f4ff 40%, #faf8ff 100%)",
    text: "#1e1635",
    textMuted: "#64748b",
    textSoft: "#6d28d9",
    textBio: "#475569",
    brand: "#7c3aed",
    brandBright: "#5b21b6",
    headerBorder: "rgba(124,58,237,0.12)",
    headerPillBg: "rgba(237,233,254,0.95)",
    headerPillBorder: "rgba(124,58,237,0.28)",
    headerPillText: "#5b21b6",
    cardBg: "rgba(255,255,255,0.92)",
    cardBorder: "rgba(124,58,237,0.18)",
    cardShadow: "0 4px 24px rgba(124,58,237,0.07)",
    sectionTitle: "#5b21b6",
    verifiedBg: "#ede9fe",
    verifiedBorder: "rgba(124,58,237,0.45)",
    verifiedText: "#5b21b6",
    avatarBorder: "#7c3aed",
    avatarPlaceholderBg: "#ede9fe",
    serviceChipBg: "#f5f3ff",
    serviceChipBorder: "rgba(124,58,237,0.28)",
    serviceChipText: "#5b21b6",
    reviewInnerBg: "#faf5ff",
    reviewInnerBorder: "rgba(124,58,237,0.14)",
    reviewQuote: "#7c3aed",
    reviewBody: "#334155",
    photoCellBg: "#ede9fe",
    barBg: "rgba(255,255,255,0.96)",
    barBorder: "rgba(124,58,237,0.15)",
    inputBg: "#ffffff",
    inputBorder: "rgba(124,58,237,0.25)",
    dashedUploadBorder: "rgba(124,58,237,0.35)",
    subtleSurface: "rgba(124,58,237,0.06)",
    starBarTrack: "rgba(124,58,237,0.12)",
    breakdownNumber: "#1e1635",
    navBtnBorder: "rgba(124,58,237,0.35)",
    navBtnBg: "#f5f3ff",
    navBtnColor: "#6d28d9",
    telBorder: "rgba(124,58,237,0.35)",
    telBg: "#f5f3ff",
    telColor: "#5b21b6",
    secondaryBtnBorder: "rgba(124,58,237,0.3)",
    secondaryBtnBg: "#ffffff",
    secondaryBtnColor: "#64748b",
  };
}
