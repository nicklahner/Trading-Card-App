import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Card Tracker',
  description: 'NFL card collection portfolio tracker',
  robots: { index: false, follow: false },
  other: {
    'theme-color': '#0B0C0E',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
