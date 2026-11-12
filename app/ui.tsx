import Link from "next/link";
import type { ReactNode } from "react";

type IconName = "mark" | "arrow" | "file" | "check" | "wallet" | "download" | "search";

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    mark: <><path d="M4 4h10l5 5v11H4zM14 4v5h5"/><path d="m8 14 2 2 5-5"/></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
    file: <><path d="M5 3h9l5 5v13H5zM14 3v5h5"/><path d="M8 13h8m-8 4h6"/></>,
    check: <path d="m5 12 4 4 10-10"/>,
    wallet: <><path d="M3 6h17v13H3zM3 6l14-3v3m3 5h-6v4h6"/><path d="M16 13h.01"/></>,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>,
    search: <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/></>,
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{paths[name]}</svg>;
}

export function PageHeader({ label, title, children, action }: {
  label: string; title: string; children?: ReactNode; action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 py-8 sm:py-12">
      <div className="max-w-3xl space-y-3">
        <p className="eyebrow">{label}</p>
        <h1 className="page-title">{title}</h1>
        {children && <p className="body-copy max-w-2xl">{children}</p>}
      </div>
      {action}
    </header>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-white">
      <div className="shell flex min-h-16 flex-wrap items-center justify-between gap-x-4 py-2">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-white"><Icon name="mark" /></span>
          PayPal Rec
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
          <Link href="/demo/review" className="button button-quiet">Demo case</Link>
          <Link href="/sandbox" className="button button-quiet">Sandbox</Link>
        </nav>
      </div>
    </header>
  );
}
