"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconInbox, IconMore, IconQuote } from "./icons";

const TABS = [
  { href: "/", label: "Oversigt", Icon: IconHome },
  { href: "/henvendelser", label: "Henvendelser", Icon: IconInbox },
  { href: "/tilbud", label: "Tilbud", Icon: IconQuote },
  { href: "/mere", label: "Mere", Icon: IconMore },
] as const;

export function TabBar({ pending, tenant }: { pending: number; tenant: string }) {
  const path = usePathname();
  // På en enkelt sag skjules fanebjælken på mobil (som i native iOS/Android-apps),
  // så handlingsknapperne får pladsen. Tilbage-knappen sidder i toppen.
  const detail = /^\/henvendelser\/[^/]+$/.test(path);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="tabbar" aria-label="Hovedmenu" data-detail={detail}>
      <div className="sidebar-brand"><span className="wordmark"><i />GENFANG</span></div>
      {TABS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="tab" aria-current={active(href) ? "page" : undefined}>
          <Icon />
          <span>{label}</span>
          {href === "/henvendelser" && pending > 0 ? <span className="badge" aria-label={`${pending} afventer`}>{pending}</span> : null}
        </Link>
      ))}
      <div className="sidebar-foot">{tenant}<br />Testversion · syntetiske data</div>
    </nav>
  );
}
