"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  {
    href: "/",
    label: "Runbooks",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: "/new",
    label: "Generate",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" />
      </svg>
    ),
  },
  {
    href: "/knowledge",
    label: "Knowledge Base",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
        <div className="brand">
          <div className="logo">A</div>
          <div>
            AutoRunbook
            <small>AI Runbook Generator</small>
          </div>
        </div>
      </Link>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`nav-link ${
            l.href === "/"
              ? pathname === "/" || pathname.startsWith("/runbooks")
                ? "active"
                : ""
              : pathname.startsWith(l.href)
              ? "active"
              : ""
          }`}
        >
          {l.icon}
          {l.label}
        </Link>
      ))}
      <div className="sidebar-footer">
        Open source under AGPL-3.0
        <br />
        <a href="https://github.com/omrzk/autorunbook" target="_blank" rel="noreferrer">
          github.com/omrzk/autorunbook
        </a>
      </div>
    </aside>
  );
}
