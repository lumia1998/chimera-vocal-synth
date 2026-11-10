import { lazy, Suspense, useEffect, useState } from "react";
import { useStore } from "./store.ts";
import { engine } from "../audio/AudioEngine.ts";
import { AnatomyView } from "./components/AnatomyView.tsx";
import { TubeView } from "./components/TubeView.tsx";
import { Stroboscope } from "./components/Stroboscope.tsx";
import { SpectrumView } from "./components/SpectrumView.tsx";
import { VowelMap } from "./components/VowelMap.tsx";
import { VoiceControls, VoiceToggles } from "./components/VoiceControls.tsx";
import { Keys } from "./components/Keys.tsx";
import { Segmented, Toggle } from "./components/Controls.tsx";
import { Screen } from "./components/Screen.tsx";
import { SpeakRight, speechInfo, speechSlots, speechWords } from "./components/SpeakPanel.tsx";
import { BestiaryRight } from "./components/BestiaryPanel.tsx";
import { CreatureView } from "./components/CreatureView.tsx";
import { creatureById } from "../wasm/engine.ts";
import { BeatboxRight, BeatOverlay, beatInfo, beatSlots } from "./components/BeatboxPanel.tsx";
import { SingRight, singInfo, singWords } from "./components/SingPanel.tsx";
import { playDemo, DEMO_SONGS } from "./singing.ts";
import type { Mode } from "./store.ts";
import type { BodyName } from "../worklet/protocol.ts";
import { BodyPad } from "./components/BodyPad.tsx";
import { bodyLabel, presetOf, PRESETS } from "./body.ts";

// three.js only loads when the 3D view is first shown
const AnatomyView3D = lazy(() => import("./components/AnatomyView3D.tsx").then((m) => ({ default: m.AnatomyView3D })));
// the duet page (`?show=<id>`): two 3D heads replaying a pre-rendered song
const DuetPage = lazy(() => import("./components/DuetPage.tsx").then((m) => ({ default: m.DuetPage })));

/** the show to play, from `?show=<id>` (a plain folder name under public/shows) */
function showId(): string | null {
  const id = new URLSearchParams(window.location.search).get("show");
  return id && /^[\w-]+$/.test(id) ? id : null;
}

function TopBar() {
  const started = useStore((s) => s.started);
  const starting = useStore((s) => s.starting);
  const start = useStore((s) => s.start);
  const body = useStore((s) => s.body);
  const setBody = useStore((s) => s.setBody);
  const volume = useStore((s) => s.volume);
  const setVolume = useStore((s) => s.setVolume);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const [load, setLoad] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLoad(engine.load), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark">Chimera</span>
        <span className="tagline">由模拟声道长出的声音</span>
      </div>
      <Segmented<Mode>
        label="模式"
        value={mode}
        onChange={setMode}
        options={[
          { value: "play", label: "演奏" },
          { value: "speak", label: "说话" },
          { value: "sing", label: "唱歌" },
          { value: "bestiary", label: "动物" },
          { value: "beatbox", label: "节奏口技" },
        ]}
      />
      {mode !== "bestiary" && (
        <div className="body-control">
          <Segmented<BodyName>
            label="体型"
            value={presetOf(body)}
            onChange={(b) => setBody(PRESETS[b])}
            options={[
              { value: "male", label: "男声" },
              { value: "female", label: "女声" },
              { value: "child", label: "童声" },
            ]}
          />
          <BodyPad />
        </div>
      )}
      <div className="topbar-right">
        <label className="volume">
          <span>音量</span>
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ "--pos": `${volume * 100}%` } as React.CSSProperties} />
        </label>
        {started ? (
          <span className="load" title="模拟占音频线程时间预算的比例">
            引擎负载 {Math.round(load * 100)} %
          </span>
        ) : (
          <button className="primary" onClick={() => void start()} disabled={starting}>
            {starting ? "启动中…" : "启动音频"}
          </button>
        )}
        <a className="repo-link" href="https://github.com/jamesondh/chimera-vocal-synth" target="_blank" rel="noreferrer" aria-label="源代码（GitHub）" title="源代码（GitHub）">
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
        </a>
      </div>
    </header>
  );
}

function ViewToggles() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const bestiary = useStore((s) => s.mode === "bestiary");
  return (
    <div className="view-toggles">
      {!bestiary && <Toggle label="3D" checked={view.threeD} onChange={(v) => setView({ threeD: v })} />}
      <Toggle label="声压" checked={view.pressure} onChange={(v) => setView({ pressure: v })} />
      {!bestiary && <Toggle label="气流" checked={view.particles} onChange={(v) => setView({ particles: v })} />}
      <Toggle label={bestiary ? "标签" : "测量"} checked={view.calipers} onChange={(v) => setView({ calipers: v })} />
      {!bestiary && <Toggle label="网格" checked={view.grid} onChange={(v) => setView({ grid: v })} />}
    </div>
  );
}

function StartPrompt() {
  const started = useStore((s) => s.started);
  const starting = useStore((s) => s.starting);
  const err = useStore((s) => s.startError);
  const start = useStore((s) => s.start);
  const setHold = useStore((s) => s.setHold);
  const mode = useStore((s) => s.mode);
  const playCall = useStore((s) => s.playCall);
  const creature = useStore((s) => s.creature);
  const setBeatPlaying = useStore((s) => s.setBeatPlaying);
  if (started) return null;
  const copy = {
    bestiary: ["每种动物的声音都来自它自己的声源和声道模拟。", "启动并听一声", "然后点它的叫声，或按住琴键持续发声。"],
    beatbox: ["这里的每个鼓点都是嘴里的声音：嘴唇、舌头和喉咙在推气、闭气、吸气。", "启动节拍", "然后编辑节奏、敲打击垫，或用琴键哼低音。"],
    speak: ["这里每个声音都是空气穿过喉咙、嘴和鼻子模拟出来的。", "启动声音", "然后输入文字按朗读，或点辅音表里的音。"],
    sing: ["这里每个声音都是空气穿过喉咙、嘴和鼻子模拟出来的。", "启动并听一首歌", "然后弹琴键：每个音唱歌词的下一个音节。"],
  }[mode as "bestiary" | "beatbox" | "speak" | "sing"] ?? ["这里每个声音都是空气穿过喉咙、嘴和鼻子模拟出来的。", "吸气并启动", "然后拖动舌头、嘴唇或下颌，或弹琴键。"];
  return (
    <div className="start-prompt" data-layout="overlay">
      <p>{copy[0]}</p>
      <button
        className="primary large"
        disabled={starting}
        onClick={async () => {
          // the demo waits for audio itself, so a stop meanwhile (body, mode) cancels it
          if (mode === "sing") return void playDemo(DEMO_SONGS[0].name, useStore.getState().body, start);
          await start();
          const first = creatureById(creature)?.calls[0];
          if (mode === "bestiary" && first) playCall(first.id);
          else if (mode === "beatbox") setBeatPlaying(true);
          else if (mode === "play") setHold(true);
        }}
      >
        {starting ? "启动中…" : copy[1]}
      </button>
      {err ? <p className="error">音频无法启动：{err}。请刷新页面再试。</p> : <p className="hint">{copy[2]}</p>}
    </div>
  );
}

/** The tall left screen: the face (or the creature) with its overlays. */
function LeftScreen() {
  const mode = useStore((s) => s.mode);
  const body = useStore((s) => s.body);
  const threeD = useStore((s) => s.view.threeD);
  const bestiary = mode === "bestiary";
  const Face = threeD ? AnatomyView3D : AnatomyView;
  return (
    <Screen
      className="left"
      focus
      title={bestiary ? "动物" : "声道"}
      sub={bestiary ? "气道 / 实时" : `${bodyLabel(body)} / ${threeD ? "3D" : "正中矢状面"}`}
      label={bestiary ? "实时动物气道" : "实时声道"}
      tools={<ViewToggles />}
    >
      <Suspense fallback={null}>
        {bestiary ? <CreatureView /> : mode === "speak" ? <Face slots={speechSlots} info={speechInfo} overlay={speechWords} /> : mode === "sing" ? <Face info={singInfo} overlay={singWords} /> : mode === "beatbox" ? <Face slots={beatSlots} info={beatInfo} showFormants={false} /> : <Face />}
      </Suspense>
      {mode === "beatbox" && <BeatOverlay />}
      <StartPrompt />
    </Screen>
  );
}

function PlayRight() {
  const f0 = useStore((s) => s.source.f0);
  return (
    <div className="right right-play">
      <Screen className="s-tube" title="声道" sub="声门到嘴唇">
        <TubeView />
      </Screen>
      <Screen className="s-folds" title="声带" sub="慢放 100×">
        <Stroboscope />
      </Screen>
      <Screen className="s-spec" title="频谱" sub="共振">
        <SpectrumView />
      </Screen>
      <Screen className="s-vowels" title="元音" sub="F1 / F2">
        <VowelMap />
      </Screen>
      <Screen className="s-voice" title="嗓音" tools={<VoiceToggles />}>
        <VoiceControls />
      </Screen>
      <Screen className="s-keys" title="琴键" sub={`${Math.round(f0)} Hz`}>
        <Keys />
      </Screen>
    </div>
  );
}

export function App() {
  const show = showId();
  if (show)
    return (
      <Suspense fallback={null}>
        <DuetPage id={show} />
      </Suspense>
    );
  return <Wall />;
}

function Wall() {
  const mode = useStore((s) => s.mode);
  return (
    <div className={`app text-colors mode-${mode}`}>
      <TopBar />
      <main className={`wall wall-${mode}`}>
        <LeftScreen />
        {mode === "play" ? <PlayRight /> : mode === "speak" ? <SpeakRight /> : mode === "sing" ? <SingRight /> : mode === "beatbox" ? <BeatboxRight /> : <BestiaryRight />}
      </main>
    </div>
  );
}
