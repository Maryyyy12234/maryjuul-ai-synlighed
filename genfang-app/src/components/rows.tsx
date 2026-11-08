import Link from "next/link";
import type { InquirySummary, Quote } from "@/lib/types";
import { CATEGORY, EMERGENCY, QUOTE_STATUS, STATUS, dayLabel, dkk, relTime } from "@/lib/format";
import { IconChevron } from "./icons";

export function InquiryRows({ items, empty, now }: { items: InquirySummary[]; empty: string; now: number }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="rows">
      {items.map((i) => (
        <li className="row" key={i.id}>
          <Link href={`/henvendelser/${i.id}`}>
            <span className="when">{relTime(i.receivedAt, now)}</span>
            <span style={{ minWidth: 0 }}>
              <span className="who">
                <span>{i.customerName}</span>
                {i.urgency === "akut" ? <span className="tag" data-kind="akut">{i.emergencyKind ? EMERGENCY[i.emergencyKind].replace("Mulig ", "") : "Akut"}</span> : null}
              </span>
              <span className="what" style={{ display: "block" }}>{i.subject}</span>
            </span>
            <span className="aside">
              {i.status === "udkast_klar" && i.guardOk === false ? <span className="tag" data-kind="warn">Ret svar</span>
                : i.status === "udkast_klar" ? <span className="tag">Godkend</span>
                : i.status === "godkendt" ? <span className="tag" data-kind="ok">{STATUS[i.status]}</span>
                : i.status === "ny" ? <span className="tag" data-kind="muted">{CATEGORY[i.category]}</span>
                : <span className="tag" data-kind="muted">{STATUS[i.status]}</span>}
              <IconChevron />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const POTENTIAL = new Set(["kladde", "afventer_godkendelse", "sendt"]);

export function QuoteRows({ items, empty, now, actions, showStatus = true }: { items: Quote[]; empty: string; now: number; actions?: (q: Quote) => React.ReactNode; showStatus?: boolean }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="rows">
      {items.map((q) => { const act = actions?.(q); return (
        <li className="row" key={q.id}>
          <div>
            <span className="when">{q.sentAt ? <>Sendt<br />{dayLabel(q.sentAt, now)}</> : "Ikke sendt"}</span>
            <span style={{ minWidth: 0 }}>
              <span className="who"><span>{q.customerName}</span></span>
              <span className="what" style={{ display: "block" }}>{q.title}</span>
            </span>
            <span className="aside" style={{ flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span className="amount" style={POTENTIAL.has(q.status) ? { color: "var(--ink-2)", fontWeight: 500 } : undefined} title={POTENTIAL.has(q.status) ? "Potentiel – ikke vundet endnu" : undefined}>{dkk(q.amountDkk)}</span>
              {showStatus || q.paidAt ? (
                <span className="tag" data-kind={q.paidAt ? "ok" : "muted"}>{q.paidAt ? "Betalt" : QUOTE_STATUS[q.status]}</span>
              ) : null}
            </span>
          </div>
          {act ? <div className="row-actions">{act}</div> : null}
        </li>
      ); })}
    </ul>
  );
}
