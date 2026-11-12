import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "./globals.css";
import { SiteHeader } from "./ui";

export const metadata: Metadata = {
  title: "PayPal Rec",
  description: "A workspace for reconstructing evidence for a PayPal account limitation.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:m-2 focus:rounded-lg focus:bg-white focus:p-3 focus:text-brand">Skip to content</a>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
