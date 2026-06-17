import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getMoverProfilesDb } from "@/movers-profile/firestore";
import {
  getMoverProfileBySlug,
  getReviews,
  getPhotos,
  listMoverProfiles,
} from "@/movers-profile/repo";
import MoverProfileShell from "@/movers-profile/components/MoverProfileShell";
import { getLiftygoCardShowcaseData } from "@/movers-profile/liftygoCardMock";
import { getMoverSession, normalizePhoneForAuth } from "@/movers-profile/session";
import { getSessionUser } from "@/lib/auth/cookiesSession";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function ShellFallback() {
  return (
    <div
      style={{
        minHeight: "40vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-rubik), Rubik, sans-serif",
        color: "#6b7280",
      }}
    >
      טוען…
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "liftygo-card") {
    return {
      title: "כרטיס המוביל · ליפטיגו | LiftyGo",
      description:
        "דוגמה לכרטיס מוביל דיגיטלי — כל סוגי ההובלה. קריאייטיב והשקה של ליפטיגו.",
      openGraph: {
        title: "כרטיס המוביל של ליפטיגו",
        description: "דירוג 4.7 · 107 המלצות — תצוגה לדוגמה",
      },
    };
  }
  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);
  if (!profile) return { title: "פרופיל מוביל | LiftyGo" };
  return {
    title: `${profile.name} | LiftyGo`,
    description: profile.bio || `${profile.name} - מוביל מקצועי ב-LiftyGo`,
    openGraph: {
      title: `${profile.name} | LiftyGo`,
      description: profile.bio || `${profile.name} - מוביל מקצועי`,
      images: profile.profileImageUrl ? [profile.profileImageUrl] : [],
    },
  };
}

export default async function MoverProfilePage({ params }: Props) {
  const { slug } = await params;

  if (slug === "liftygo-card") {
    const data = getLiftygoCardShowcaseData();
    return (
      <Suspense fallback={<ShellFallback />}>
        <MoverProfileShell
          slug={slug}
          data={data}
          isShowcase
          manageAuthorized={false}
          isAdmin={false}
          allProfiles={null}
        />
      </Suspense>
    );
  }

  const db = getMoverProfilesDb();
  const profile = await getMoverProfileBySlug(db, slug);

  if (!profile || !profile.isActive) {
    notFound();
  }

  const moverSession = await getMoverSession();
  const moverAuthed =
    moverSession &&
    normalizePhoneForAuth(moverSession.phone) === normalizePhoneForAuth(profile.phone);
  const crmUser = !moverAuthed ? await getSessionUser() : null;
  const isAdmin = Boolean(crmUser);
  const manageAuthorized = Boolean(moverAuthed || isAdmin);

  const [reviews, photos, allProfiles] = await Promise.all([
    getReviews(db, profile.id, manageAuthorized),
    getPhotos(db, profile.id, manageAuthorized),
    isAdmin ? listMoverProfiles(db) : Promise.resolve(null),
  ]);

  const data = { ...profile, reviews, photos };
  const allProfilesSerialized = allProfiles
    ? allProfiles.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        profileImageUrl: p.profileImageUrl,
      }))
    : null;

  return (
    <Suspense fallback={<ShellFallback />}>
      <MoverProfileShell
        slug={slug}
        data={data}
        isShowcase={false}
        manageAuthorized={manageAuthorized}
        isAdmin={isAdmin}
        allProfiles={allProfilesSerialized}
      />
    </Suspense>
  );
}
