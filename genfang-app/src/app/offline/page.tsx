export const metadata = { title: "Offline" };
export default function Offline() {
  return (
    <main className="offline">
      <p className="eyebrow">Ingen forbindelse</p>
      <h1 className="title">Du er offline.</h1>
      <p className="lede">GENFANG gemmer ikke kundedata på telefonen. Når du er online igen, kan du se og godkende sager.</p>
      <p style={{ marginTop: 24 }}><a className="btn btn-primary" href="/">Prøv igen</a></p>
    </main>
  );
}
