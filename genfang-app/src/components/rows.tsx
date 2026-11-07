import Link from "next/link";
import type { InquirySummary, Quote } from "@/lib/types";
import { CATEGORY, QUOTE_STATUS, STATUS, dayLabel, dkk, relTime } from "@/lib/format";
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
                {i.urgency === "akut" ? <span className="tag" data-kind="akut">Akut</span> : null}
              </span>
              <span className="what" style={{ display: "block" }}>{i.subject}</span>
            </span>
            <span className="aside">
              {i.status === "udkast_klar" ? <span className="tag">Godkend</span>
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

export function QuoteRows({ items, empty, now }: { items: Quote[]; empty: string; now: number }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="rows">
      {items.map((q) => (
        <li className="row" key={q.id}>
          <div>
            <span className="when">{q.followUpAt ? <>Følg op<br />{dayLabel(q.followUpAt, now)}</> : ({ kladde: "Kladde", sendt: "Sendt", accepteret: "Vundet", afslaaet: "Tabt" } as const)[q.status]}</span>
            <span style={{ minWidth: 0 }}>
              <span className="who"><span>{q.customerName}</span></span>
              <span className="what" style={{ display: "block" }}>{q.title}</span>
            </span>
            <span className="aside" style={{ flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span className="amount">{dkk(q.amountDkk)}</span>
              <span className="tag" data-kind={q.status === "accepteret" ? "ok" : "muted"}>{QUOTE_STATUS[q.status]}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
