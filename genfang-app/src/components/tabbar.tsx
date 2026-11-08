"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChart, IconHome, IconInbox, IconMore, IconQuote } from "./icons";

const ALL = [
  { href: "/", label: "Overblik", Icon: IconHome, owner: false },
  { href: "/henvendelser", label: "Sager", Icon: IconInbox, owner: false },
  { href: "/tilbud", label: "Tilbud", Icon: IconQuote, owner: false },
  { href: "/indsigt", label: "Indsigt", Icon: IconChart, owner: true },
  { href: "/mere", label: "Mere", Icon: IconMore, owner: false },
] as const;

export function TabBar({ pending, tenant, isOwner }: { pending: number; tenant: string; isOwner: boolean }) {
  const path = usePathname();
  const tabs = ALL.filter((t) => isOwner || !t.owner);
  // På en enkelt sag skjules fanebjælken på mobil (som i native apps), så handlingsknapperne får pladsen.
  const detail = /^\/henvendelser\/[^/]+$/.test(path);
  const active = (href: string) => (href === "/" ? path === "/" : (href === "/mere" && path.startsWith("/indsigt")) || path === href || path.startsWith(href + "/"));
  return (
    <nav className="tabbar" aria-label="Hovedmenu" data-detail={detail} style={{ ["--tabs" as string]: tabs.length }}>
      <div className="sidebar-brand"><span className="wordmark"><i />GENFANG</span></div>
      {tabs.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="tab" aria-current={active(href) ? "page" : undefined}>
          <Icon />
          <span>{label}</span>
          {href === "/henvendelser" && pending > 0 ? <span className="badge" aria-label={`${pending} kræver handling`}>{pending}</span> : null}
        </Link>
      ))}
      <div className="sidebar-foot">{tenant}<br />Testversion · syntetiske data</div>
    </nav>
  );
}
