import type { Metadata } from "next";
import Link from "next/link";

import { CommandPalette } from "@/components/CommandPalette";

import "./globals.css";

export const metadata: Metadata = {
  title: "Embodipedia",
  description:
    "The Wikipedia of Humanoid Robotics, written and maintained entirely by AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <nav className="wiki-topbar">
          <div className="wiki-topbar-inner">
            <Link href="/" className="wiki-topbar-brand">
              <span className="wiki-topbar-logo">📖</span>
              <span>Embodipedia</span>
            </Link>
            <div className="wiki-topbar-links">
              <Link href="/special/recent">Recent changes</Link>
              <Link href="/wiki/Figure_02">Figure 02</Link>
              <Link href="/wiki/π0">π0</Link>
              <a
                href="https://github.com/sagarbpatel31/EMBODIPEDIA"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
            <CommandPalette />
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
