import { useEffect, useState } from "react";
import { useStore } from "../store.ts";
import { speakText, speakPhrases, stopSpeaking, onPlan, currentPlan, spokenWordNow, type InputLanguage } from "../speech.ts";
import { mouthWords } from "../mouthWords.ts";
import { tokenizeIpa } from "../../wasm/engine.ts";
import { Segmented, Slider } from "./Controls.tsx";
import { Chip, Screen } from "./Screen.tsx";
import { ScoreView, planNow } from "./ScoreView.tsx";
import { TubeView } from "./TubeView.tsx";
import { Stroboscope } from "./Stroboscope.tsx";
import type { InfoFn, SlotsFn } from "./AnatomyView.tsx";
import { V } from "../colors.ts";
import { engine } from "../../audio/AudioEngine.ts";

const EXAMPLES: Record<InputLanguage, string[]> = {
  zh: ["你好，很高兴见到你。", "今天天气怎么样？", "每一种声音都是空气穿过喉咙和嘴巴。", "你好 ni3 hao3，也可以输入带声调的拼音。"],
  en: ["Hello. Can you hear me?", "She sells sea shells by the sea shore.", "Every sound here is air moving through a throat.", "The quick brown fox jumps over the lazy dog."],
  ipa: ["ˈhɛloʊ", "ˈni ˈxaʊ", "ˈɑpɑ", "ˈmɑmɑ"],
};

// IPA pulmonic consonant chart (rows = manner, columns = place); empty cells are null
const PLACES = ["双唇", "唇齿", "齿", "龈", "龈后", "卷舌", "硬腭", "软腭", "小舌", "咽", "声门"];
/** short headings for the chart's narrow columns (the full names are the cells' titles) */
const PLACE_SHORT = ["双唇", "唇齿", "齿", "龈", "龈后", "卷舌", "硬腭", "软腭", "小舌", "咽", "声门"];
const MANNER_ZH: Record<string, string> = { Plosive: "塞音", Nasal: "鼻音", Trill: "颤音", Tap: "闪音", Fricative: "擦音", "Lateral fricative": "边擦音", Approximant: "近音", Lateral: "边音" };
const CHART: [string, (string | null)[][]][] = [
  ["Plosive", [["p", "b"], [null, null], [null, null], ["t", "d"], [null, null], ["ʈ", "ɖ"], ["c", "ɟ"], ["k", "g"], ["q", "ɢ"], [null, null], ["ʔ", null]]],
  ["Nasal", [[null, "m"], [null, "ɱ"], [null, null], [null, "n"], [null, null], [null, "ɳ"], [null, "ɲ"], [null, "ŋ"], [null, "ɴ"], [null, null], [null, null]]],
  ["Trill", [[null, "ʙ"], [null, null], [null, null], [null, "r"], [null, null], [null, null], [null, null], [null, null], [null, "ʀ"], [null, null], [null, null]]],
  ["Tap", [[null, null], [null, null], [null, null], [null, "ɾ"], [null, null], [null, "ɽ"], [null, null], [null, null], [null, null], [null, null], [null, null]]],
  ["Fricative", [["ɸ", "β"], ["f", "v"], ["θ", "ð"], ["s", "z"], ["ʃ", "ʒ"], ["ʂ", "ʐ"], ["ç", "ʝ"], ["x", "ɣ"], ["χ", "ʁ"], ["ħ", "ʕ"], ["h", "ɦ"]]],
  ["Lateral fricative", [[null, null], [null, null], [null, null], ["ɬ", "ɮ"], [null, null], [null, null], [null, null], [null, null], [null, null], [null, null], [null, null]]],
  ["Approximant", [[null, null], [null, "ʋ"], [null, null], [null, "ɹ"], [null, null], [null, "ɻ"], [null, "j"], [null, "ɰ"], [null, null], [null, null], [null, null]]],
  ["Lateral", [[null, null], [null, null], [null, null], [null, "l"], [null, null], [null, "ɭ"], [null, "ʎ"], [null, null], [null, null], [null, null], [null, null]]],
];

/** the segment sounding now in the current utterance */
function soundingSegment(): string | null {
  const sp = currentPlan();
  const now = planNow(sp);
  if (!sp || now < 0) return null;
  return sp.plan.segments.find((s) => now >= s.t0 && now < s.t1)?.ipa ?? null;
}

/** Speak mode's readouts under the chin: the sound being made, jaw, lip shape, soft palate */
/** the word being spoken, at the mouth */
export const speechWords = mouthWords(spokenWordNow, V.white);

export const speechSlots: SlotsFn = (_m, a, f) => {
  const sound = soundingSegment();
  const lips = a.lipAp < 0.05 ? "闭" : a.lipWidth < 0.55 ? "圆" : a.lipAp > 1.3 ? "开" : "展";
  return [
    sound ? { label: "声音", value: sound, color: V.green, ipa: true } : { label: "声音", value: "-", color: V.green },
    { label: "下颌", value: a.jaw.toFixed(1), unit: "cm", color: V.red },
    { label: "嘴唇", value: lips, color: V.pink },
    { label: "软腭", value: f.velumPort > 0.02 ? "开" : "闭", color: V.white },
  ];
};

/** what the voice is doing: voiced or not, where the noise is, the lungs */
export const speechInfo: InfoFn = (m, _f, tele) => {
  if (!tele) return [];
  const t = tele.t;
  const out = [t.voicing > 0.3 ? `有声 ${t.f0.toFixed(0)} Hz` : "无声"];
  if (t.noiseLevel > 1 && t.noiseNode >= 0) {
    const s = m.branchS(t.noiseNode, t.phLen, t.orLen);
    if (s >= 0) out.push(`噪声位置 ${s.toFixed(1)} cm`);
  }
  out.push(`肺压 ${t.pLung.toFixed(1)} cmH₂O`);
  return out;
};

function ConsonantChart(props: { onPad: (c: string) => void }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(engine.latest ? soundingSegment() : null), 60);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="chart-scroll">
      <table className="ipa-chart">
        <thead>
          <tr>
            <th />
            {PLACES.map((p, i) => (
              <th key={p} scope="col" title={p} aria-label={p}>
                {PLACE_SHORT[i]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CHART.map(([manner, cells]) => (
            <tr key={manner}>
              <th scope="row" title={MANNER_ZH[manner] ?? manner} aria-label={MANNER_ZH[manner] ?? manner}>
                {MANNER_ZH[manner] ?? manner}
              </th>
              {cells.map((pair, i) => (
                <td key={i}>
                  {pair.map((sym, j) =>
                    sym ? (
                      <button key={j} className={`ipa${sym === now ? " now" : ""}`} onClick={() => props.onPad(sym)} title="放在两个元音之间读">
                        {sym}
                      </button>
                    ) : (
                      <span key={j} className="ipa-empty" />
                    ),
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Speak mode's right column: what to say, the gestural score, the consonant chart, the tube and folds. */
export function SpeakRight() {
  const body = useStore((s) => s.body);
  const f0 = useStore((s) => s.source.f0);
  const start = useStore((s) => s.start);
  const [lang, setLang] = useState<InputLanguage>("zh");
  const [text, setText] = useState(EXAMPLES.zh[0]);
  const [rate, setRate] = useState(1);
  const [busy, setBusy] = useState(false);
  const [trans, setTrans] = useState(currentPlan()?.transcription ?? "");
  const [vowel, setVowel] = useState("ɑ");
  useEffect(() => onPlan((p) => setTrans(p?.transcription ?? "")), []);

  const changeLang = (l: InputLanguage) => {
    setLang(l);
    setText(EXAMPLES[l][0]);
  };
  const speak = async () => {
    setBusy(true);
    try {
      await start();
      await speakText(text, { lang, body, rate, f0 });
    } finally {
      setBusy(false);
    }
  };
  const pad = async (c: string) => {
    await start();
    speakPhrases([{ segments: tokenizeIpa(`ˈ${vowel}${c}${vowel}`), intonation: "flat" }], { body, rate, f0 });
  };

  return (
    <div className="right right-speak">
      <Screen
        className="s-say"
        title="说"
        sub="文字转语音"
        tools={
          <Segmented<InputLanguage>
            label="输入语言"
            value={lang}
            onChange={changeLang}
            options={[
              { value: "zh", label: "中文" },
              { value: "en", label: "English" },
              { value: "ipa", label: "IPA" },
            ]}
          />
        }
      >
        <div className="say">
          <div className="say-row">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void speak();
                e.stopPropagation();
              }}
              rows={2}
              spellCheck={lang !== "ipa"}
              aria-label={lang === "zh" ? "要说的中文或拼音" : lang === "ipa" ? "要说的 IPA" : "要说的英文"}
              placeholder={
                lang === "zh"
                  ? "输入汉字，或带声调的拼音（nǐ hǎo / ni3 hao3）"
                  : lang === "ipa"
                    ? "输入 IPA，例如 ˈhɛloʊ"
                    : "输入要朗读的英文"
              }
            />
            <div className="say-actions">
              <button className="primary" onClick={() => void speak()} disabled={busy}>
                {busy ? "准备中…" : "朗读"}
              </button>
              <button className="ghost" onClick={stopSpeaking}>
                停止
              </button>
            </div>
          </div>
          <div className="say-row">
            <p className="transcription" aria-live="polite">
              {trans ? (lang === "zh" ? `拼音：${trans}` : `/${trans}/`) : "转写会显示在这里。"}
            </p>
            <div className="say-rate">
              <Slider label="语速" value={rate} min={0.5} max={1.8} onChange={setRate} format={(v) => `${v.toFixed(2)}×`} />
            </div>
          </div>
          <div className="examples" role="group" aria-label="示例">
            {EXAMPLES[lang].map((ex) => (
              <Chip key={ex} toggle={false} onClick={() => setText(ex)}>
                {ex}
              </Chip>
            ))}
          </div>
        </div>
      </Screen>
      <Screen className="s-score" title="姿态谱">
        <ScoreView />
      </Screen>
      <Screen
        className="s-chart"
        title="辅音"
        sub="放在两个元音之间"
        tools={
          <div className="vowel-pick" role="group" aria-label="所用元音">
            {["ɑ", "i", "u", "ə"].map((v) => (
              <Chip key={v} on={vowel === v} onClick={() => setVowel(v)} className="ipa-chip">
                {v}
              </Chip>
            ))}
          </div>
        }
      >
        <ConsonantChart onPad={(c) => void pad(c)} />
      </Screen>
      <Screen className="s-tube" title="声道" sub="声门到嘴唇">
        <TubeView />
      </Screen>
      <Screen className="s-folds" title="声带" sub="慢放 100×">
        <Stroboscope />
      </Screen>
    </div>
  );
}
