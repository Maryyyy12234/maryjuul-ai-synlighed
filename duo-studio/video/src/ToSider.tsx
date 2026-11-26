import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';

/* DUO STUDIO — "To sider. Samme dig."  9:16 brand-film.
   Bygger på hjemmesidens hero: Dag (Penny) og Aften (Noir) side om side, en skillelinje med DUO-knap,
   detaljer på beat, lookbook og et slutkort med logoet delt i to farver.
   Kun godkendte produktbilleder – intet AI-genereret bevægelsesmateriale, så tøjet er præcist.
   Musik: "Cat Walk" – Arulo (Mixkit Stock Music Free License), uddrag fra drop'et ved 29,35 s, 129 BPM. */
export const FPS = 30;
const BEAT = 0.4644;
const MUSIC_START = 29.35;
export const bf = (n: number) => Math.round(n * BEAT * FPS);
export const BEATS = 38;
export const DURATION = bf(BEATS);

const W = 1080, H = 1920;
const C = { day: '#EFE4D7', dayInk: '#171413', night: '#171211', nightInk: '#F3EDE5', mute: '#68625D', ivory: '#F7F4EF' };
const UI = 'Archivo, "Helvetica Neue", Arial, sans-serif';
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const lerpB = (f: number, pts: [number, number][]) =>
  interpolate(f, pts.map(p => bf(p[0])), pts.map(p => p[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

/* Skillelinjens position (andel af bredden til Dag) over tid – samme interaktion som på hjemmesiden */
const seamAt = (f: number) => {
  const base = lerpB(f, [[0, 1], [2, 1], [4, 0.5], [8, 0.5], [10, 0.68], [12, 0.68], [14, 0.32], [16, 0.32]]);
  const breathe = f > bf(4) && f < bf(8) ? Math.sin((f - bf(4)) / bf(4) * Math.PI) * 0.03 : 0;
  return base + breathe;
};

const Look: React.FC<{ src: string; panelX: number; panelW: number; align: 'end' | 'start' }> = ({ src, panelX, panelW, align }) => {
  // helt look i 2:3, størrelsen følger panelets bredde (som på hjemmesiden)
  const gutter = 36, maxH = 1240;
  const w = Math.max(0, Math.min(panelW - gutter * 2, maxH * 2 / 3));
  const h = w * 1.5;
  const x = align === 'end' ? panelX + panelW - gutter - w : panelX + gutter;
  return <Img src={staticFile(`img/${src}.jpg`)} style={{ position: 'absolute', left: x, top: 1640 - h, width: w, height: h, objectFit: 'contain' }} />;
};

const Label: React.FC<{ x: number; y: number; mood: string; name: string; color: string; align: 'left' | 'right'; o: number }> = ({ x, y, mood, name, color, align, o }) => (
  <div style={{ position: 'absolute', top: y, [align]: x, textAlign: align, color, opacity: o, fontFamily: UI } as React.CSSProperties}>
    <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.8 }}>{mood}</div>
    <div style={{ fontSize: 76, fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1.05, fontStretch: '92%' }}>{name}</div>
  </div>
);

const Knob: React.FC<{ x: number; o: number }> = ({ x, o }) => (
  <>
    <div style={{ position: 'absolute', left: x - 1, top: 0, width: 2, height: H, background: 'linear-gradient(180deg, rgba(243,237,229,0), rgba(243,237,229,.6) 25%, rgba(243,237,229,.6))', opacity: o }} />
    <div style={{ position: 'absolute', left: x - 70, top: 1010 - 70, width: 140, height: 140, borderRadius: 70, background: C.ivory, opacity: o, display: 'grid', placeItems: 'center', boxShadow: '0 0 0 2px rgba(23,20,19,.12)' }}>
      <Img src={staticFile('img/logo-ink.png')} style={{ width: 86 }} />
    </div>
  </>
);

/* Del 1: Dag / Aften med bevægelig skillelinje */
const Split: React.FC = () => {
  const f = useCurrentFrame();
  const s = seamAt(f), X = s * W;
  const nightO = interpolate(s, [0.98, 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const a = lerpB(f, [[0.3, 0], [1.3, 1]]), b = lerpB(f, [[3.2, 0], [4.2, 1]]);
  const dayLbl = lerpB(f, [[1, 0], [2, 1]]), nightLbl = lerpB(f, [[4, 0], [5, 1]]);
  const settle = interpolate(f, [0, bf(2)], [1.04, 1], { extrapolateRight: 'clamp', easing: ease });
  // overskriften skaleres med sin side, så den aldrig skæres af
  const fsDay = Math.min(92, (X - 68) / 4.2), fsNight = Math.min(92, (W - X - 68) / 5.0);
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: X, height: H, background: C.day, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${settle})`, transformOrigin: '50% 85%' }}>
          <Look src="penny-l1-model" panelX={0} panelW={X} align="end" />
        </div>
      </div>
      <div style={{ position: 'absolute', left: X, top: 0, width: W - X, height: H, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -X, top: 0, width: W, height: H }}>
          <Look src="noir-m2" panelX={X} panelW={W - X} align="start" />
        </div>
      </div>
      {/* overskriften er delt ved sømmen */}
      <div style={{ position: 'absolute', top: 190, right: W - X + 34, fontFamily: UI, fontSize: fsDay, fontStretch: '92%', letterSpacing: '-0.035em', color: C.dayInk, opacity: a, whiteSpace: 'nowrap', transform: `translateY(${(1 - a) * 20}px)` }}>To sider.</div>
      <div style={{ position: 'absolute', top: 190, left: X + 34, fontFamily: UI, fontSize: fsNight, fontStretch: '92%', letterSpacing: '-0.035em', color: C.nightInk, opacity: b * nightO, whiteSpace: 'nowrap', transform: `translateY(${(1 - b) * 20}px)` }}>Samme dig.</div>
      <Label x={40} y={1680} mood="Dag" name="Penny" color={C.dayInk} align="left" o={dayLbl} />
      <Label x={40} y={1680} mood="Aften" name="Noir" color={C.nightInk} align="right" o={nightLbl * nightO} />
      <Knob x={X} o={nightO * lerpB(f, [[2.5, 0], [3.5, 1]])} />
    </AbsoluteFill>
  );
};

/* Del 2: detaljer på beat – skiftevis Dag og Aften */
const Detail: React.FC<{ src: string; night?: boolean; label: string; w?: number }> = ({ src, night, label, w = 820 }) => {
  const f = useCurrentFrame();
  const sc = interpolate(f, [0, bf(2)], [1.06, 1], { easing: Easing.out(Easing.quad) });
  const t = interpolate(f, [2, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return (
    <AbsoluteFill style={{ background: night ? C.night : C.day, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: w, overflow: 'hidden' }}><Img src={staticFile(`img/${src}.jpg`)} style={{ width: '100%', display: 'block', transform: `scale(${sc})` }} /></div>
      <div style={{ position: 'absolute', bottom: 230, fontFamily: UI, fontSize: 30, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', color: night ? C.nightInk : C.dayInk, opacity: t }}>{label}</div>
    </AbsoluteFill>
  );
};

/* Del 3: lookbook – Noir, Penny, Holly */
const Lookbook: React.FC = () => {
  const f = useCurrentFrame();
  const looks: [string, string, string][] = [['noir-m1', 'Noir', 'Look 01'], ['penny-l3-model', 'Penny', 'Look 02'], ['holly-wine', 'Holly', 'Look 03']];
  const head = lerpB(f, [[0, 0], [1, 1]]);
  return (
    <AbsoluteFill style={{ background: C.ivory, fontFamily: UI }}>
      <div style={{ position: 'absolute', top: 200, left: 60, fontSize: 92, fontStretch: '92%', letterSpacing: '-0.035em', color: C.dayInk, opacity: head }}>Lookbook</div>
      <div style={{ position: 'absolute', top: 320, left: 62, fontSize: 32, color: C.mute, opacity: head }}>Tre kollektioner. To sider af samme garderobe.</div>
      {looks.map(([src, name, no], i) => {
        const o = lerpB(f, [[0.5 + i * 0.75, 0], [1.5 + i * 0.75, 1]]);
        const x = 60 + i * 330, y = 520 + (i === 1 ? 150 : 0);
        return (
          <div key={src} style={{ position: 'absolute', left: x, top: y, width: 300, opacity: o, transform: `translateY(${(1 - o) * 40}px)` }}>
            <div style={{ width: 300, height: 450, background: '#C9B9AA', overflow: 'hidden' }}><Img src={staticFile(`img/${src}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 10%' }} /></div>
            <div style={{ marginTop: 18, fontSize: 22, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.mute }}>{no}</div>
            <div style={{ fontSize: 52, letterSpacing: '-0.03em', color: C.dayInk }}>{name}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* Del 4: slutkort – logoet delt i to farver ved sømmen */
const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  const seam = lerpB(f, [[0, 1], [1.5, 0.5]]) * W;
  const lo = lerpB(f, [[0.5, 0], [1.8, 1]]), t = lerpB(f, [[2, 0], [3, 1]]);
  const logo = (src: string, clip: string) => (
    <Img src={staticFile(`img/${src}.png`)} style={{ position: 'absolute', left: (W - 760) / 2, top: 700, width: 760, opacity: lo, clipPath: clip, transform: `scale(${0.97 + 0.03 * lo})` }} />
  );
  const line = (txt: string, color: string, clip: string) => (
    <div style={{ position: 'absolute', top: 1110, left: 0, right: 0, textAlign: 'center', fontFamily: UI, fontSize: 64, fontStretch: '92%', letterSpacing: '-0.03em', color, opacity: t, clipPath: clip }}>{txt}</div>
  );
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: seam, height: H, background: C.day }} />
      {logo('logo-ink', `inset(0 ${W - seam - (W - 760) / 2}px 0 0)`)}
      {logo('logo-white', `inset(0 0 0 ${seam - (W - 760) / 2}px)`)}
      {line('To sider. Samme dig.', C.dayInk, `inset(0 ${W - seam}px 0 0)`)}
      {line('To sider. Samme dig.', C.nightInk, `inset(0 0 0 ${seam}px)`)}
      {[[C.dayInk, `inset(0 ${W - seam}px 0 0)`], [C.nightInk, `inset(0 0 0 ${seam}px)`]].map(([color, clip]) => (
        <div key={clip} style={{ position: 'absolute', bottom: 170, left: 0, right: 0, textAlign: 'center', fontFamily: UI, fontSize: 26, letterSpacing: '0.18em', textTransform: 'uppercase', color, opacity: t * 0.85, clipPath: clip }}>
          Noir · Penny · Holly — under udvikling
        </div>))}
    </AbsoluteFill>
  );
};

export const ToSider: React.FC<{ bgm: boolean }> = ({ bgm }) => {
  const { durationInFrames } = useVideoConfig();
  const cuts: [number, number, React.ReactNode][] = [
    [0, 16, <Split />],
    [16, 18, <Detail src="penny-d-logo-chest" label="Dag · logo" />],
    [18, 20, <Detail src="freja-lace" night label="Aften · blonde" w={600} />],
    [20, 22, <Detail src="penny-d-stripe" label="Dag · striber" />],
    [22, 24, <Detail src="cleo-lace" night label="Aften · slingback" w={760} />],
    [24, 31, <Lookbook />],
    [31, BEATS, <EndCard />],
  ];
  return (
    <AbsoluteFill style={{ background: C.night }}>
      {cuts.map(([a, b, el], i) => <Sequence key={i} from={bf(a)} durationInFrames={bf(b) - bf(a)}>{el}</Sequence>)}
      {bgm && <Audio src={staticFile('audio/cat-walk.mp3')} startFrom={Math.round(MUSIC_START * FPS)}
        volume={f => interpolate(f, [0, 3, durationInFrames - 40, durationInFrames - 1], [0, 1, 1, 0], { extrapolateRight: 'clamp' })} />}
    </AbsoluteFill>
  );
};
