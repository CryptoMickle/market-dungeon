import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://market-dungeon.vtalityinnovation.chatgpt.site'),
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
