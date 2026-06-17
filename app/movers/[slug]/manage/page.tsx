import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/**
 * ניהול הפרופיל משולב בדף /movers/[slug] תחת לשונית «ניהול».
 * נשמר ניתוב ישן לקישורי יומן / סימניות.
 */
export default async function ManageRedirectPage({ params }: Props) {
  const { slug } = await params;
  redirect(`/movers/${encodeURIComponent(slug)}?tab=manage`);
}
