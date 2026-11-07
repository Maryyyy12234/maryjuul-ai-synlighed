import type { Provenance } from "@/lib/types";
import { PROVENANCE } from "@/lib/format";

export function Prov({ p }: { p: Provenance }) {
  return <span className="prov" data-p={p}>{PROVENANCE[p]}</span>;
}

export function ProvLegend() {
  return (
    <div className="prov-legend" aria-label="Forklaring på datagrundlag">
      <Prov p="testdata" /><Prov p="estimat" /><Prov p="verificeret" />
    </div>
  );
}
