import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tuning Calibration Suite',
  description: 'Professional ECU calibration – Bosch EDC15 / EDC16 / EDC17 / MD1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
