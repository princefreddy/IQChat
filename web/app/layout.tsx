import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HomiChat — Messagerie Intentionnelle & Confidentielle",
  description: "Messagerie calme, privée et maîtrisée.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        {children}
      </body>
    </html>
  );
}
