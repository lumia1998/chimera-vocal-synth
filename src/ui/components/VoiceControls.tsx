import { useStore } from "../store.ts";
import { EncoderPages, type EncoderPage } from "./Encoder.tsx";
import { Chip } from "./Screen.tsx";

const NOTE = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const noteName = (f: number) => {
  const m = Math.round(69 + 12 * Math.log2(f / 440));
  return `${NOTE[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
};

const pct = (v: number) => ({ value: String(Math.round(v * 100)), unit: "%" });
const cm = (v: number) => ({ value: v.toFixed(1), unit: "cm" });
const signedCm = (v: number) => ({ value: `${v >= 0 ? "+" : ""}${v.toFixed(1)}`, unit: "cm" });

/**
 * Play mode's controls: the voice and the articulators without a handle, four at a time
 * (OP-1 style). Values live in the store as before.
 */
export function VoiceControls() {
  const s = useStore((st) => st.source);
  const setSource = useStore((st) => st.setSource);
  const a = useStore((st) => st.artic);
  const setArtic = useStore((st) => st.setArtic);
  const pages: EncoderPage[] = [
    {
      name: "嗓音",
      encoders: [
        { label: "音高", value: s.f0, min: 40, max: 1100, log: true, onChange: (v) => setSource({ f0: v }), format: (v) => ({ value: v.toFixed(0), unit: `Hz ${noteName(v)}` }) },
        { label: "气息", value: s.pressure, min: 2, max: 22, onChange: (v) => setSource({ pressure: v }), format: (v) => ({ value: v.toFixed(1), unit: "cmH₂O" }) },
        { label: "紧张", value: s.tension, min: 0, max: 1, onChange: (v) => setSource({ tension: v }), format: pct },
        { label: "颤音", value: s.vibratoDepth, min: 0, max: 120, onChange: (v) => setSource({ vibratoDepth: v }), format: (v) => ({ value: v.toFixed(0), unit: "cents" }) },
      ],
    },
    {
      name: "音色",
      encoders: [
        { label: "明亮", value: s.brightness, min: 0, max: 1, onChange: (v) => setSource({ brightness: v }), format: pct },
        { label: "气声", value: s.breathiness, min: 0, max: 1, onChange: (v) => setSource({ breathiness: v }), format: pct },
        { label: "粗糙", value: s.roughness, min: 0, max: 1, onChange: (v) => setSource({ roughness: v }), format: pct },
        { label: "气泡音", value: s.fry, min: 0, max: 1, onChange: (v) => setSource({ fry: v }), format: pct },
      ],
    },
    {
      name: "滑音",
      encoders: [{ label: "滑音", value: s.glide, min: 0.005, max: 0.6, log: true, onChange: (v) => setSource({ glide: v }), format: (v) => ({ value: (v * 1000).toFixed(0), unit: "ms" }) }],
    },
    {
      name: "嘴",
      encoders: [
        { label: "圆唇", value: 1 - a.lipWidth, min: 0, max: 1, onChange: (v) => setArtic({ lipWidth: 1 - v }), format: pct },
        { label: "唇开", value: a.lipAp, min: -0.3, max: 2.2, onChange: (v) => setArtic({ lipAp: v }), format: cm },
        { label: "前突", value: a.lipProt, min: -0.1, max: 1.4, onChange: (v) => setArtic({ lipProt: v }), format: cm },
        { label: "下颌", value: a.jaw, min: 0, max: 2.4, onChange: (v) => setArtic({ jaw: v }), format: cm },
      ],
    },
    {
      name: "舌",
      encoders: [
        { label: "舌根", value: a.root, min: -0.9, max: 0.9, onChange: (v) => setArtic({ root: v }), format: signedCm },
        { label: "舌尖卷", value: a.ttCurl, min: 0, max: 1, onChange: (v) => setArtic({ ttCurl: v }), format: pct },
      ],
    },
    {
      name: "喉",
      encoders: [
        { label: "软腭", value: a.velum, min: -0.25, max: 1.2, onChange: (v) => setArtic({ velum: v }), format: (v) => (v <= 0 ? { value: "闭", unit: "" } : { value: v.toFixed(2), unit: "cm²" }) },
        { label: "喉位", value: a.larynx, min: -1.5, max: 1.5, onChange: (v) => setArtic({ larynx: v }), format: signedCm },
        { label: "咽紧", value: a.epilarynx, min: 0, max: 1, onChange: (v) => setArtic({ epilarynx: v }), format: pct },
        { label: "假声带", value: a.ventricular, min: 0, max: 1, onChange: (v) => setArtic({ ventricular: v }), format: pct },
      ],
    },
  ];
  return <EncoderPages label="嗓音" pages={pages} />;
}

/** Hold breath and Whisper, for the voice screen's header. */
export function VoiceToggles() {
  const voiced = useStore((st) => st.source.voiced);
  const setSource = useStore((st) => st.setSource);
  const hold = useStore((st) => st.hold);
  const setHold = useStore((st) => st.setHold);
  return (
    <>
      <Chip on={hold} onClick={() => setHold(!hold)}>
        屏息
      </Chip>
      <Chip on={!voiced} onClick={() => setSource({ voiced: !voiced })}>
        耳语
      </Chip>
    </>
  );
}
