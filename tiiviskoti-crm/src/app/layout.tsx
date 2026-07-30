import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

/* Manrope on sivuston fontti (tiiviskoti.fi lataa saman Google Fontsista).
   Tässä se tulee `next/font`in kautta, joten se on itse hostattu: ei
   ulkoista pyyntöä Googlelle eikä välähdystä latauksen aikana. */
const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],   // latin-ext tuo ä ja ö
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TiivisKoti CRM',
  description: 'Varausten ja asentajakalentereiden hallinta',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
