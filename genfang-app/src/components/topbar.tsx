"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconBack } from "./icons";

export function TopBar({ tenant, back }: { tenant: string; back?: { href: string; label: string } }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="topbar" data-scrolled={scrolled}>
      {back ? (
        <Link href={back.href} className="back"><IconBack />{back.label}</Link>
      ) : (
        <span className="wordmark wordmark-mobile"><i />GENFANG</span>
      )}
      <span className="tenant">{tenant}</span>
    </header>
  );
}
