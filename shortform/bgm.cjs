// BGM · 효과음을 OfflineAudioContext 로 합성 → bgm.wav / bgm-short.wav
//   node bgm.cjs [full|short]
//
// ⚠ 큐 시각은 timeline.js 의 «큐 기준(base)» 축에 적는다. 장면 길이를 바꿔도 여기는 손대지 않는다.
//   M(t)  = 큐 기준 → 출력 시각. 빠진 장면(짧은 버전)의 큐는 null 이라 소리도 함께 빠진다.
//   Mc(t) = 같은 변환이되 빠진 장면이면 그 자리로 접는다 — 여러 장면에 걸친 패드용.
// ⚠ 드럼은 예외로 «출력 시각»에 직접 얹는다. 장면마다 압축률이 다르면 박자가 휘어 곡이 깨진다.
const { chromium } = require('playwright');
const fs = require('fs');
const TL = require('./timeline.js');

const MODE = (process.argv[2] === 'short') ? 'short' : 'full';
const P = TL.build(MODE);
const OUT = MODE === 'short' ? 'bgm-short.wav' : 'bgm.wav';

function Mc(tCue) {                   // 빠진 장면이면 표시 순서상 그 자리로 접는다(여러 장면에 걸친 패드용)
  const r = TL.toOut(tCue, P);
  if (r !== null) return r;
  let a = 0;
  for (const s of TL.SCENES) {
    if (tCue >= s.cue0 && tCue < s.cue0 + s.base) return a;
    const d = MODE === 'short' ? s.short : s.full; if (d > 0) a += d;
  }
  return P.DUR;
}
const M = tb => TL.toOut(tb, P);      // null = 그 장면이 빠졌다

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(); await page.goto('about:blank');

  // 큐를 Node 에서 «출력 시각»으로 미리 풀어 넘긴다 — 브라우저 안에서는 매핑을 몰라도 된다
  const cue = [];
  const at   = (tb, kind, arg = {}) => { const t = M(tb); if (t !== null) cue.push({ t, kind, ...arg }); };
  const span = (tb0, tb1, kind, arg = {}) => { const a = Mc(tb0), b = Mc(tb1); if (b - a > 0.05) cue.push({ t: a, t1: b, kind, ...arg }); };

  // ── 0~20 «아무 일도» 네 박자 : 드론 · 타자 · 귀뚜라미 · 반전 효과음
  span(0.0, 24.9, 'pad', { notes: [33, 40], g: 0.10, lp: 160, a: 2.0, r: 2.5 });
  for (let i = 0; i < 19; i++) at(1.3 + i / 12, 'tick', { g: 0.08, f: 3200 + (i % 3) * 300 });
  [4.5, 5.4, 6.0].forEach(t => at(t, 'cricket'));
  at(8.2, 'whoosh'); at(8.8, 'pop'); at(9.15, 'thud'); at(9.25, 'bwomp');              // 실란
  for (let x = 0, i = 0; x < 1.7; i++) { at(10.4 + x, 'tick', { g: 0.09, f: 1800 + i * 12 }); x += Math.max(0.035, 0.13 - i * 0.005); }
  at(12.15, 'zip'); at(12.5, 'thud'); at(12.6, 'bwomp');                                // SF6
  for (let i = 0; i < 11; i++) at(13.5 + i * 0.14, 'wob', { f: 620 + (i % 2 ? 140 : -110) });
  at(14.3, 'cold'); at(15.05, 'bell', { n: 88, g: 0.16, d: 0.8 }); at(15.12, 'bell', { n: 93, g: 0.1, d: 0.6 });
  at(15.5, 'thud'); at(15.6, 'bwomp');                                                  // 칠러
  for (let t = 17.8; t < 18.85; t += 0.167) at(t, 'beep');
  at(18.95, 'thud'); at(19.05, 'bwomp');                                                // 라인 정지
  // ── 우리 기계의 이름(큐 축 62.2~65.2) — 표시 위치는 반전 바로 뒤다
  span(62.3, 65.1, 'pad', { notes: [55, 59, 62, 67], g: 0.17, lp: 820, a: 0.8, r: 0.9 });
  span(62.6, 65.0, 'strings', { notes: [74, 79], g: 0.05 });
  [79, 83, 86, 91].forEach((n, i) => at(62.9 + i * 0.22, 'bell', { n, g: 0.15, d: 1.2 }));
  at(64.1, 'bell', { n: 72, g: 0.13, d: 1.5 }); at(64.18, 'bell', { n: 76, g: 0.10, d: 1.3 });

  // ── 20~26.8 스크러버·칠러 등장
  span(20.2, 27.3, 'pad', { notes: [57, 60, 64, 69], g: 0.16, lp: 650, a: 1.5, r: 0.6 });
  span(20.4, 24.6, 'hum', { f: 60, g: 0.05 });
  for (let i = 0; i < 9; i++) at(20.9 + i * 0.3, 'blip', { f: 800 + (i % 3) * 120 });
  at(21.35, 'bell', { n: 76, g: 0.12, d: 0.8 }); at(22.75, 'bell', { n: 83, g: 0.11, d: 0.9 });
  for (let t = 26.0; t < 26.8; t += 0.3) at(t, 'hat', { g: 0.05 });
  // ── 창업·상장·지도·수출의 탑 : 화면에 붙는 소리(비트는 아래에서 따로)
  for (let i = 0; i < 13; i++) at(27.8 + i * 0.1, 'blip', { f: 440 * Math.pow(2, ((69 + (i % 5) * 2 + Math.floor(i / 5) * 3) - 69) / 12), g: 0.06, dur: 0.08 });
  at(29.25, 'bell', { n: 93, g: 0.16, d: 0.6 }); [29.5, 29.58, 29.66].forEach((t, i) => at(t, 'bell', { n: 96 + i * 4, g: 0.08, d: 0.35 }));
  span(31.7, 32.8, 'riser');
  at(32.88, 'bell', { n: 96, g: 0.16, d: 0.7 }); at(32.96, 'bell', { n: 100, g: 0.14, d: 0.9 });
  [72, 74, 76, 79, 81, 84, 86, 88, 91, 93].forEach((n, i) => at(34.7 + i * 0.45, 'marimba', { n, g: 0.24 }));
  for (let i = 0; i < 5; i++) { at(39.9 + i * 0.5, 'step', { i }); at(39.9 + i * 0.5, 'thud'); }
  [72, 76, 79, 84].forEach((n, i) => at(42.4 + i * 0.07, 'tri', { n, g: 0.16, dur: 0.55 }));
  at(42.4, 'cymbal');
  // ── 43.8~47.0 다음 25년(액침냉각) : 물에 잠기는 소리 + 밝아지는 패드
  span(43.9, 47.4, 'pad', { notes: [60, 64, 67, 71], g: 0.17, lp: 900, a: 0.9, r: 0.7 });
  at(44.1, 'dive');                                                                     // 풍덩
  for (let i = 0; i < 14; i++) at(44.5 + i * 0.16, 'bubble', { i });
  at(45.0, 'bell', { n: 88, g: 0.13, d: 1.1 }); at(46.0, 'bell', { n: 91, g: 0.11, d: 1.0 });
  // ── 47.0~52.2 공로 : 비트를 끄고 현(絃)을 얹는다
  span(46.9, 52.5, 'pad', { notes: [53, 57, 60, 65], g: 0.19, lp: 780, a: 1.2, r: 0.8 });
  span(46.9, 52.3, 'hum', { f: 55, g: 0.05 });
  span(47.6, 52.4, 'strings', { notes: [72, 76, 79] });
  [76, 79, 83, 86].forEach((n, i) => at(47.8 + i * 0.55, 'bell', { n, g: 0.14, d: 1.1 }));
  at(50.6, 'bell', { n: 88, g: 0.12, d: 1.4 });
  // ── 52.2~62.2 마무리 : 장조 + 계열 3사 차임
  span(52.1, 62.1, 'pad', { notes: [48, 52, 55, 60, 64], g: 0.20, lp: 900, a: 2.0, r: 1.5 });
  span(52.1, 62.0, 'hum', { f: 65.4, g: 0.06 });
  span(52.6, 62.0, 'strings', { notes: [79, 84, 88], g: 0.055 });
  at(52.6, 'bell', { n: 76, g: 0.13, d: 1.4 }); at(55.0, 'bell', { n: 79, g: 0.13, d: 1.6 });
  [72, 76, 79, 84].forEach((n, i) => at(57.2 + i * 0.09, 'bell', { n, g: 0.13, d: 1.4 }));
  at(58.4, 'bell', { n: 84, g: 0.10, d: 0.9 });
  [79, 83, 88].forEach((n, i) => at(58.9 + i * 0.22, 'bell', { n, g: 0.10, d: 0.8 }));   // GST · EST · ROBOCARE
  [88, 91, 96].forEach((n, i) => at(60.0 + i * 0.07, 'bell', { n, g: 0.08, d: 0.7 }));
  at(61.2, 'bell', { n: 84, g: 0.10, d: 1.0 });

  // 드럼은 출력 시각에 직접 — 장면 압축률이 달라도 박자가 안 휜다
  const beat = { from: P.T.found[0], to: P.T.stairs[1] };

  const res = await page.evaluate(async ({ cue, beat, DUR }) => {
    const SR = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * DUR), SR);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    const master = ctx.createGain(); master.gain.value = 0.85; comp.connect(master); master.connect(ctx.destination);
    const bus = comp;
    const nf = n => 440 * Math.pow(2, (n - 69) / 12);
    function tone({ type = 'sine', f0, f1, t, dur, g = 0.3, a = 0.01, d, lp, q = 1 }) {
      if (t + dur > DUR) dur = Math.max(0.02, DUR - t); if (t >= DUR) return;
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const G = ctx.createGain(); G.gain.setValueAtTime(0.0001, t); G.gain.exponentialRampToValueAtTime(g, t + a);
      G.gain.setValueAtTime(g, t + Math.max(a, dur - (d ?? dur * 0.6))); G.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o; if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = q; o.connect(f); node = f; }
      node.connect(G); G.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    }
    const nb = (() => { const b = ctx.createBuffer(1, SR * 2, SR); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
    function noise({ t, dur, g = 0.2, type = 'bandpass', f = 1000, f1, q = 1, a = 0.005 }) {
      if (t >= DUR) return; if (t + dur > DUR) dur = Math.max(0.02, DUR - t);
      const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
      const F = ctx.createBiquadFilter(); F.type = type; F.frequency.setValueAtTime(f, t); if (f1) F.frequency.exponentialRampToValueAtTime(f1, t + dur); F.Q.value = q;
      const G = ctx.createGain(); G.gain.setValueAtTime(0.0001, t); G.gain.exponentialRampToValueAtTime(g, t + a); G.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(F); F.connect(G); G.connect(bus); s.start(t); s.stop(t + dur + 0.05);
    }
    const pad = (notes, t0, t1, { g = 0.12, lp = 700, a = 1.5, r = 1.2 } = {}) =>
      notes.forEach(n => [-6, 6].forEach(det => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = nf(n); o.detune.value = det;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const G = ctx.createGain();
        const A = Math.min(a, (t1 - t0) * 0.4), R = Math.min(r, (t1 - t0) * 0.4);
        G.gain.setValueAtTime(0.0001, t0); G.gain.exponentialRampToValueAtTime(g / notes.length, t0 + A);
        G.gain.setValueAtTime(g / notes.length, t1 - R); G.gain.exponentialRampToValueAtTime(0.0001, t1);
        o.connect(f); f.connect(G); G.connect(bus); o.start(t0); o.stop(t1 + 0.1); }));
    // 현(絃) — 느린 어택 + 비브라토. 감정 구간이 «합성음»으로 들리지 않게 하는 층이다.
    const strings = (notes, t0, t1, g = 0.06) => notes.forEach((n, i) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = nf(n);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6 + i * 0.3;
      const lg = ctx.createGain(); lg.gain.value = 3.2; lfo.connect(lg); lg.connect(o.detune);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; f.Q.value = 0.7;
      const G = ctx.createGain(); const A = Math.min(1.6, (t1 - t0) * 0.4);
      G.gain.setValueAtTime(0.0001, t0); G.gain.exponentialRampToValueAtTime(g, t0 + A);
      G.gain.setValueAtTime(g, t1 - 1.0); G.gain.exponentialRampToValueAtTime(0.0001, t1);
      o.connect(f); f.connect(G); G.connect(bus); o.start(t0); lfo.start(t0); o.stop(t1 + 0.1); lfo.stop(t1 + 0.1); });
    const bell = (t, n, g = 0.18, dur = 1.2) => { tone({ f0: nf(n), t, dur, g, a: 0.004, d: dur * 0.95 }); tone({ f0: nf(n) * 2.76, t, dur: dur * 0.5, g: g * 0.15, a: 0.003, d: dur * 0.45 }); };
    const thud = t => { tone({ f0: 140, f1: 48, t, dur: 0.18, g: 0.7, a: 0.002, d: 0.16 }); noise({ t, dur: 0.06, g: 0.3, type: 'lowpass', f: 1200 }); };

    const H = {
      tick:    c => tone({ f0: c.f, t: c.t, dur: 0.012, g: c.g, a: 0.001, d: 0.01 }),
      cricket: c => { for (let x = 0; x < 0.45; x += 1 / 14) noise({ t: c.t + x, dur: 0.035, g: 0.05, type: 'bandpass', f: 4300, q: 9, a: 0.002 }); },
      whoosh:  c => noise({ t: c.t, dur: 0.62, g: 0.16, type: 'lowpass', f: 300, f1: 3500 }),
      pop:     c => tone({ f0: 700, f1: 90, t: c.t, dur: 0.1, g: 0.5, a: 0.002, d: 0.08 }),
      thud:    c => thud(c.t),
      bwomp:   c => tone({ type: 'sawtooth', f0: 240, f1: 95, t: c.t, dur: 0.55, g: 0.16, a: 0.02, d: 0.35, lp: 900 }),
      zip:     c => tone({ f0: 2200, f1: 180, t: c.t, dur: 0.26, g: 0.2, a: 0.003, d: 0.2 }),
      wob:     c => tone({ f0: c.f, t: c.t, dur: 0.09, g: 0.07, a: 0.002, d: 0.08, lp: 4000 }),
      cold:    c => noise({ t: c.t, dur: 0.75, g: 0.05, type: 'bandpass', f: 2600, q: 3 }),
      beep:    c => tone({ type: 'square', f0: 880, t: c.t, dur: 0.11, g: 0.08, a: 0.002, d: 0.1, lp: 3000 }),
      hum:     c => tone({ f0: c.f, t: c.t, dur: c.t1 - c.t, g: c.g, a: Math.min(1.0, (c.t1 - c.t) * 0.3), d: (c.t1 - c.t) * 0.3 }),
      blip:    c => tone({ f0: c.f, f1: c.dur ? null : 1500, t: c.t, dur: c.dur || 0.07, g: c.g || 0.06, a: 0.003, d: 0.06 }),
      bell:    c => bell(c.t, c.n, c.g, c.d),
      riser:   c => { noise({ t: c.t, dur: c.t1 - c.t, g: 0.09, type: 'bandpass', f: 500, f1: 5000, q: 2 }); tone({ f0: 300, f1: 1000, t: c.t, dur: c.t1 - c.t, g: 0.05, a: 0.05, d: 0.3 }); },
      marimba: c => { tone({ f0: nf(c.n), t: c.t, dur: 0.4, g: c.g, a: 0.003, d: 0.38 }); tone({ f0: nf(c.n) * 4, t: c.t, dur: 0.12, g: c.g * 0.25, a: 0.002, d: 0.1 }); },
      step:    c => tone({ f0: 220 * Math.pow(1.26, c.i), f1: 330 * Math.pow(1.26, c.i), t: c.t, dur: 0.2, g: 0.18, a: 0.003, d: 0.15, lp: 3000 }),
      tri:     c => tone({ type: 'triangle', f0: nf(c.n), t: c.t, dur: c.dur, g: c.g, a: 0.005, d: c.dur * 0.8 }),
      cymbal:  c => noise({ t: c.t, dur: 1.3, g: 0.15, type: 'highpass', f: 6000, a: 0.002 }),
      hat:     c => noise({ t: c.t, dur: 0.035, g: c.g, type: 'highpass', f: 8000, a: 0.001 }),
      dive:    c => { noise({ t: c.t, dur: 0.9, g: 0.20, type: 'lowpass', f: 6000, f1: 260 }); tone({ f0: 420, f1: 70, t: c.t, dur: 0.5, g: 0.22, a: 0.004, d: 0.42 }); },
      bubble:  c => { const f = 900 + (c.i % 5) * 260; tone({ f0: f, f1: f * 1.9, t: c.t, dur: 0.075, g: 0.055, a: 0.004, d: 0.07 }); },
      pad:     c => pad(c.notes, c.t, c.t1, { g: c.g, lp: c.lp, a: c.a, r: c.r }),
      strings: c => strings(c.notes, c.t, c.t1, c.g || 0.06),
    };
    for (const c of cue) { const h = H[c.kind]; if (h) h(c); }

    // ── 드럼·베이스·코드 : 출력 시각에 직접(100BPM 고정)
    const B = 60 / 100, prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const kick = (t, g = 0.8) => { tone({ f0: 160, f1: 42, t, dur: 0.32, g, a: 0.002, d: 0.3 }); noise({ t, dur: 0.03, g: 0.25, type: 'lowpass', f: 2500 }); };
    const clap = (t) => [0, 0.012, 0.024].forEach(o => noise({ t: t + o, dur: 0.12, g: 0.154, type: 'bandpass', f: 1800, q: 1.2, a: 0.001 }));
    for (let bar = 0; ; bar++) {
      const tb = beat.from + bar * 4 * B; if (tb >= beat.to) break;
      const ch = prog[bar % 4];
      for (let b = 0; b < 4; b++) {
        const t = tb + b * B; if (t > beat.to - 0.2) break;
        kick(t, b === 0 ? 0.85 : 0.7); H.hat({ t: t + B / 2, g: 0.07 }); H.hat({ t, g: 0.045 });
        if (bar >= 1 && (b === 1 || b === 3)) clap(t);
        [0, B / 2].forEach(o => tone({ type: 'sawtooth', f0: nf(ch[0] - 12), t: t + o, dur: B / 2 * 0.9, g: 0.16, a: 0.005, d: B / 4, lp: 320 }));
        if (b === 0 || b === 2) ch.forEach(n => tone({ type: 'sawtooth', f0: nf(n), t, dur: 0.28, g: 0.045, a: 0.004, d: 0.25, lp: 1400 }));
      }
    }

    const buf = await ctx.startRendering();
    const ch = buf.numberOfChannels, n = buf.length, chans = []; let peak = 0;
    for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); chans.push(d); for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); }
    const k = peak > 0 ? 0.89 / peak : 1;
    const bytes = 44 + n * ch * 2, ab = new ArrayBuffer(bytes), dv = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * ch * 2, true);
    dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * ch * 2, true);
    let off = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, chans[c][i] * k)); dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true); off += 2; }
    const u8 = new Uint8Array(ab); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { b64: btoa(bin), peak, bytes, cues: cue.length };
  }, { cue, beat, DUR: P.DUR });

  fs.writeFileSync(OUT, Buffer.from(res.b64, 'base64'));
  console.log(`${OUT} ${res.bytes} bytes · ${P.DUR}초 · 큐 ${res.cues}개(${MODE}) · raw peak ${res.peak.toFixed(3)}`);
  await browser.close();
})();
