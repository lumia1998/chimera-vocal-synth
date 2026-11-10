import { memo } from "react";
import { useStore } from "../store.ts";
import { CREATURES, creatureById } from "../../wasm/engine.ts";
import type { CreatureDef } from "../../wasm/types.ts";
import { useLiveCreature } from "../creatureLive.ts";
import { Keys } from "./Keys.tsx";
import { Chip, Screen } from "./Screen.tsx";
import { EncoderPages, type EncoderPage } from "./Encoder.tsx";
import { Spectrogram } from "./Spectrogram.tsx";
import { CreatureTubes } from "./CreatureTubes.tsx";

/** Chinese display names for the engine's creature and call ids (the engine keeps the English data). */
const CREATURE_ZH: Record<string, string> = { songbird: "鸣禽", seal: "威德尔海豹", alligator: "美洲鳄", elephant: "非洲象" };
const CALL_ZH: Record<string, string> = {
  "songbird:flute": "笛声短句", "songbird:trill": "金丝雀颤音", "songbird:chirps": "啁啾瀑布", "songbird:buzz": "雀类嗡鸣",
  "seal:trill": "下行颤音", "seal:zap": "激光啁啾", "seal:whistle": "U 形口哨", "seal:chug": "低沉噗声",
  "alligator:bellow": "吼叫", "alligator:growl": "低吼", "alligator:hiss": "嘶声", "alligator:dance": "水舞",
  "elephant:rumble": "次声隆隆", "elephant:trumpet": "号角", "elephant:squeak": "尖鸣",
};
const creatureZh = (id: string, name: string) => CREATURE_ZH[id] ?? name;
const callZh = (creature: string, id: string, name: string) => CALL_ZH[`${creature}:${id}`] ?? name;

/** Thumbnail: the creature's outline in blue with its airway traced in amber. */
const Thumb = memo(function Thumb({ def }: { def: CreatureDef }) {
  const v = def.visual;
  const vw = v.view.x1 - v.view.x0, vh = v.view.y1 - v.view.y0;
  const pad = Math.max(vw, vh) * 0.06;
  const stroke = Math.max(vw, vh) * 0.012;
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${x},${-y}`).join(" ");
  return (
    <svg className="thumb" viewBox={`${v.view.x0 - pad} ${-v.view.y1 - pad} ${vw + 2 * pad} ${vh + 2 * pad}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <polygon points={pts(v.silhouette)} fill="none" stroke="var(--blue)" strokeWidth={stroke} strokeLinejoin="round" />
      {v.tubes.map((t) => (
        <polyline key={t.tube} points={pts(t.path)} fill="none" stroke="var(--amber)" strokeWidth={stroke * 0.9} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
});

function Gallery() {
  const creature = useStore((s) => s.creature);
  const setCreature = useStore((s) => s.setCreature);
  return (
    <div className="specimens">
      {CREATURES.map((c) => (
        <button key={c.id} className={`specimen${c.id === creature ? " on" : ""}`} onClick={() => setCreature(c.id)} aria-pressed={c.id === creature}>
          <Thumb def={c} />
          <span className="specimen-name">{creatureZh(c.id, c.name)}</span>
          <span className="specimen-latin">{c.latin}</span>
        </button>
      ))}
    </div>
  );
}

function Calls({ def }: { def: CreatureDef }) {
  const playCall = useStore((s) => s.playCall);
  const hold = useStore((s) => s.hold);
  const setHold = useStore((s) => s.setHold);
  const keyCall = useStore((s) => s.keyCall);
  const setKeyCall = useStore((s) => s.setKeyCall);
  const live = useLiveCreature(def.id);
  return (
    <div className="calls-body">
      <div className="calls">
        {def.calls.map((c) => (
          <button key={c.id} className={`call${live?.call === c.id ? " playing" : ""}`} onClick={() => playCall(c.id)} title={c.hint}>
            <span className="call-name">{callZh(def.id, c.id, c.name)}</span>
          </button>
        ))}
        <button className={`call sustain${hold ? " on" : ""}`} onClick={() => setHold(!hold)} aria-pressed={hold} title="保持气息，用控制改变声音">
          <span className="call-name">{hold ? "停止持续" : "持续发声"}</span>
        </button>
      </div>
      <div className="keys-mode" role="radiogroup" aria-label="琴键演奏什么">
        <span className="dim">琴键演奏</span>
        <Chip toggle={false} role="radio" aria-checked={keyCall === null} on={keyCall === null} onClick={() => setKeyCall(null)}>
          持续嗓音
        </Chip>
        {def.calls.map((c) => (
          <Chip key={c.id} toggle={false} role="radio" aria-checked={keyCall === c.id} on={keyCall === c.id} onClick={() => setKeyCall(c.id)}>
            {callZh(def.id, c.id, c.name)}
          </Chip>
        ))}
      </div>
      <p className="creature-blurb">{def.blurb}</p>
    </div>
  );
}

function fmt(v: number, p: CreatureDef["params"][number]): { value: string; unit: string } {
  const digits = p.digits ?? (p.max - p.min <= 2 ? 2 : v < 100 && p.log ? 1 : 0);
  return { value: v.toFixed(digits), unit: p.unit ?? "" };
}

function Params({ def }: { def: CreatureDef }) {
  const cparams = useStore((s) => s.cparams[def.id]);
  const setCParam = useStore((s) => s.setCParam);
  const live = useLiveCreature(def.id);
  // while a call plays, the encoders follow its automation; afterwards they return to yours
  const calling = !!live?.call;
  const pages: EncoderPage[] = [];
  for (let i = 0; i < def.params.length; i += 4) {
    pages.push({
      name: String(pages.length + 1),
      encoders: def.params.slice(i, i + 4).map((p) => {
        const mine = cparams?.[p.key] ?? p.default;
        return { label: p.label, value: calling ? (live!.params[p.key] ?? mine) : mine, min: p.min, max: p.max, log: p.log, onChange: (v: number) => setCParam(p.key, v), format: (v: number) => fmt(v, p) };
      }),
    });
  }
  return (
    <>
      {/* a sentence, too long for the header: it wraps here instead of being cut off there */}
      {def.role && <p className="cparams-role">{def.role}</p>}
      <EncoderPages key={def.id} label={`${creatureZh(def.id, def.name)} 控制`} pages={pages} />
    </>
  );
}

/** Bestiary's right column: the creatures, the waterfall, the calls, the controls, the airway, the keys. */
export function BestiaryRight() {
  const creature = useStore((s) => s.creature);
  const def = creatureById(creature);
  return (
    <div className="right right-bestiary">
      <Screen className="s-gallery" title="动物" sub={`${CREATURES.length} 种`}>
        <Gallery />
      </Screen>
      <Screen className="s-wf" title="频谱图" sub="叫声的瀑布图">
        <Spectrogram />
      </Screen>
      <Screen className="s-calls" title="叫声">
        {def && <Calls def={def} />}
      </Screen>
      <Screen className="s-cparams" title="控制">
        {def && <Params def={def} />}
      </Screen>
      <Screen className="s-airway" title="气道" sub="每根管道展开">
        <CreatureTubes />
      </Screen>
      <Screen className="s-keys s-keys-compact" title="琴键" sub="持续嗓音或叫声，按键的音高">
        <Keys />
      </Screen>
    </div>
  );
}
