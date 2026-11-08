import type { WorkerDef } from "../types.ts";

export const WORKERS: WorkerDef[] = [
  {
    id: "worker-01", name: "Intake", label: "Modtagelse", role: "Tager imod nye henvendelser og finder de akutte",
    does: ["Samler mail, formular og telefonnotater", "Genkender eksisterende kunder og dubletter", "Registrerer akutte sager (fx vandskade) og eskalerer til vagten", "Finder manglende oplysninger"],
    needsApproval: "Eskalering sker automatisk til en medarbejder – aldrig til kunden.",
  },
  {
    id: "worker-02", name: "Responder", label: "Svarforslag", role: "Skriver forslag til svar, som du godkender",
    does: ["Skriver personlige svar", "Foreslår kun ledige tider fra kalenderen", "Bruger kun priser fra den godkendte prisliste", "Lover aldrig besøg i akutte sager"],
    needsApproval: "Alle svar kræver menneskelig godkendelse og passerer sikkerhedskontrollen.",
  },
  {
    id: "worker-03", name: "Follow-up", label: "Opfølgning", role: "Minder dig om tilbud og svar, der mangler",
    does: ["Finder ubesvarede tilbud og manglende svar", "Foreslår relevante opfølgninger", "Kontrollerer om beskeden lovligt må sendes", "Højst 2 opfølgninger pr. tilbud"],
    needsApproval: "Intet sendes uden ejerens godkendelse.",
  },
  {
    id: "worker-04", name: "Analytics", label: "Analyse", role: "Følger med i tallene og giver forslag",
    does: ["Måler kunderejsen fra henvendelse til betalt faktura", "Sammenligner perioder korrekt", "Skelner mellem testdata, estimater og verificerede tal", "Giver konkrete forbedringsforslag"],
    needsApproval: "Forslag er kun anbefalinger – de udfører ingen handlinger.",
  },
];
