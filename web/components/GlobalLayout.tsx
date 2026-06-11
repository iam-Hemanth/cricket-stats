"use client";

import { usePathname } from "next/navigation";

export default function GlobalLayout({
  children,
  header,
  footer,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isStatBuilder = pathname === "/stat-builder";

  const isPlayerProfile = pathname.startsWith("/players/");

  if (isStatBuilder) {
    // For full-screen BI tools, bypass the max-width container and animations
    return <main>{children}</main>;
  }

  if (isHome) {
    return (
      <>
        {header}
        <main className="homepage-main animate-fade-in relative z-10">{children}</main>
        {footer}
      </>
    );
  }

  if (isPlayerProfile) {
    return (
      <>
        {header}
        <main className="stadium-bg animate-fade-in min-h-screen bg-ink relative z-10">
          {children}
        </main>
        {footer}
      </>
    );
  }

  return (
    <>
      {header}
      <main className="stadium-bg mx-auto max-w-6xl px-4 py-8 animate-fade-in relative z-10">
        {children}
      </main>
      {footer}
    </>
  );
}
