import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Central LZ7", template: "%s · Central LZ7" },
  description: "Central empresarial interna da LZ7 Energia",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
