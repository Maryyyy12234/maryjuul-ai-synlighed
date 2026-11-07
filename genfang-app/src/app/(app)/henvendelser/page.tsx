import Link from "next/link";
import { InquiryRows } from "@/components/rows";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { getOverview, listInquiries } from "@/lib/store";

export const metadata = { title: "Henvendelser" };

export default async function InquiriesPage(props: { searchParams: Promise<{ filter?: string }> }) {
  const s = await requireSession();
  const { filter } = await props.searchParams;
  const f = filter === "alle" ? "alle" : "aabne";
  const items = listInquiries(s.tid, f);
  const o = getOverview(s.tid, s.uid)!;
  return (
    <>
      <TopBar tenant={o.tenant.name} />
      <main className="main">
        <p className="eyebrow">Indbakke</p>
        <h1 className="title">Henvendelser</h1>
        <nav className="segment" aria-label="Filter">
          <Link href="/henvendelser?filter=aabne" aria-current={f === "aabne" ? "page" : undefined}>Åbne</Link>
          <Link href="/henvendelser?filter=alle" aria-current={f === "alle" ? "page" : undefined}>Alle</Link>
        </nav>
        <section className="section" style={{ marginTop: 24 }}>
          <div className="section-head"><h2>{f === "aabne" ? "Kræver handling" : "Alle sager"}</h2><span>{items.length}</span></div>
          <InquiryRows items={items} now={Date.now()} empty="Ingen henvendelser her." />
        </section>
      </main>
    </>
  );
}
