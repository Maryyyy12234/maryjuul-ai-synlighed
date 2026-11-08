"use client";
import { useMemo, useState } from "react";
import { InquiryRows } from "./rows";
import type { InquirySummary } from "@/lib/types";

function normalize(s: string) {
  return s.toLocaleLowerCase("da-DK").normalize("NFKD");
}

/** Søg lokalt i den liste brugeren har adgang til – ingen kundedata sendes til søgetjenester. */
export function CaseSearch({ items, now }: { items: InquirySummary[]; now: number }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    return items.filter((item) => normalize(`${item.customerName} ${item.subject} ${item.category} ${item.channel}`).includes(q));
  }, [items, query]);

  return (
    <>
      <div className="case-search">
        <label htmlFor="case-search">Find en sag</label>
        <div className="case-search-input">
          <input id="case-search" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Søg efter kunde eller opgave…" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Ryd søgning">Ryd</button> : null}
        </div>
        <span className="case-search-count" role="status">{filtered.length} {filtered.length === 1 ? "sag" : "sager"}</span>
      </div>
      <InquiryRows items={filtered} now={now} empty={query ? "Ingen sager matcher søgningen." : "Ingen sager her."} />
    </>
  );
}
