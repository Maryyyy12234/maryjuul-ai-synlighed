import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/700.css';

/* DUO STUDIO — Reel "Dag eller Aften?"  9:16, ca. 14 s, loopbar.
   Greb fra 2026-inspiration: krog i første sekund, tekst på skærmen (lyd fra), outfit bygges op som stop-motion,
   hurtigt whip-skift mellem looks, grid-reveal, stof-nærbilleder og en slutning, der looper til starten.
   Kun godkendte produktbilleder – tøjet ændres ikke. Musik: "Cat Walk" – Arulo (Mixkit Free License). */
export const FPS = 30;
const BEAT = 0.4644, MUSIC_START = 29.35;
export const bf = (n: number) => Math.round(n * BEAT * FPS);
export const BEATS = 30;
export const DURATION = bf(BEATS);
const W = 1080, H = 1920;
const C = { day: '#EFE4D7', ink: '#171413', night: '#171211', nightInk: '#F3EDE5', wine: '#651626', ivory: '#F7F4EF', mute: '#68625D' };
const UI = 'Archivo, "Helvetica Neue", Arial, sans-serif';
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/* Store, korte ord på skærmen (virker uden lyd) */
const Caption: React.FC<{ text: string; color: string; y?: number; size?: number; from?: number }> = ({ text, color, y = 190, size = 104, from = 0 }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [from, from + 7], [0, 1], { ...clamp, easing: ease });
  return <div style={{ position: 'absolute', top: y, left: 64, right: 64, fontFamily: UI, fontSize: size, fontWeight: 400, fontStretch: '92%', letterSpacing: '-0.035em', lineHeight: 0.98, color, opacity: t, transform: `translateY(${(1 - t) * 24}px)` }}>{text}</div>;
};
const Tag: React.FC<{ text: string; color: string; y: number }> = ({ text, color, y }) => (
  <div style={{ position: 'absolute', top: y, left: 64, fontFamily: UI, fontSize: 28, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color, opacity: 0.85 }}>{text}</div>
);

/* Krog + loop-billede: delt flade, begge looks */
const Hook: React.FC<{ outro?: boolean }> = ({ outro }) => {
  const f = useCurrentFrame();
  const seam = 0.5; // samme komposition i start og slut, så reelen looper
  const X = seam * W;
  const img = (src: string, x: number, w: number) => <Img src={staticFile(`img/${src}.jpg`)} style={{ position: 'absolute', left: x, top: 1620 - w * 1.5, width: w, height: w * 1.5, objectFit: 'contain' }} />;
  const lo = outro ? interpolate(f, [0, 8], [0, 1], clamp) : 1;
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: X, height: H, background: C.day, overflow: 'hidden' }}>{img('penny-l1-model', X - 36 - 470, 470)}</div>
      <div style={{ position: 'absolute', left: X, top: 0, width: W - X, height: H, overflow: 'hidden' }}><div style={{ position: 'absolute', left: -X }}>{img('noir-m2', X + 36, 470)}</div></div>
      <div style={{ position: 'absolute', top: 200, right: W - X + 36, fontFamily: UI, fontSize: 112, fontStretch: '92%', letterSpacing: '-0.04em', color: C.ink }}>Dag</div>
      <div style={{ position: 'absolute', top: 200, left: X + 36, fontFamily: UI, fontSize: 112, fontStretch: '92%', letterSpacing: '-0.04em', color: C.nightInk, }}>Aften</div>
      <div style={{ position: 'absolute', top: 340, left: 0, right: 0, textAlign: 'center', fontFamily: UI, fontSize: 40, letterSpacing: '0.02em', color: C.wine, opacity: lo }}>
        <span style={{ background: C.ivory, padding: '8px 18px' }}>{outro ? 'To sider. Samme dig.' : 'Hvilken side er du?'}</span>
      </div>
      <div style={{ position: 'absolute', left: X - 1, top: 0, width: 2, height: H, background: 'rgba(243,237,229,.6)', opacity: lo }} />
      <div style={{ position: 'absolute', left: X - 66, top: 1700, width: 132, height: 132, borderRadius: 66, background: C.ivory, display: 'grid', placeItems: 'center', opacity: lo }}><Img src={staticFile('img/logo-ink.png')} style={{ width: 82 }} /></div>
    </AbsoluteFill>
  );
};

/* Stop-motion: outfittet bygges op – hvert stykke lander på beatet som et kort på bordet */
type Piece = { src: string; x: number; y: number; w: number; rot: number; label: string };
const Build: React.FC<{ night?: boolean; pieces: Piece[]; model: string; title: string; coll: string }> = ({ night, pieces, model, title, coll }) => {
  const f = useCurrentFrame();
  const fg = night ? C.nightInk : C.ink;
  const modelAt = bf(pieces.length + 0.2);
  const m = interpolate(f, [modelAt, modelAt + 6], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: night ? C.night : C.day }}>
      <Tag text={`${night ? 'Aften' : 'Dag'} · ${coll}`} color={fg} y={150} />
      <Caption text={title} color={fg} y={200} size={96} />
      {pieces.map((p, i) => {
        const at = bf(i + 0.4); // et nyt stykke på hvert beat (hakket stop-motion: 3 billeder)
        const t = f < at ? 0 : Math.min(1, Math.floor((f - at) / 2 + 1) / 3);
        return (
          <div key={p.src} style={{ position: 'absolute', left: p.x, top: p.y, width: p.w, transform: `translateY(${(1 - t) * -60}px) rotate(${p.rot}deg) scale(${1.08 - 0.08 * t})`, boxShadow: '0 24px 50px -24px rgba(0,0,0,.45)', opacity: t > 0 ? 1 - m * 0.85 : 0 } as React.CSSProperties}>
            <Img src={staticFile(`img/${p.src}.jpg`)} style={{ width: '100%', display: 'block' }} />
            <div style={{ position: 'absolute', left: 10, bottom: 10, background: C.ivory, color: C.ink, fontFamily: UI, fontSize: 22, fontWeight: 500, padding: '4px 10px' }}>{p.label}</div>
          </div>
        );
      })}
      {/* afsløring: hele looket på modellen */}
      <div style={{ position: 'absolute', left: (W - 640) / 2, top: 520, width: 640, height: 960, opacity: m, transform: `scale(${1.04 - 0.04 * m})` }}>
        <Img src={staticFile(`img/${model}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ position: 'absolute', top: 1540, left: 0, right: 0, textAlign: 'center', fontFamily: UI, fontSize: 64, letterSpacing: '-0.03em', color: fg, opacity: m }}>= {coll}</div>
    </AbsoluteFill>
  );
};

/* Whip-skift: hurtig vandret bevægelse med bevægelsesslør */
const Whip: React.FC<{ children: React.ReactNode; len: number }> = ({ children, len }) => {
  const f = useCurrentFrame();
  const out = interpolate(f, [len - 5, len], [0, -1], clamp), inn = interpolate(f, [0, 5], [1, 0], clamp);
  const x = (out || inn) * W, blur = Math.abs(out || inn) * 40;
  return <AbsoluteFill style={{ transform: `translateX(${x}px)`, filter: `blur(${blur}px)` }}>{children}</AbsoluteFill>;
};

/* Grid: looks og detaljer fylder 3×3 på beatet, derefter zoom ind på Holly */
const Grid: React.FC = () => {
  const f = useCurrentFrame();
  const cells = ['noir-m1', 'penny-d-logo-chest', 'holly-wine', 'freja-lace', 'penny-l3-model', 'holly-d-bows-wine', 'penny-l2-model', 'alma-lace', 'holly-blue'];
  const cw = 340, ch = 510, gx = 30, gy = 300;
  const p = interpolate(f, [bf(4), bf(5.5)], [0, 1], { ...clamp, easing: ease }); const z = 1 + p * 2.8;
  // zoom glider fra hele grid'et til Holly-looket centreret
  const cx = gx + 2 * (cw + 10) + cw / 2, cy = gy + ch / 2;
  return (
    <AbsoluteFill style={{ background: C.ivory, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0',
        transform: `translate(${(W / 2 - cx * z) * p}px, ${(H / 2 - cy * z) * p + 0}px) scale(${z})` }}>
        {cells.map((src, i) => {
          const at = Math.round(i * bf(0.5));
          return <div key={src} style={{ position: 'absolute', left: gx + (i % 3) * (cw + 10), top: gy + Math.floor(i / 3) * (ch + 10), width: cw, height: ch, overflow: 'hidden', background: '#C9B9AA', opacity: f >= at ? 1 : 0 }}>
            <Img src={staticFile(`img/${src}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 15%' }} />
          </div>;
        })}
      </div>
      <Caption text="+ Holly" color={C.ink} y={140} size={96} from={bf(4.6)} />
    </AbsoluteFill>
  );
};

/* Stof tæt på */
const Macro: React.FC<{ src: string; label: string; night?: boolean }> = ({ src, label, night }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, bf(2)], [1.15, 1.0], { ...clamp, easing: Easing.out(Easing.quad) });
  return (
    <AbsoluteFill style={{ background: night ? C.night : C.day, overflow: 'hidden' }}>
      <Img src={staticFile(`img/${src}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${s})` }} />
      <div style={{ position: 'absolute', bottom: 240, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ background: C.ivory, color: C.ink, fontFamily: UI, fontSize: 34, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px 20px' }}>{label}</span>
      </div>
    </AbsoluteFill>
  );
};

export const DuoReel: React.FC<{ bgm: boolean }> = ({ bgm }) => {
  const { durationInFrames } = useVideoConfig();
  const dayPieces: Piece[] = [
    { src: 'penny-everywhere-tee-front', x: 90, y: 470, w: 470, rot: -4, label: 'Everywhere Tee' },
    { src: 'penny-everywhere-pants-front', x: 520, y: 760, w: 470, rot: 3, label: 'Stripe Pants' },
  ];
  const nightPieces: Piece[] = [
    { src: 'alma-front', x: 80, y: 470, w: 420, rot: -3, label: 'Alma' },
    { src: 'freja-front', x: 560, y: 620, w: 420, rot: 4, label: 'Freja' },
    { src: 'cleo-pair', x: 300, y: 1080, w: 420, rot: -2, label: 'Cleo' },
  ];
  const seq: [number, number, (len: number) => React.ReactNode][] = [
    [0, 3, () => <Hook />],
    [3, 8, len => <Whip len={len}><Build pieces={dayPieces} model="penny-l1-model" title="Fra bordet til dig." coll="Penny" /></Whip>],
    [8, 14, len => <Whip len={len}><Build night pieces={nightPieces} model="noir-m2" title="Tre stykker. Ét look." coll="Noir" /></Whip>],
    [14, 21, len => <Whip len={len}><Grid /></Whip>],
    [21, 23, () => <Macro src="holly-d-bows-wine" label="Tre sløjfer" />],
    [23, 25, () => <Macro src="freja-lace" label="Blonde" night />],
    [25, BEATS, () => <Hook outro />],
  ];
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {seq.map(([a, b, el], i) => { const len = bf(b) - bf(a); return <Sequence key={i} from={bf(a)} durationInFrames={len}>{el(len)}</Sequence>; })}
      <div style={{ position: 'absolute', bottom: 70, left: 0, right: 0, textAlign: 'center', fontFamily: UI, fontSize: 22, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#A39C95' }}>DUO STUDIO · under udvikling</div>
      {bgm && <Audio src={staticFile('audio/cat-walk.mp3')} startFrom={Math.round(MUSIC_START * FPS)}
        volume={f => interpolate(f, [0, 3, durationInFrames - 20, durationInFrames - 1], [0, 1, 1, 0.6], clamp)} />}
    </AbsoluteFill>
  );
};
