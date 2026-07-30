import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TiivisKoti CRM',
  description: 'Varausten ja asentajakalentereiden hallinta',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}
