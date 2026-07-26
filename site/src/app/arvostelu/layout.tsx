import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arvostele palvelumme — Lasikiilto",
  description: "Kerro kokemuksestasi Lasikiilto-palvelusta.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Standalone layout without ChatWidget or other site chrome
  return <>{children}</>;
}
