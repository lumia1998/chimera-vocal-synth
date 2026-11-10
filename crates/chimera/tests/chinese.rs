//! Mandarin support: the new affricates tokenise as one segment, lexical tone becomes an F0
//! contour, and the planner honours an explicit aspiration flag instead of the English rule.
use chimera::control::score::ControlKey;
use chimera::phonetics::ipa::tokenize_ipa;
use chimera::phonetics::planner::{PlanOptions, plan_utterance};
use chimera::phonetics::Segment;
use chimera::voice::human_voice::HumanVoice;

const FS: f64 = 48000.0;

fn opts() -> PlanOptions {
    PlanOptions { body: "male".into(), t0: 0.05, f0: Some(110.0), ..Default::default() }
}

fn seg(ipa: &str) -> Segment {
    Segment { ipa: ipa.into(), stress: Some(0), ..Default::default() }
}

fn tone(ipa: &str, tone: u8, dur: f64) -> Segment {
    Segment { ipa: ipa.into(), stress: Some(0), tone: Some(tone), dur: Some(dur), ..Default::default() }
}

#[test]
fn the_new_affricates_are_one_segment() {
    let s = tokenize_ipa("ʈʂɨ tɕi ɕi");
    let ipa: Vec<&str> = s.iter().map(|s| s.ipa.as_str()).collect();
    assert_eq!(ipa, ["ʈʂ", "ɨ", "tɕ", "i", "ɕ", "i"]);
}

#[test]
fn a_mandarin_tone_writes_an_f0_contour() {
    // 你好: ni3 xao3, but keep the second tone 3 to see the dip
    let input = [seg("n"), tone("i", 3, 0.24), seg("x"), tone("aʊ", 3, 0.24)];
    let plan = plan_utterance(&input, &opts());
    let f0: Vec<f64> = plan
        .gestures
        .iter()
        .filter_map(|g| g.targets.get(ControlKey::F0))
        .collect();
    assert!(f0.len() >= 3, "expected a contour, got {f0:?}");
    assert!(f0.iter().any(|x| *x < 100.0), "tone 3 must dip: {f0:?}");
    assert!(f0.iter().any(|x| *x >= 109.0), "tone 3 must rise again: {f0:?}");
    assert!(plan.gestures.iter().any(|g| g.label.as_ref().is_some_and(|l| l.as_str() == "tone")));
}

#[test]
fn explicit_aspiration_overrides_the_english_rule() {
    let abduction = |aspirated: Option<bool>| {
        let mut p = seg("p");
        p.aspirated = aspirated;
        let plan = plan_utterance(&[p, seg("a")], &opts());
        plan.gestures
            .iter()
            .find(|g| g.label.as_ref().is_some_and(|l| l.as_str() == "aspiration"))
            .and_then(|g| g.targets.get(ControlKey::ABDUCTION))
            .expect("a stop's aspiration gesture")
    };
    assert!((abduction(Some(false)) - 0.22).abs() < 1e-9, "unaspirated p");
    assert!((abduction(Some(true)) - 0.36).abs() < 1e-9, "aspirated p");
}

#[test]
fn a_tone_phrase_sounds() {
    let input = [seg("n"), tone("i", 3, 0.24), seg("x"), tone("aʊ", 3, 0.24)];
    let plan = plan_utterance(&input, &opts());
    let mut v = HumanVoice::with_defaults(FS);
    v.schedule(&plan.gestures);
    let n = (FS * (plan.end + 0.25)).round() as usize;
    let mut out = vec![0.0f32; n];
    let mut i = 0;
    while i < n {
        let m = 128.min(n - i);
        v.render(&mut out[i..i + m]);
        i += m;
    }
    assert!(out.iter().all(|x| x.is_finite()));
    let peak = out.iter().fold(0.0f32, |m, x| m.max(x.abs()));
    assert!(peak > 0.05, "the phrase was silent (peak {peak})");
}
