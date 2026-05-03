import WhatsAppSubNav from "@/app/whatsapp-automations/WhatsAppSubNav";

type Props = {
  title: string;
  subtitle?: string;
  /** מסך צ׳אטים — רוחב מלא יותר כמו Meta Inbox */
  wide?: boolean;
  children: React.ReactNode;
};

export default function WhatsAppSectionShell({ title, subtitle, wide, children }: Props) {
  return (
    <div className="wa-section-root" style={{ maxWidth: wide ? "none" : 1180, width: "100%" }}>
      <WhatsAppSubNav />
      <h1
        className="wa-section-title"
        style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, lineHeight: 1.2 }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className="wa-section-subtitle"
          style={{ margin: "0 0 20px", color: "#4b5563", lineHeight: 1.55, fontSize: 14 }}
        >
          {subtitle}
        </p>
      ) : (
        <div style={{ marginBottom: 16 }} />
      )}
      {children}
    </div>
  );
}
