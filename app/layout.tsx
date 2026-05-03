import type { Metadata } from "next";
import CrmSwrProvider from "@/app/components/CrmSwrProvider";
import { rubik } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Power Couple CRM",
  description: "קליטת לקוחות וניהול תהליכים",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body>
        <CrmSwrProvider>{children}</CrmSwrProvider>
      </body>
    </html>
  );
}

