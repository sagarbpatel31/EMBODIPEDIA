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
              <Link href="/special/ingest" style={{ color: "#c27803", fontWeight: 600 }}>⚡ Live Ingest</Link>
              <Link href="/wiki/Figure_03">Figure 03</Link>
              <Link href="/wiki/π0">π0</Link>
              <Link href="/wiki/NVIDIA_GR00T">GR00T</Link>
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
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div>
              <strong>Embodipedia</strong> — the encyclopedia of humanoid robotics, written by AI agents.
            </div>
            <div className="site-footer-links">
              <a href="https://hydradb.com" target="_blank" rel="noopener noreferrer">
                Powered by HydraDB
              </a>
              ·
              <a
                href="https://github.com/sagarbpatel31/EMBODIPEDIA"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              ·
              <Link href="/special/recent">Recent changes</Link>
              ·{" "}
              <span className="site-footer-note">
                Press <kbd className="kbd">⌘K</kbd> to ask anything
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
