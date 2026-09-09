// 56초 BGM + 효과음을 OfflineAudioContext 로 합성 → bgm.wav. 모든 큐는 scene.html 의 타임라인(초)과 맞춘다.
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage(); await page.goto('about:blank');
  const res = await page.evaluate(async () => {
    const SR = 44100, DUR = 56.0;
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * DUR), SR);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    const master = ctx.createGain(); master.gain.value = 0.85; comp.connect(master); master.connect(ctx.destination);
    const bus = comp;
    const nf = n => 440 * Math.pow(2, (n - 69) / 12);
    // ── 기본 합성기
    function tone({ type='sine', f0, f1, t, dur, g=0.3, a=0.01, d, lp, q=1, pan=0 }) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const G = ctx.createGain(); G.gain.setValueAtTime(0.0001, t); G.gain.exponentialRampToValueAtTime(g, t + a); G.gain.setValueAtTime(g, t + Math.max(a, dur - (d ?? dur*0.6))); G.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o; if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = q; o.connect(f); node = f; }
      const P = ctx.createStereoPanner(); P.pan.value = pan; node.connect(G); G.connect(P); P.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    }
    const noiseBuf = (() => { const b = ctx.createBuffer(1, SR * 2, SR); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
    function noise({ t, dur, g=0.2, type='bandpass', f=1000, f1, q=1, a=0.005 }) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const F = ctx.createBiquadFilter(); F.type = type; F.frequency.setValueAtTime(f, t); if (f1) F.frequency.exponentialRampToValueAtTime(f1, t + dur); F.Q.value = q;
      const G = ctx.createGain(); G.gain.setValueAtTime(0.0001, t); G.gain.exponentialRampToValueAtTime(g, t + a); G.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(F); F.connect(G); G.connect(bus); s.start(t); s.stop(t + dur + 0.05);
    }
    function pad(notes, t0, t1, { g=0.12, lp=700, a=1.5, r=1.2, type='sawtooth' } = {}) {
      notes.forEach((n, i) => [-6, 6].forEach(det => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = nf(n); o.detune.value = det;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const G = ctx.createGain();
        G.gain.setValueAtTime(0.0001, t0); G.gain.exponentialRampToValueAtTime(g / notes.length, t0 + a); G.gain.setValueAtTime(g / notes.length, t1 - r); G.gain.exponentialRampToValueAtTime(0.0001, t1);
        o.connect(f); f.connect(G); G.connect(bus); o.start(t0); o.stop(t1 + 0.1); }));
    }
    const kick = (t, g=0.8) => { tone({ f0: 160, f1: 42, t, dur: 0.32, g, a: 0.002, d: 0.3 }); noise({ t, dur: 0.03, g: 0.25, type: 'lowpass', f: 2500 }); };
    const hat = (t, g=0.07) => noise({ t, dur: 0.035, g, type: 'highpass', f: 8000, a: 0.001 });
    const clap = (t, g=0.22) => { [0, 0.012, 0.024].forEach(o => noise({ t: t + o, dur: 0.12, g: g * 0.7, type: 'bandpass', f: 1800, q: 1.2, a: 0.001 })); };
    const marimba = (t, n, g=0.25) => { tone({ f0: nf(n), t, dur: 0.4, g, a: 0.003, d: 0.38 }); tone({ f0: nf(n) * 4, t, dur: 0.12, g: g * 0.25, a: 0.002, d: 0.1 }); };
    const bell = (t, n, g=0.18, dur=1.2) => { tone({ f0: nf(n), t, dur, g, a: 0.004, d: dur * 0.95 }); tone({ f0: nf(n) * 2.76, t, dur: dur * 0.5, g: g * 0.15, a: 0.003, d: dur * 0.45 }); };
    const thud = t => { tone({ f0: 140, f1: 48, t, dur: 0.18, g: 0.7, a: 0.002, d: 0.16 }); noise({ t, dur: 0.06, g: 0.3, type: 'lowpass', f: 1200 }); };
    const bwomp = t => tone({ type: 'sawtooth', f0: 240, f1: 95, t, dur: 0.55, g: 0.16, a: 0.02, d: 0.35, lp: 900 });
    const tick = (t, g=0.1, f=2400) => tone({ f0: f, t, dur: 0.012, g, a: 0.001, d: 0.01 });
    const cricket = (t, len=0.5) => { for (let x = 0; x < len; x += 1 / 14) noise({ t: t + x, dur: 0.035, g: 0.05, type: 'bandpass', f: 4300, q: 9, a: 0.002 }); };

    // ── 0~19.5 «아무 일도» 구간: 드론 + 귀뚜라미 + 반전 효과음
    pad([33, 40], 0.0, 24.8, { g: 0.10, lp: 160, a: 2.0, r: 2.5 });         // 낮은 드론(A1·E2)
    for (let i = 0; i < 19; i++) tick(1.3 + i / 12, 0.08, 3200 + (i % 3) * 300);   // 타자 소리
    [3.3, 4.6, 5.9, 7.1].forEach(t => cricket(t, 0.5));
    // 실란
    noise({ t: 9.4, dur: 0.85, g: 0.16, type: 'lowpass', f: 300, f1: 3500 });        // 불붙는 휘익
    tone({ f0: 700, f1: 90, t: 10.25, dur: 0.1, g: 0.5, a: 0.002, d: 0.08 });        // 펑
    thud(10.55); bwomp(10.65);
    // SF6 — 가속 틱, 되감기, 스탬프
    for (let x = 0, i = 0; x < 2.1; i++) { tick(12.2 + x, 0.09, 1800 + i * 12); x += Math.max(0.035, 0.13 - i * 0.004); }
    tone({ f0: 2200, f1: 180, t: 14.35, dur: 0.28, g: 0.2, a: 0.003, d: 0.2 });      // 되감기 zip
    thud(14.75); bwomp(14.85);
    // 라인 정지 경고 — 그래도 안 멈춘다
    for (let t = 17.3; t < 18.35; t += 0.167) tone({ type: 'square', f0: 880, t, dur: 0.11, g: 0.08, a: 0.002, d: 0.1, lp: 3000 });
    thud(18.55); bwomp(18.65);
    // ── 19.5~27 스크러버 등장: 따뜻한 패드 + 거품
    pad([57, 60, 64, 69], 19.7, 27.3, { g: 0.16, lp: 650, a: 1.6, r: 0.6 });        // Am
    tone({ f0: 60, t: 20.0, dur: 4.5, g: 0.05, a: 0.5, d: 1.0 });                    // 웅— 허밍
    for (let i = 0; i < 10; i++) tone({ f0: 800 + (i % 3) * 120, f1: 1500, t: 20.6 + i * 0.3, dur: 0.07, g: 0.06, a: 0.003, d: 0.06 });
    bell(21.0, 76, 0.12, 0.8); bell(21.12, 81, 0.12, 1.0);                          // 반짝
    for (let t = 26.0; t < 27.0; t += 0.3) hat(t, 0.05);
    // ── 27.0~46.5 비트 100BPM: 킥·햇·클랩·베이스·코드
    const BPM = 100, B = 60 / BPM, T0 = 27.0, BARS = 8; const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
    for (let bar = 0; bar < BARS; bar++) { const tb = T0 + bar * 4 * B; const ch = prog[bar % 4];
      for (let b = 0; b < 4; b++) { const t = tb + b * B; if (t > 46.3) continue; kick(t, b === 0 ? 0.85 : 0.7); hat(t + B / 2, 0.07); hat(t, 0.045); if (bar >= 1 && (b === 1 || b === 3)) clap(t);
        // 베이스 8분음표
        [0, B / 2].forEach(o => tone({ type: 'sawtooth', f0: nf(ch[0] - 12), t: t + o, dur: B / 2 * 0.9, g: 0.16, a: 0.005, d: B / 2 * 0.5, lp: 320 }));
        if (b === 0 || b === 2) ch.forEach(n => tone({ type: 'sawtooth', f0: nf(n), t, dur: 0.28, g: 0.045, a: 0.004, d: 0.25, lp: 1400 })); } }
    // 창업: 통장 카운터 아르페지오 → 띵 → 반짝
    for (let i = 0; i < 13; i++) tone({ f0: nf(69 + (i % 5) * 2 + Math.floor(i / 5) * 3), t: 28.1 + i * 0.1, dur: 0.08, g: 0.06, a: 0.002, d: 0.07 });
    bell(29.45, 93, 0.16, 0.6); [29.7, 29.78, 29.86].forEach((t, i) => bell(t, 96 + i * 4, 0.08, 0.35));
    // 코스닥: 라이저 → 캐시 딩
    noise({ t: 32.6, dur: 1.15, g: 0.09, type: 'bandpass', f: 500, f1: 5000, q: 2 }); tone({ f0: 300, f1: 1000, t: 32.6, dur: 1.15, g: 0.05, a: 0.05, d: 0.3 });
    bell(33.78, 96, 0.16, 0.7); bell(33.86, 100, 0.14, 0.9);
    // 지도: 핀마다 마림바 상행
    [72, 74, 76, 79, 81, 84, 86, 88, 91, 93].forEach((n, i) => marimba(35.9 + i * 0.55, n, 0.24));
    // 수출의 탑: 계단마다 상승 + 트로피 팡파르 + 심벌
    for (let i = 0; i < 5; i++) { const t = 41.8 + i * 0.55; tone({ f0: 220 * Math.pow(1.26, i), f1: 330 * Math.pow(1.26, i), t, dur: 0.2, g: 0.18, a: 0.003, d: 0.15, lp: 3000 }); thud(t); }
    [72, 76, 79, 84].forEach((n, i) => tone({ type: 'triangle', f0: nf(n), t: 44.6 + i * 0.07, dur: 0.6, g: 0.16, a: 0.005, d: 0.5 }));
    noise({ t: 44.6, dur: 1.6, g: 0.16, type: 'highpass', f: 6000, a: 0.002 });
    // ── 46.5~56 마무리: 장조 패드 + 차임
    pad([48, 52, 55, 60, 64], 46.4, 55.9, { g: 0.2, lp: 900, a: 2.2, r: 1.5 });      // C major
    tone({ f0: 65.4, t: 46.4, dur: 9.4, g: 0.06, a: 1.0, d: 2.0 });                  // 베이스 C
    bell(47.0, 76, 0.13, 1.4); bell(49.6, 79, 0.13, 1.6);
    [72, 76, 79, 84].forEach((n, i) => bell(52.0 + i * 0.09, n, 0.13, 1.4));
    [88, 91, 96].forEach((n, i) => bell(53.3 + i * 0.07, n, 0.08, 0.7));
    bell(55.0, 84, 0.1, 1.0);
    const buf = await ctx.startRendering();
    // 피크 정규화(-1dBFS) 뒤 16bit WAV
    const ch = buf.numberOfChannels, n = buf.length; const chans = []; let peak = 0;
    for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); chans.push(d); for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); }
    const k = peak > 0 ? 0.89 / peak : 1;
    const bytes = 44 + n * ch * 2, ab = new ArrayBuffer(bytes), dv = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * ch * 2, true);
    let off = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i] * k)); dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
    const u8 = new Uint8Array(ab); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { b64: btoa(bin), peak, bytes };
  });
  fs.writeFileSync('bgm.wav', Buffer.from(res.b64, 'base64')); console.log('bgm.wav', res.bytes, 'bytes, raw peak', res.peak.toFixed(3));
  await browser.close();
})();
