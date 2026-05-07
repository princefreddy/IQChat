import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IQChat - The Royal Messenger",
  description: "Secure, fun, and captivating messaging.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
