import SeoHubTabs from "@/app/seo/SeoHubTabs";

export default function SeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SeoHubTabs />
      {children}
    </div>
  );
}
