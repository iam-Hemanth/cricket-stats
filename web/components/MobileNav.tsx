"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sm:hidden">
      {/* Hamburger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-[--glass-border] bg-[--bg-card] text-[--text-secondary] transition-colors hover:text-[--text-primary]"
        aria-label="Toggle navigation"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Slide-down menu */}
      {isOpen && (
        <div className="animate-slide-down absolute left-0 right-0 top-14 z-50 border-b border-[--glass-border] bg-[--bg-surface]/95 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4">
            <MobileLink href="/" onClick={() => setIsOpen(false)}>Home</MobileLink>
            <MobileLink href="/teams" onClick={() => setIsOpen(false)}>Teams</MobileLink>
            <MobileLink href="/compare" onClick={() => setIsOpen(false)}>Compare</MobileLink>
            <MobileLink href="/matchup" onClick={() => setIsOpen(false)}>Matchup</MobileLink>
            <div className="mt-2 flex items-center justify-between border-t border-[--glass-border] pt-3">
              <span className="text-xs text-[--text-muted]">Theme</span>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-lg px-3 py-2.5 text-sm font-medium text-[--text-secondary] transition-colors hover:bg-[--bg-card] hover:text-[--text-primary]"
    >
      {children}
    </Link>
  );
}
