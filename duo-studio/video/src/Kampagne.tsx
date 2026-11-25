import React from 'react';
import {
  AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/instrument-serif/400-italic.css';

/* DUO STUDIO · kampagne 9:16
   Musik: "Cat Walk" – Arulo (Mixkit Stock Music Free License), uddrag fra 29,35 s (drop), 129 BPM.
   Alle klip ligger på beat: beatF(n) = billede for beat n. */
export const FPS = 30;
const BEAT = 0.4644; // sek. pr. beat (librosa: 129,2 BPM)
const MUSIC_START = 29.35; // sek. – første beat i drop'et
export const beatF = (n: number) => Math.round(n * BEAT * FPS);
export const TOTAL_BEATS = 40;
export const DURATION = beatF(TOTAL_BEATS);

const C = { taupe: '#BCAA9A', taupeDark: '#A8968A', ink: '#2A1F1C', wine: '#651626', cream: '#FAF7F2' };
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const sans = 'Poppins, sans-serif';
const serif = '"Instrument Serif", serif';

type Move = { s: [number, number]; x?: [number, number]; y?: [number, number]; origin?: string; punch?: boolean };

/* Helfigur / halvnær: fuldt billede med langsom kamerabevægelse */
const Hero: React.FC<{ src: string; move: Move; len: number; tag?: { name: string; sub: string } }> = ({ src, move, len, tag }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, len], [0, 1], { extrapolateRight: 'clamp' });
  const e = Easing.bezier(0.33, 0, 0.2, 1)(p);
  // kort "punch" ind på første billeder (klip på beat), derefter rolig drift
  const punch = move.punch ? interpolate(f, [0, 9], [1.035, 1], { extrapolateRight: 'clamp', easing: ease }) : 1;
  const s = (move.s[0] + (move.s[1] - move.s[0]) * e) * punch;
  const x = move.x ? move.x[0] + (move.x[1] - move.x[0]) * e : 0;
  const y = move.y ? move.y[0] + (move.y[1] - move.y[0]) * e : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: C.taupe, overflow: 'hidden' }}>
      <Img src={staticFile(`img/${src}.jpg`)} style={{
        width: '100%', height: '100%', objectFit: 'cover',
        transform: `translate(${x}%, ${y}%) scale(${s})`, transformOrigin: move.origin ?? '50% 50%',
      }} />
      {tag && <Tag {...tag} />}
    </AbsoluteFill>
  );
};

const Tag: React.FC<{ name: string; sub: string }> = ({ name, sub }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [4, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const b = interpolate(f, [9, 21], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return (
    <div style={{ position: 'absolute', left: 84, bottom: 190, color: C.cream, textShadow: '0 2px 30px rgba(30,20,15,.35)' }}>
      <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 150, lineHeight: 0.9, opacity: a, transform: `translateY(${(1 - a) * 26}px)` }}>{name}</div>
      <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, letterSpacing: '0.28em', textTransform: 'uppercase', marginTop: 22, opacity: b, transform: `translateY(${(1 - b) * 16}px)` }}>{sub}</div>
    </div>
  );
};

/* Nærbillede: editorial indsat billede på taupe – holder detaljen skarp */
const Detail: React.FC<{ src: string; label: string; w?: number; len: number; full?: boolean; bg?: string }> = ({ src, label, w = 860, len, full, bg = C.taupe }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, len], [1.06, 1.0], { easing: Easing.out(Easing.quad) });
  const t = interpolate(f, [2, 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  if (full) return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: bg }}>
      <Img src={staticFile(`img/${src}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${s})` }} />
      <Label text={label} t={t} light />
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill style={{ backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: w, overflow: 'hidden', boxShadow: '0 40px 90px -40px rgba(42,31,28,.55)' }}>
        <Img src={staticFile(`img/${src}.jpg`)} style={{ width: '100%', display: 'block', transform: `scale(${s})` }} />
      </div>
      <Label text={label} t={t} />
    </AbsoluteFill>
  );
};

const Label: React.FC<{ text: string; t: number; light?: boolean }> = ({ text, t, light }) => (
  <div style={{
    position: 'absolute', left: 0, right: 0, bottom: 250, textAlign: 'center', fontFamily: sans, fontWeight: 500, fontSize: 31,
    letterSpacing: '0.3em', textTransform: 'uppercase', color: light ? C.cream : C.ink, opacity: t,
    textShadow: light ? '0 2px 24px rgba(0,0,0,.35)' : 'none',
  }}>{text}</div>
);

const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const l = interpolate(f, [0, 16], [0, 1], { extrapolateRight: 'clamp', easing: ease });
  const t = interpolate(f, [beatF(2), beatF(2) + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return (
    <AbsoluteFill style={{ backgroundColor: C.taupe, alignItems: 'center', justifyContent: 'center' }}>
      <Img src={staticFile('img/logo-wine.png')} style={{ width: 640, opacity: l, transform: `scale(${0.965 + 0.035 * l})` }} />
      <div style={{ marginTop: 84, fontFamily: serif, fontStyle: 'italic', fontSize: 74, color: C.ink, opacity: t, transform: `translateY(${(1 - t) * 18}px)` }}>
        Find dit næste look
      </div>
      <div style={{ position: 'absolute', bottom: 150, fontFamily: sans, fontWeight: 500, fontSize: 27, letterSpacing: '0.36em', color: C.wine, opacity: t }}>
        NOIR · PENNY · HOLLY
      </div>
    </AbsoluteFill>
  );
};

/* Brandmærke øverst i alle klip før slutkortet */
const Brand: React.FC<{ until: number }> = ({ until }) => {
  const f = useCurrentFrame();
  if (f >= until) return null;
  return <Img src={staticFile('img/logo-white.png')} style={{ position: 'absolute', bottom: 196, right: 84, width: 150, opacity: 0.92, filter: 'drop-shadow(0 2px 14px rgba(30,20,15,.35))' }} />;
};

type Shot = { b: number; e: number; el: (len: number) => React.ReactNode; dark?: boolean };
const SHOTS: Shot[] = [
  // HOLLY – stærkeste outfit åbner: tæt på sløjferne, trækker ud til helfigur
  { b: 0, e: 6, el: (len) => <Hero src="holly-wine" len={len} move={{ s: [1.38, 1.02], origin: '50% 16%', punch: true }} tag={{ name: 'Holly', sub: 'Bow Hoodie · Wide Pants' }} /> },
  { b: 6, e: 7, el: (len) => <Detail src="holly-d-bows-wine" label="Tre sløjfer" w={820} len={len} /> },
  { b: 7, e: 8, el: (len) => <Detail src="holly-d-waist-wine" label="Bindebånd" w={900} len={len} /> },
  { b: 8, e: 9, el: (len) => <Detail src="holly-d-back-wine" label="Peplum · glat ryg" w={860} len={len} /> },
  { b: 9, e: 13, el: (len) => <Hero src="holly-blue" len={len} move={{ s: [1.3, 1.3], y: [9, -9], origin: '50% 50%', punch: true }} tag={{ name: 'Holly', sub: 'Powder Blue' }} /> },
  { b: 13, e: 14, el: (len) => <Detail src="holly-d-bows-blue" label="Powder Blue" w={820} len={len} /> },
  // NOIR
  { b: 14, e: 19, el: (len) => <Hero src="noir-m1" len={len} move={{ s: [1.0, 1.14], origin: '50% 24%', punch: true }} tag={{ name: 'Noir', sub: 'Alma · Freja · Cleo' }} /> },
  { b: 19, e: 20, el: (len) => <Detail src="alma-lace" label="Alma · blonde" w={560} len={len} /> },
  { b: 20, e: 21, el: (len) => <Detail src="freja-lace" label="Freja · ydersøm" len={len} full /> },
  { b: 21, e: 22, el: (len) => <Detail src="cleo-lace" label="Cleo · slingback" w={800} len={len} /> },
  { b: 22, e: 26, el: (len) => <Hero src="noir-m2" len={len} move={{ s: [1.2, 1.02], x: [3, 0], origin: '50% 22%', punch: true }} /> },
  // PENNY
  { b: 26, e: 28, el: (len) => <Hero src="penny-l1-model" len={len} move={{ s: [1.04, 1.12], x: [-2, 2], origin: '50% 20%', punch: true }} tag={{ name: 'Penny', sub: 'Everywhere' }} /> },
  { b: 28, e: 29, el: (len) => <Detail src="penny-d-logo-chest" label="DUO / STUDIO" w={860} len={len} /> },
  { b: 29, e: 31, el: (len) => <Hero src="penny-l2-model" len={len} move={{ s: [1.16, 1.04], origin: '50% 20%', punch: true }} tag={{ name: 'Penny', sub: 'Soft Fit' }} /> },
  { b: 31, e: 32, el: (len) => <Detail src="penny-d-zip-v2" label="Lynlås" w={860} len={len} /> },
  { b: 32, e: 33, el: (len) => <Hero src="penny-l3-model" len={len} move={{ s: [1.04, 1.1], origin: '50% 20%', punch: true }} /> },
  // Slut
  { b: 33, e: TOTAL_BEATS, el: () => <EndCard /> },
];

export const Kampagne: React.FC<{ bgm: boolean }> = ({ bgm }) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: C.taupe }}>
      <AbsoluteFill style={{ filter: 'contrast(1.04) saturate(0.95) sepia(0.05)' }}>
        {SHOTS.map((s, i) => {
          const from = beatF(s.b); const len = beatF(s.e) - from;
          return <Sequence key={i} from={from} durationInFrames={len}>{s.el(len)}</Sequence>;
        })}
      </AbsoluteFill>
      {/* samlet farvebehandling: blød vignet */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 70% at 50% 45%, rgba(0,0,0,0) 55%, rgba(40,26,20,.28) 100%)', pointerEvents: 'none' }} />
      <Brand until={beatF(33)} />
      {bgm && (
        <Audio src={staticFile('audio/cat-walk.mp3')} startFrom={Math.round(MUSIC_START * FPS)}
          volume={(f) => interpolate(f, [0, 3, durationInFrames - 36, durationInFrames - 1], [0, 1, 1, 0], { extrapolateRight: 'clamp' })} />
      )}
    </AbsoluteFill>
  );
};
