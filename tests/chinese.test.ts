/**
 * Mandarin text front-end: Hanzi and tone-marked/numbered pinyin become IPA segments with the
 * tone on the nucleus and Mandarin's aspiration contrast on the onset.
 */
import { describe, expect, test } from "bun:test";
import { chineseToPhrases } from "../src/ui/chinese.ts";

const flat = async (text: string) => {
    const r = await chineseToPhrases(text);
    return { r, segs: r.phrases.flatMap((p) => p.segments) };
};

describe("chinese G2P", () => {
    test("Hanzi: polyphones, 3-3 sandhi, and a pinyin transcription", async () => {
        const { r, segs } = await flat("你好");
        expect(r.transcription).toBe("ní hǎo");
        expect(r.phrases[0].words).toEqual(["你", "好"]);
        expect(segs.map((s) => s.ipa)).toEqual(["n", "i", "x", "aʊ"]);
        expect(segs.map((s) => s.tone)).toEqual([undefined, 2, undefined, 3]);
        expect(segs.filter((s) => s.wordEnd)).toHaveLength(2);
    });

    test("retroflex affricates, the apical vowel and the neutral tone", async () => {
        const { segs } = await flat("中文");
        expect(segs.map((s) => s.ipa)).toEqual(["ʈʂ", "ʊ", "ŋ", "u", "ə", "n"]);
        expect(segs[0].aspirated).toBe(false); // zh is unaspirated
        expect(segs[1].tone).toBe(1); // zhōng
        expect(segs[4].tone).toBe(2); // wén
    });

    test("j/q/x use the alveolo-palatal affricate and fricative; q is aspirated", async () => {
        const qu = await flat("去");
        expect(qu.segs.map((s) => s.ipa)).toEqual(["tɕ", "y"]);
        expect(qu.segs[0].aspirated).toBe(true);
        expect(qu.segs[1].tone).toBe(4);

        const xue = await flat("学");
        expect(xue.segs.map((s) => s.ipa)).toEqual(["ɕ", "y", "ɛ"]);
        expect(xue.segs[0].aspirated).toBeUndefined(); // a fricative, not a stop
        expect(xue.segs[2].tone).toBe(2); // the tone sits on the nucleus, not the medial
    });

    test("unaspirated b/d/g versus aspirated p/t/k", async () => {
        const yi = await flat("一个");
        expect(yi.segs.map((s) => s.ipa)).toEqual(["i", "k", "ɤ"]);
        expect(yi.segs[0].tone).toBe(2); // 一 before a 4th tone
        expect(yi.segs[1].aspirated).toBe(false); // g
        expect(yi.segs[2].tone).toBe(4);

        const bu = await flat("不对");
        expect(bu.segs.map((s) => s.ipa)).toEqual(["p", "u", "t", "u", "eɪ"]);
        expect(bu.segs[0].aspirated).toBe(false); // b
        expect(bu.segs[1].tone).toBe(2); // 不 before a 4th tone, tone on the u
        expect(bu.segs[2].aspirated).toBe(false); // d
        expect(bu.segs[4].tone).toBe(4);
    });

    test("tone-marked pinyin is parsed like Hanzi", async () => {
        const { r, segs } = await flat("nǐ hǎo");
        expect(r.transcription).toBe("nǐ hǎo");
        expect(segs.filter((s) => s.tone !== undefined).map((s) => s.tone)).toEqual([2, 3]); // 3-3 sandhi
        expect(segs.map((s) => s.ipa)).toEqual(["n", "i", "x", "aʊ"]);
    });

    test("spelling contractions iu / ui / un keep their vowels", async () => {
        const jiu = await flat("九");
        expect(jiu.segs.map((s) => s.ipa)).toEqual(["tɕ", "i", "oʊ"]);
        expect(jiu.segs[2].tone).toBe(3);

        const dui = await flat("对");
        expect(dui.segs.map((s) => s.ipa)).toEqual(["t", "u", "eɪ"]);
        expect(dui.segs[2].tone).toBe(4);

        const lun = await flat("论");
        expect(lun.segs.map((s) => s.ipa)).toEqual(["l", "u", "ə", "n"]);
        expect(lun.segs[2].tone).toBe(4);
    });

    test("erhua written as a pinyin token gets the retroflex coda", async () => {
        const { segs } = await flat("huar1");
        expect(segs.map((s) => s.ipa)).toEqual(["x", "u", "a", "ɻ"]);
        expect(segs[2].tone).toBe(1);
    });

    test("neutral tone is short and level", async () => {
        const { segs } = await flat("妈妈骂马");
        expect(segs.filter((s) => s.tone !== undefined).map((s) => s.tone)).toEqual([1, 0, 4, 3]);
    });

    test("punctuation splits phrases and sets intonation and pause", async () => {
        const { r } = await flat("你好，世界！");
        expect(r.phrases).toHaveLength(2);
        expect(r.phrases[0].pause).toBe(0.18);
        expect(r.phrases[1].pause).toBe(0.35);
        expect(r.phrases[0].intonation).toBe("statement");
        const q = await flat("你好吗？");
        expect(q.r.phrases[0].intonation).toBe("question");
    });

    test("unsupported text does not throw and produces no phrase", async () => {
        const { r } = await flat("abc 123");
        expect(r.phrases).toHaveLength(0);
    });
});
