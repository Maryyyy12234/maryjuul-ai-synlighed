import Link from "next/link";
import { InquiryRows } from "@/components/rows";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { nowMs } from "@/lib/clock";
import { getTenant, listInquiries } from "@/lib/store";

export const metadata = { title: "Sager" };

export default async function InquiriesPage(props: { searchParams: Promise<{ filter?: string }> }) {
  const s = await requireSession();
  const { filter } = await props.searchParams;
  const f = filter === "alle" ? "alle" : "aabne";
  const now = nowMs();
  const items = listInquiries(s.tid, f, now);
  return (
    <>
      <TopBar tenant={getTenant(s.tid)!.name} />
      <main className="main">
        <p className="eyebrow">Henvendelser</p>
        <h1 className="title">Sager</h1>
        <nav className="segment" aria-label="Filter">
          <Link href="/henvendelser?filter=aabne" aria-current={f === "aabne" ? "page" : undefined}>Åbne</Link>
          <Link href="/henvendelser?filter=alle" aria-current={f === "alle" ? "page" : undefined}>Alle</Link>
        </nav>
        <section className="section" style={{ marginTop: 24 }}>
          <div className="section-head"><h2>{f === "aabne" ? "Kræver handling · akutte først" : "Alle sager"}</h2><span>{items.length}</span></div>
          <InquiryRows items={items} now={now} empty="Ingen sager her." />
        </section>
      </main>
    </>
  );
}
