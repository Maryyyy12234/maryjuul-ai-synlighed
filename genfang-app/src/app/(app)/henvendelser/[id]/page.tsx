import { notFound } from "next/navigation";
import { DecisionPanel } from "@/components/decision-panel";
import { TopBar } from "@/components/topbar";
import { requireSession } from "@/lib/auth";
import { CATEGORY, CHANNEL, clock, relTime } from "@/lib/format";
import { getInquiry, getOverview } from "@/lib/store";

export const metadata = { title: "Henvendelse" };

export default async function InquiryPage(props: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await props.params;
  const i = getInquiry(s.tid, id);
  if (!i) notFound(); // også når sagen tilhører en anden virksomhed
  const o = getOverview(s.tid, s.uid)!;
  return (
    <>
      <TopBar tenant={o.tenant.name} back={{ href: "/henvendelser", label: "Henvendelser" }} />
      <main className="main" data-has-actions={i.status === "udkast_klar"}>
        <p className="eyebrow" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {i.urgency === "akut" ? <span className="tag" data-kind="akut">Akut</span> : null}
          <span>{i.urgency === "akut" ? "" : `${CATEGORY[i.category]} · `}Sorteret af Worker 01</span>
        </p>
        <h1 className="title">{i.customerName}</h1>
        <p className="lede" style={{ color: "var(--ink)", fontWeight: 500 }}>{i.subject}</p>
        <div className="meta">
          <span>{CHANNEL[i.channel]}</span>
          <span>Modtaget kl. {clock(i.receivedAt)} ({relTime(i.receivedAt)} siden)</span>
          {i.address ? <span>{i.address}</span> : null}
        </div>
        <blockquote className="message">{i.message}</blockquote>
        <DecisionPanel id={i.id} status={i.status} version={i.version} draft={i.draft?.text} decidedAt={i.decidedAt} />
      </main>
    </>
  );
}
