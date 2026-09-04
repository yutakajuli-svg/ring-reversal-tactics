import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RING REVERSAL — Tactical Pro-Wrestling',
  description: 'プロレスの試合展開を盤面上で組み立てるターン制タクティクス試作',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
