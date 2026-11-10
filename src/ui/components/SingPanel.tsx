import { useStore } from "../store.ts";
import { useSing, playDemo, stopSinging, soundingSyllable, sungNow, DEMO_SONGS } from "../singing.ts";
import { mouthWords } from "../mouthWords.ts";
import { V } from "../colors.ts";
import { Keys } from "./Keys.tsx";
import { PianoRoll } from "./PianoRoll.tsx";
import { SpectrumView } from "./SpectrumView.tsx";
import { Chip, Screen } from "./Screen.tsx";
import { EncoderPages } from "./Encoder.tsx";
import { noteName } from "./VoiceControls.tsx";
import type { InfoFn } from "./AnatomyView.tsx";

/** epilarynx narrowing for the singer's ring (measured: +3 to +12 dB at 2.4–3.6 kHz, adult male) */
const RING = 0.85;

/** the syllable being sung now: the demo's, or the one the held key is singing */
function syllableNow(): string | null {
  const s = useSing.getState();
  if (s.demo) return s.syllables[s.demoAt]?.text ?? null;
  return soundingSyllable();
}

/** the syllable being sung, at the mouth */
export const singWords = mouthWords(sungNow, V.green);

/** Sing mode's lines over the face: the note, the syllable, the ring */
export const singInfo: InfoFn = (_m, _f, tele) => {
  const out: string[] = [];
  if (tele && tele.t.voicing > 0.3) out.push(`音高 ${noteName(tele.t.f0)} ${tele.t.f0.toFixed(0)} Hz`);
  const syl = syllableNow();
  if (syl) out.push(`音节 ${syl}`);
  out.push(useStore.getState().artic.epilarynx >= RING - 0.05 ? "咽紧开" : "咽紧关");
  return out;
};

function Lyrics() {
  const lyrics = useSing((s) => s.lyrics);
  const syllables = useSing((s) => s.syllables);
  const cursor = useSing((s) => s.cursor);
  const demo = useSing((s) => s.demo);
  const demoAt = useSing((s) => s.demoAt);
  const setLyrics = useSing((s) => s.setLyrics);
  const setCursor = useSing((s) => s.setCursor);
  const at = demo ? demoAt : -1;
  const done = demo ? demoAt : cursor;
  return (
    <div className="lyrics">
      <textarea
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        rows={1}
        aria-label="要唱的歌词"
        placeholder="输入要唱的歌词"
        title="每个音唱下一个音节。按住前一个键再按下一个键可连唱。单独的“-”把元音延续到后面的音；连字符可按你的方式切词。"
      />
      <div className="syllables" role="group" aria-label="音节。每个音唱标记的音节；点另一个可从那里开始。">
        {syllables.map((s, i) => (
          <span key={i} className={`syl-wrap${s.wordEnd ? " word-end" : ""}`}>
            <button
              className={`syl${!demo && i === cursor ? " next" : ""}${i === at ? " now" : ""}${i < done ? " sung" : ""}${s.melisma ? " held" : ""}`}
              onClick={() => setCursor(i)}
              aria-current={!demo && i === cursor ? "step" : undefined}
              title={s.melisma ? "延长的元音：把上一个音节带到这个音" : `从“${s.text}”开始唱`}
            >
              {s.text}
            </button>
            {s.phraseEnd && (
              <span className="breath-mark" aria-label="换气">
                ’
              </span>
            )}
          </span>
        ))}
        {!syllables.length && <span className="dim">没有歌词：琴键唱“啊”。</span>}
        <Chip toggle={false} className="from-start" onClick={() => setCursor(0)} disabled={cursor === 0 && !demo}>
          从头开始
        </Chip>
      </div>
    </div>
  );
}

function SongControls() {
  const source = useStore((s) => s.source);
  const setSource = useStore((s) => s.setSource);
  const epilarynx = useStore((s) => s.artic.epilarynx);
  const setArtic = useStore((s) => s.setArtic);
  const vibrato = useSing((s) => s.vibrato);
  const setVibrato = useSing((s) => s.setVibrato);
  return (
    <EncoderPages
      label="歌声"
      pages={[
        {
          name: "歌声",
          encoders: [
            { label: "颤音", value: vibrato, min: 0, max: 80, onChange: (v) => setVibrato(Math.round(v)), format: (v) => ({ value: String(Math.round(v)), unit: "cents" }) },
            { label: "频率", value: source.vibratoRate, min: 3.5, max: 7.5, onChange: (v) => setSource({ vibratoRate: v }), format: (v) => ({ value: v.toFixed(1), unit: "Hz" }) },
            { label: "气声", value: source.breathiness, min: 0, max: 1, onChange: (v) => setSource({ breathiness: v }), format: (v) => ({ value: String(Math.round(v * 100)), unit: "%" }) },
            // the singer's ring narrows the tube just above the folds, adding the bright band near 3 kHz
            { label: "咽紧", value: epilarynx, min: 0, max: 1, onChange: (v) => setArtic({ epilarynx: v }), format: (v) => ({ value: String(Math.round(v * 100)), unit: "%" }) },
          ],
        },
        {
          name: "音色",
          encoders: [{ label: "明亮", value: source.brightness, min: 0, max: 1, onChange: (v) => setSource({ brightness: v }), format: (v) => ({ value: String(Math.round(v * 100)), unit: "%" }) }],
        },
      ]}
    />
  );
}

function DemoSongs() {
  const body = useStore((s) => s.body);
  const start = useStore((s) => s.start);
  const demo = useSing((s) => s.demo);
  return (
    <div className="demo-songs" role="group" aria-label="示例歌曲">
      {DEMO_SONGS.map((s) => (
        <Chip
          key={s.name}
          on={demo === s.name}
          onClick={async () => {
            if (demo === s.name) {
              stopSinging();
              return;
            }
            await playDemo(s.name, body, start);
          }}
        >
          {demo === s.name ? `停止“${s.name}”` : s.name}
        </Chip>
      ))}
    </div>
  );
}

/** Sing mode's right column: the piano roll, the lyrics, the spectrum with the ring, the song voice, the keys. */
export function SingRight() {
  const ring = useStore((s) => s.artic.epilarynx >= RING - 0.05);
  const next = useSing((s) => (s.demo ? null : (s.syllables[s.cursor]?.text ?? null)));
  return (
    <div className="right right-sing">
      <Screen className="s-roll" title="钢琴卷帘" sub="音符与实际唱出的音高">
        <PianoRoll />
      </Screen>
      <Screen className="s-lyrics" title="歌词" sub="每个音唱下一个音节" tools={<DemoSongs />}>
        <Lyrics />
      </Screen>
      <Screen className="s-spec" title="频谱" sub={ring ? "咽紧开" : ""}>
        <SpectrumView ring={ring} />
      </Screen>
      <Screen className="s-voice" title="嗓音">
        <SongControls />
      </Screen>
      <Screen className="s-keys" title="琴键" sub={next ? `下一个：${next}` : ""}>
        <Keys />
      </Screen>
    </div>
  );
}
