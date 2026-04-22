import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CricStats — Cricket Statistics",
  description:
    "Explore ball-by-ball cricket statistics, player records, head-to-head matchups, and venue insights powered by Cricsheet data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body className={`${sora.variable} ${dmSans.variable} font-sans antialiased`}>
        {/* ── Header ──────────────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-[--glass-border] bg-[--bg-surface]/80 backdrop-blur-xl">
          {/* Gradient accent line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[--accent-green]/30 to-transparent" />

          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
            {/* Logo */}
            <Link
              href="/"
              className="group flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-[--text-primary]"
            >
              {/* Cricket ball icon */}
              <svg className="h-6 w-6 text-[--accent-green] transition-transform duration-300 group-hover:rotate-[360deg]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M14.5 4.5c-1 2-1 4.5 0 7s1 5 0 7" strokeLinecap="round" />
                <path d="M9.5 4.5c1 2 1 4.5 0 7s-1 5 0 7" strokeLinecap="round" />
              </svg>
              <span>
                Cric<span className="gradient-text-green">Stats</span>
              </span>
            </Link>

            {/* Search */}
            <SearchBar />

            {/* Nav links — desktop */}
            <nav className="hidden shrink-0 items-center gap-1 sm:flex">
              <NavLink href="/">Home</NavLink>
              <NavLink href="/teams">Teams</NavLink>
              <NavLink href="/compare">Compare</NavLink>
              <NavLink href="/matchup">Matchup</NavLink>
              <div className="ml-2">
                <ThemeToggle />
              </div>
            </nav>

            {/* Mobile nav toggle */}
            <MobileNav />
          </div>
        </header>

        {/* ── Main content ────────────────────────────────── */}
        <main className="stadium-bg mx-auto max-w-6xl px-4 py-8 animate-fade-in">{children}</main>

        {/* ── Footer ──────────────────────────────────────── */}
        <footer className="relative border-t border-[--glass-border] py-8 text-center text-sm text-[--text-muted]">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[--accent-green]/20 to-transparent" />
          <div className="mx-auto max-w-6xl px-4">
            <p>
              Data sourced from{" "}
              <a
                href="https://cricsheet.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[--accent-green] underline decoration-[--accent-green]/30 underline-offset-2 transition hover:decoration-[--accent-green]"
              >
                Cricsheet
              </a>
            </p>
            <p className="mt-2 text-xs text-[--text-muted]/60">
              Built with Next.js · Ball-by-ball analytics since 2008
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

/* ── Nav link component ───────────────────────────────── */
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative rounded-lg px-3 py-1.5 text-sm font-medium text-[--text-secondary] transition-colors duration-200 hover:bg-[--bg-card]/50 hover:text-[--text-primary]"
    >
      {children}
    </Link>
  );
}
