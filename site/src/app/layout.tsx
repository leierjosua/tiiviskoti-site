import type { Metadata } from "next";
import { Gabarito, Inter } from "next/font/google";
import "./globals.css";
import Analytics from "./components/Analytics";
import CookieConsent from "./components/CookieConsent";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";

const gabarito = Gabarito({
  variable: "--font-gabarito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Lasikiilto – Ammattitaitoinen ikkunanpesu | Helsinki, Espoo, Vantaa",
    template: "%s | Lasikiilto",
  },
  description:
    "Ammattitaitoinen ikkunanpesu Helsingissä, Espoossa, Vantaalla ja koko Uudellamaalla. Kiinteä hinta heti ikkunalaskurilla, kotitalousvähennys 40 %. Streakiton jälki — tai pesemme uudelleen.",
  keywords:
    "ikkunanpesu, ikkunoiden pesu, lasinpesu, ikkunapesu Helsinki, Espoo, Vantaa, pääkaupunkiseutu, Uusimaa, taloyhtiö ikkunanpesu, näyteikkuna, kotitalousvähennys, ikkunanpesu kiinteä hinta",
  metadataBase: new URL("https://lasikiilto.fi"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fi_FI",
    url: "https://lasikiilto.fi",
    siteName: "Lasikiilto",
    title: "Lasikiilto – Ammattitaitoinen ikkunanpesu",
    description:
      "Ammattitaitoinen ikkunanpesu koko Uudellamaalla. Kiinteä hinta heti ikkunalaskurilla — streakiton jälki tai pesemme uudelleen.",
    images: ["/assets/og.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lasikiilto – Ammattitaitoinen ikkunanpesu",
    description:
      "Ammattitaitoinen ikkunanpesu koko Uudellamaalla. Kiinteä hinta heti — streakiton jälki.",
    images: ["/assets/og.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

// Sama oletus kuin Analytics.tsx:ssä — julkinen GTM-kontti-ID
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-N64H7SL2";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Lasikiilto",
  url: "https://lasikiilto.fi",
  description:
    "Ikkunanpesun erikoisliike Uudellamaalla. Kiinteä hinta, streakiton jälki tai pesemme uudelleen.",
  areaServed: {
    "@type": "State",
    name: "Uusimaa",
  },
  serviceType: "Ikkunanpesu",
  telephone: "+358458755996",
  email: "info@lasikiilto.fi",
  priceRange: "€€",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fi">
      <body className={`${gabarito.variable} ${inter.variable} antialiased`}>
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <Analytics />
        <VercelAnalytics />
        <CookieConsent />
      </body>
    </html>
  );
}
