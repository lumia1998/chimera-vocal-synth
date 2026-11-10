/**
 * Mandarin text → phrases of IPA segments.
 *
 * Hanzi goes through `pinyin-pro` (context-sensitive polyphones, 一/不/三声 sandhi); a token of
 * tone-marked or tone-numbered pinyin is parsed directly. The output is the engine's `Segment`
 * shape: the initial carries `aspirated` where Mandarin contrasts it, and the tone-bearing vowel
 * carries `tone` (the planner draws its F0 contour).
 *
 * Not modelled yet: erhua is a separate syllable unless written as `huar`; neutral tone is short
 * and level; tone sandhi across a Hanzi/pinyin boundary is applied here.
 */
import type { Phrase, Segment } from "../wasm/types.ts";

type PinyinPro = typeof import("pinyin-pro");

let pro: Promise<PinyinPro> | null = null;
/** Load `pinyin-pro` on first Chinese use (it is ~1 MB of dictionaries). */
function loadPinyin(): Promise<PinyinPro> {
  return (pro ??= import("pinyin-pro"));
}

interface Syllable {
  /** displayed at the mouth: the Hanzi, or the pinyin token as typed */
  text: string;
  /** tone-marked pinyin for the transcription */
  display: string;
  /** toneless pinyin, for the 一/不 sandhi tests */
  base: string;
  initial: string;
  /** tone-stripped final; `ü` stays `ü` */
  final: string;
  tone: number;
  erhua: boolean;
}

/** initial → IPA. `y`/`w` are spelling, handled by `normalizeFinal`. */
const INITIAL_IPA: Record<string, string> = {
  b: "p", p: "p", m: "m", f: "f",
  d: "t", t: "t", n: "n", l: "l",
  g: "k", k: "k", h: "x",
  j: "tɕ", q: "tɕ", x: "ɕ",
  zh: "ʈʂ", ch: "ʈʂ", sh: "ʂ", r: "ʐ",
  z: "ts", c: "ts", s: "s",
};
/** Mandarin writes aspiration with these initials; the model needs it explicitly. */
const ASPIRATED = new Set(["p", "t", "k", "q", "ch", "c"]);
const UNASPIRATED = new Set(["b", "d", "g", "j", "zh", "z"]);

interface FinalSpec {
  ipa: string[];
  /** index in `ipa` of the tone-bearing vowel */
  tone: number;
}

/** Pinyin final → IPA. Diphthongs use the engine's existing expanding symbols. */
const FINALS: Record<string, FinalSpec> = {
  a: { ipa: ["a"], tone: 0 },
  o: { ipa: ["o"], tone: 0 },
  e: { ipa: ["ɤ"], tone: 0 },
  ê: { ipa: ["ɛ"], tone: 0 },
  er: { ipa: ["ɚ"], tone: 0 },
  ai: { ipa: ["aɪ"], tone: 0 },
  ei: { ipa: ["eɪ"], tone: 0 },
  ao: { ipa: ["aʊ"], tone: 0 },
  ou: { ipa: ["oʊ"], tone: 0 },
  an: { ipa: ["a", "n"], tone: 0 },
  en: { ipa: ["ə", "n"], tone: 0 },
  ang: { ipa: ["ɑ", "ŋ"], tone: 0 },
  eng: { ipa: ["ə", "ŋ"], tone: 0 },
  ong: { ipa: ["ʊ", "ŋ"], tone: 0 },
  i: { ipa: ["i"], tone: 0 },
  ia: { ipa: ["i", "a"], tone: 1 },
  ie: { ipa: ["i", "ɛ"], tone: 1 },
  iao: { ipa: ["i", "aʊ"], tone: 1 },
  iou: { ipa: ["i", "oʊ"], tone: 1 },
  ian: { ipa: ["i", "ɛ", "n"], tone: 1 },
  in: { ipa: ["i", "n"], tone: 0 },
  iang: { ipa: ["i", "ɑ", "ŋ"], tone: 1 },
  ing: { ipa: ["i", "ŋ"], tone: 0 },
  iong: { ipa: ["i", "ʊ", "ŋ"], tone: 1 },
  u: { ipa: ["u"], tone: 0 },
  ua: { ipa: ["u", "a"], tone: 1 },
  uo: { ipa: ["u", "o"], tone: 1 },
  uai: { ipa: ["u", "aɪ"], tone: 1 },
  uei: { ipa: ["u", "eɪ"], tone: 1 },
  uan: { ipa: ["u", "a", "n"], tone: 1 },
  uen: { ipa: ["u", "ə", "n"], tone: 1 },
  uang: { ipa: ["u", "ɑ", "ŋ"], tone: 1 },
  ueng: { ipa: ["u", "ə", "ŋ"], tone: 1 },
  ü: { ipa: ["y"], tone: 0 },
  üe: { ipa: ["y", "ɛ"], tone: 1 },
  üan: { ipa: ["y", "ɛ", "n"], tone: 1 },
  ün: { ipa: ["y", "n"], tone: 0 },
  ɨ: { ipa: ["ɨ"], tone: 0 },
};

const VOWEL = new Set(["a", "ɑ", "e", "ɛ", "i", "o", "u", "y", "ɨ", "ə", "ɤ", "ɚ", "ɔ", "æ", "ʌ", "ʊ", "ɪ", "aɪ", "eɪ", "aʊ", "oʊ", "ɔɪ"]);

/** y/w spelling → the final the IPA table expects. */
function normalizeFinal(initial: string, final: string): string {
  if (initial === "y") {
    switch (final) {
      case "i": return "i";
      case "a": return "ia";
      case "e": return "ie";
      case "ao": return "iao";
      case "ou": return "iou";
      case "an": return "ian";
      case "in": return "in";
      case "ang": return "iang";
      case "ing": return "ing";
      case "ong": return "iong";
      case "u": case "ü": return "ü";
      case "ue": case "üe": return "üe";
      case "uan": case "üan": return "üan";
      case "un": case "ün": return "ün";
      default: return final;
    }
  }
  if (initial === "w") {
    switch (final) {
      case "u": return "u";
      case "a": return "ua";
      case "o": return "uo";
      case "ai": return "uai";
      case "ei": return "uei";
      case "an": return "uan";
      case "en": return "uen";
      case "ang": return "uang";
      case "eng": return "ueng";
      default: return final;
    }
  }
  if (initial === "j" || initial === "q" || initial === "x") {
    if (final === "u") return "ü";
    if (final === "ue") return "üe";
    if (final === "uan") return "üan";
    if (final === "un") return "ün";
    // jiu/qiu/xiu are the iou final; jui/qui/xui do not occur
    if (final === "iu") return "iou";
    if (final === "ui") return "uei";
    return final;
  }
  if ((initial === "z" || initial === "c" || initial === "s" || initial === "zh" || initial === "ch" || initial === "sh" || initial === "r") && final === "i") return "ɨ";
  if (final === "iu") return "iou";
  if (final === "ui") return "uei";
  if (final === "un") return "uen";
  return final;
}

function toneDuration(tone: number): number {
  switch (tone) {
    case 3: return 0.26;
    case 0: case 5: return 0.12;
    case 4: return 0.19;
    default: return 0.21;
  }
}

/** Strip a trailing tone digit (1–5); returns [pinyin, tone|null]. */
function splitTone(token: string): [string, number | null] {
  const m = token.match(/^(.+?)([0-5])$/);
  return m ? [m[1], Number(m[2])] : [token, null];
}

/** One pinyin token (tone-marked or numbered) → a syllable, or null if it is not pinyin. */
function parsePinyinToken(token: string, pp: PinyinPro): Syllable | null {
  const [raw, digit] = splitTone(token);
  let base: string;
  let tone: number;
  try {
    base = pp.convert(raw, { format: "toneNone" }).toLowerCase().replace(/u:/g, "ü").replace(/v/g, "ü");
    // getNumOfTone returns a string; digit is already a number
    tone = digit ?? Number(pp.getNumOfTone(raw));
  } catch {
    return null;
  }
  if (!/^[a-zü:]+$/.test(base)) return null;
  const { initial, final } = pp.getInitialAndFinal(base);
  if (!final) return null;
  let f = final;
  let erhua = false;
  if (f.endsWith("r") && f !== "er") {
    f = f.slice(0, -1);
    erhua = true;
  }
  const finalNorm = normalizeFinal(initial, f);
  if (!FINALS[finalNorm]) return null;
  const display = tone >= 1 && tone <= 4 ? pp.convert(`${base}${tone}`, { format: "numToSymbol" }) : base;
  return { text: token, display, base, initial, final: finalNorm, tone, erhua };
}

/** Hanzi run → syllables (pinyin-pro applies polyphones and 一/不/三声 sandhi). */
function parseHanzi(run: string, pp: PinyinPro): Syllable[] {
  const out: Syllable[] = [];
  for (const d of pp.pinyin(run, { type: "all", toneSandhi: { thirdTone: true } })) {
    if (!d.isZh || !d.final) continue;
    let f = pp.convert(d.final, { format: "toneNone" }).toLowerCase();
    let erhua = false;
    if (f.endsWith("r") && f !== "er") {
      f = f.slice(0, -1);
      erhua = true;
    }
    const finalNorm = normalizeFinal(d.initial, f);
    if (!FINALS[finalNorm]) continue;
    out.push({
      text: d.origin,
      display: d.pinyin,
      base: pp.convert(d.pinyin, { format: "toneNone" }).toLowerCase(),
      initial: d.initial,
      final: finalNorm,
      tone: d.num,
      erhua,
    });
  }
  return out;
}

/** 3-3 → 2-3, and the basic 一/不 sandhi across a mixed Hanzi/pinyin phrase. */
function applySandhi(syls: Syllable[]): void {
  for (let i = 0; i + 1 < syls.length; i++) {
    const s = syls[i];
    const next = syls[i + 1];
    if (s.tone === 3 && next.tone === 3) s.tone = 2;
    if (s.base === "yi" && s.tone === 1) s.tone = next.tone === 4 ? 2 : 4;
    if (s.base === "bu" && s.tone === 4 && next.tone === 4) s.tone = 2;
  }
}

function syllableSegments(s: Syllable): Segment[] {
  const out: Segment[] = [];
  const ipa = INITIAL_IPA[s.initial];
  if (ipa) {
    const onset: Segment = { ipa, stress: 0 };
    if (ASPIRATED.has(s.initial)) onset.aspirated = true;
    else if (UNASPIRATED.has(s.initial)) onset.aspirated = false;
    out.push(onset);
  }
  const spec = FINALS[s.final];
  if (!spec) return out;
  spec.ipa.forEach((sym, i) => {
    const seg: Segment = { ipa: sym, stress: 0 };
    if (VOWEL.has(sym)) {
      if (i === spec.tone) {
        seg.tone = s.tone;
        seg.dur = toneDuration(s.tone);
      } else {
        seg.dur = 0.06;
      }
    }
    out.push(seg);
  });
  if (s.erhua) out.push({ ipa: "ɻ", stress: 0 });
  return out;
}

const PHRASE_PUNCT = new Set("。！？；：，、.!?;:,\n".split(""));
const SENTENCE_PUNCT = new Set("。！？.!?".split(""));
const COMMA_PUNCT = new Set("；：，、;:,".split(""));
const isHan = (c: string) => /\p{Script=Han}/u.test(c);
const isPinyinChar = (c: string) => /[A-Za-zÀ-ɏḀ-ỿ0-9]/.test(c);

function pauseFor(punct: string): number {
  if (SENTENCE_PUNCT.has(punct)) return 0.35;
  if (COMMA_PUNCT.has(punct)) return 0.18;
  return 0.3;
}

export interface ChinesePhrases {
  phrases: Phrase[];
  /** pinyin with tone marks, punctuation kept, phrases separated by " | " */
  transcription: string;
}

/** Hanzi and/or tone-marked/numbered pinyin → phrase segments plus a pinyin transcription. */
export async function chineseToPhrases(text: string): Promise<ChinesePhrases> {
  const pp = await loadPinyin();
  // tone marks arrive decomposed from some input methods; tokenising needs one code point
  const chars = Array.from(text.trim().normalize("NFC"));
  const phrases: Phrase[] = [];
  const transcriptions: string[] = [];
  let syls: Syllable[] = [];

  const flush = (punct: string) => {
    if (!syls.length) return;
    applySandhi(syls);
    const segments: Segment[] = [];
    const words: string[] = [];
    for (const s of syls) {
      const segs = syllableSegments(s);
      if (!segs.length) continue;
      segs[segs.length - 1].wordEnd = true;
      segments.push(...segs);
      words.push(s.text);
    }
    if (!segments.length) {
      syls = [];
      return;
    }
    phrases.push({
      segments,
      intonation: punct.includes("？") || punct.includes("?") ? "question" : "statement",
      pause: pauseFor(punct),
      words,
    });
    const pinyin = syls.map((s) => s.display).join(" ");
    transcriptions.push(pinyin + punct);
    syls = [];
  };

  for (let i = 0; i < chars.length; ) {
    const c = chars[i];
    if (isHan(c)) {
      const start = i;
      while (i < chars.length && isHan(chars[i])) i++;
      syls.push(...parseHanzi(chars.slice(start, i).join(""), pp));
      continue;
    }
    if (isPinyinChar(c)) {
      const start = i;
      while (i < chars.length && isPinyinChar(chars[i])) i++;
      const syl = parsePinyinToken(chars.slice(start, i).join(""), pp);
      if (syl) syls.push(syl);
      continue;
    }
    if (PHRASE_PUNCT.has(c)) {
      flush(c);
      i++;
      continue;
    }
    // spaces, apostrophes and anything else only separate tokens
    i++;
  }
  flush("");
  return { phrases, transcription: transcriptions.join(" | ") };
}
