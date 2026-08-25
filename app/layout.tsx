import type { Metadata } from 'next';
import './globals.css';

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const metadataBase = new URL(
  productionHost ? `https://${productionHost}` : 'http://localhost:3000',
);

export const metadata: Metadata = {
  metadataBase,
  title: 'Market Dungeon — Your Call. Your Fate.',
  description: 'The complete Delveworn dungeon loop, powered by live dreamDEX Event Contracts on Somnia.',
  openGraph: {
    title: 'Market Dungeon — Your Call. Your Fate.',
    description: 'The complete Delveworn dungeon loop, powered by live dreamDEX Event Contracts on Somnia.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1536,
        height: 1024,
        alt: 'Market Dungeon — Your Call. Your Fate.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Market Dungeon — Your Call. Your Fate.',
    description: 'The complete Delveworn dungeon loop, powered by live dreamDEX Event Contracts on Somnia.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
