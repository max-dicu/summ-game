(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Logische Spielgröße – wird per CSS skaliert
  const W = 400, H = 600, GROUND_H = 90;
  const B = 24; // Größe eines Blocks in Pixeln

  // Physik & Level
  const GRAVITY = 1600;   // px/s²
  const FLAP_V = -460;    // Sprung-Geschwindigkeit
  const MAX_FALL = 700;
  const SPEED = 170;      // Scroll-Geschwindigkeit
  const GAP = 220;        // Lücke zwischen den Säulen (größer = leichter)
  const COL_W = B * 3;    // Säulen sind 3 Blöcke breit
  const SPACING = 300;    // Abstand zwischen Säulen (größer = leichter)

  // Boss
  const BOSS_EVERY = 100;  // Portal bei 99, 199 ... -> Boss bei 100, 200 ...
  const BOSS_BONUS = 0;

  // Verwandlungsstufe von Viktor: wird im Browser gespeichert und steigt mit jedem Sieg –
  // auch über Neustarts hinweg. Die Schwierigkeit (bossLevel) beginnt dagegen jedes Spiel neu.
  let bossLook = 0;
  try { bossLook = Number(localStorage.getItem('summ-boss-look')) || 0; } catch (e) {}
  function saveLook() {
    try { localStorage.setItem('summ-boss-look', String(bossLook)); } catch (e) {}
  }

  // Haar-/Aura-Farben, die sich mit jeder Stufe abwechseln
  const HAIR_COLORS = [
    ['#ffd83b', '255,216,59'], ['#fff08a', '255,236,120'], ['#ff5a3c', '255,90,60'],
    ['#6fdcff', '111,220,255'], ['#c58bff', '197,139,255'], ['#f4f4ff', '235,235,255'],
    ['#7dff8a', '125,255,138'], ['#ff8ad8', '255,138,216'],
  ];
  // Jeder Boss heißt Viktor – und mit jedem Mal wird er verrückter (0 = normal, 8 = völlig durchgedreht)
  const crazy = () => Math.min(bossLook, 8);

  // Abschiedssprüche – jedes Mal ein anderer
  const FAREWELLS = [
    'Ich komme wieder!', 'Preis-Leistung von Joyor!', 'Das war nur zum Aufwärmen!',
    'Nächstes Mal kriege ich dich!', 'Tschüssikowski!', 'Bis gleich, Hühnchen!',
    'Wir sehen uns wieder!', 'Hast du Glück gehabt!', 'Ich renn noch ne Runde!',
    'Mir ist so schwindelig!', 'Deine Gedanken gehören mir!', 'Hihihi, bis bald!',
  ];
  // Verrückte Rufe beim Im-Kreis-Rennen
  const CRAZY_LINES = [
    'Wuhuuu!', 'Hihihihi!', 'Ich bin ein Kreisel!', 'Schneller! Schneller!',
    'Joyor Preis-Leistung!', 'Mir ist schwindelig!', 'Lalalala!', 'Rundherum!',
  ];
  let lastFarewell = '';
  function pickFarewell() {
    let line;
    do { line = FAREWELLS[Math.floor(Math.random() * FAREWELLS.length)]; } while (line === lastFarewell);
    lastFarewell = line;
    return [line, 'Viktor kommt wieder – noch verrückter!'];
  }

  function bossStage() {
    const lv = bossLook;
    if (lv === 0) return { hair: null };
    const [hair, aura] = HAIR_COLORS[(lv - 1) % HAIR_COLORS.length];
    return {
      hair, aura,
      bolts: lv >= 2,
      glowEyes: lv >= 3,
      auraSize: 1 + Math.min(lv, 10) * 0.05,
    };
  }

  // Zum Testen: index.html?start=45 startet mit 45 Punkten (Rekord wird dann nicht gespeichert)
  const START_SCORE = Math.max(0, parseInt(new URLSearchParams(location.search).get('start'), 10) || 0);

  // Scharfe Darstellung auf HiDPI-Displays, Pixel-Look für Blöcke
  function setupCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  setupCanvas();
  window.addEventListener('resize', setupCanvas);

  // Rekord speichern (falls Browser-Speicher verfügbar)
  let best = 0;
  try { best = Number(localStorage.getItem('summ-best')) || 0; } catch (e) {}
  function saveBest() {
    if (START_SCORE > 0) return;
    try { localStorage.setItem('summ-best', String(best)); } catch (e) {}
  }

  let muted = false;
  try { muted = localStorage.getItem('summ-muted') === '1'; } catch (e) {}

  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // =====================================================================
  //  AUDIO
  // =====================================================================
  let audio = null;
  let musicGain = null;
  let ambientBus = null; // Musik mit Echo/Hall
  let noiseBuf = null;

  function ensureAudio() {
    if (audio) {
      if (audio.state === 'suspended') audio.resume();
      return;
    }
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      musicGain = audio.createGain();
      musicGain.gain.value = muted ? 0 : 0.35;
      musicGain.connect(audio.destination);

      // Weiches Echo
      ambientBus = audio.createGain();
      ambientBus.connect(musicGain);
      const delay = audio.createDelay(2);
      delay.delayTime.value = 0.55;
      const feedback = audio.createGain();
      feedback.gain.value = 0.38;
      const lowpass = audio.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 1800;
      ambientBus.connect(delay);
      delay.connect(lowpass);
      lowpass.connect(feedback);
      feedback.connect(delay);
      lowpass.connect(musicGain);

      // Rauschen für Snare & Portal
      noiseBuf = audio.createBuffer(1, audio.sampleRate * 0.6, audio.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      setInterval(musicScheduler, 25);
    } catch (e) { audio = null; }
  }

  function beep(freq, dur, type = 'square', vol = 0.06, slideTo = 0) {
    if (muted || !audio) return;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  }
  // ---------- Monster-Geräusche beim Springen (selbst synthetisiert) ----------
  function zombieGroan() {
    const t = audio.currentTime;
    const dur = 0.35 + Math.random() * 0.2;
    const base = 85 + Math.random() * 45;
    const o = audio.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.3, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.75, t + dur);
    // Zittern in der Stimme
    const lfo = audio.createOscillator();
    const lg = audio.createGain();
    lfo.frequency.value = 6 + Math.random() * 5;
    lg.gain.value = 9;
    lfo.connect(lg).connect(o.frequency);
    // „Mund“-Filter: macht aus dem Brummen ein „Uuuargh“
    const f = audio.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(650, t);
    f.frequency.linearRampToValueAtTime(320, t + dur);
    const g = audio.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(audio.destination);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  // Kurzer gefilterter Rausch-Stoß (Baustein für Klappern & Zischen)
  function noiseBurst(t, dur, type, freq, q, vol) {
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    const f = audio.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = audio.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(audio.destination);
    src.start(t, Math.random() * 0.25);
    src.stop(t + dur + 0.02);
  }

  // Skelett: schnelles Knochen-Klappern
  function skeletonRattle() {
    const t = audio.currentTime;
    const n = 5 + Math.floor(Math.random() * 3);
    let s = t;
    for (let i = 0; i < n; i++) {
      noiseBurst(s, 0.02, 'bandpass', 2200 + Math.random() * 1800, 6, 0.6);
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(520 + Math.random() * 200, s);
      o.frequency.exponentialRampToValueAtTime(300, s + 0.03);
      g.gain.setValueAtTime(0.09, s);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.035);
      o.connect(g).connect(audio.destination);
      o.start(s);
      o.stop(s + 0.04);
      s += 0.028 + Math.random() * 0.014;
    }
  }

  // Spinne: Zischen + hektisches Zirpen
  function spiderHiss() {
    const t = audio.currentTime;
    noiseBurst(t, 0.3, 'highpass', 3500, 0.7, 0.2);
    const o = audio.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1500 + Math.random() * 300, t);
    o.frequency.exponentialRampToValueAtTime(1000, t + 0.22);
    const amp = audio.createGain();
    amp.gain.value = 0;
    const lfo = audio.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 30 + Math.random() * 10;
    const lg = audio.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(amp.gain);
    const env = audio.createGain();
    env.gain.setValueAtTime(0.07, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(amp).connect(env).connect(audio.destination);
    o.start(t); lfo.start(t);
    o.stop(t + 0.25); lfo.stop(t + 0.25);
  }

  // Schattenwesen: unheimliches, verzerrtes Teleport-Warpen
  function shadowWarble() {
    const t = audio.currentTime;
    const dur = 0.45;
    for (const det of [0, 7]) {
      const o = audio.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(220 + det, t);
      o.frequency.exponentialRampToValueAtTime(880 + det * 3, t + dur * 0.4);
      o.frequency.exponentialRampToValueAtTime(150, t + dur);
      const lfo = audio.createOscillator();
      lfo.frequency.value = 16 + Math.random() * 6;
      const lg = audio.createGain();
      lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      const g = audio.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    }
    noiseBurst(t, dur, 'bandpass', 900, 1, 0.08);
  }

  const MOB_SOUNDS = [zombieGroan, skeletonRattle, spiderHiss, shadowWarble];

  const sfx = {
    flap: () => {
      if (muted || !audio) return;
      rand(MOB_SOUNDS)();
    },
    score: () => { beep(880, 0.08, 'square', 0.04); setTimeout(() => beep(1320, 0.1, 'square', 0.04), 70); },
    hit: () => beep(220, 0.35, 'sawtooth', 0.07, 60),
    pollen: () => beep(660, 0.12, 'triangle', 0.08, 1320),
    bossHit: () => beep(180, 0.15, 'square', 0.08, 90),
    shoot: () => beep(900, 0.07, 'sawtooth', 0.03, 400),
    warn: () => { beep(440, 0.2, 'square', 0.05); setTimeout(() => beep(330, 0.25, 'square', 0.05), 220); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'square', 0.05), i * 120)),
    portal: () => {
      beep(120, 1.2, 'sine', 0.12, 900);
      beep(180, 1.0, 'triangle', 0.06, 1400);
      if (muted || !audio) return;
      const t = audio.currentTime;
      const src = audio.createBufferSource();
      src.buffer = noiseBuf;
      const f = audio.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
      const g = audio.createGain();
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      src.connect(f).connect(g).connect(audio.destination);
      src.start(t);
    },
  };

  // ---------- Musik-Bausteine ----------
  const midiFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function musicNote(freq, t, dur, type, vol, dest) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest || musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Weicher, klavierähnlicher Ton mit langem Ausklingen
  function pianoNote(freq, t, dur, vol) {
    const g = audio.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(ambientBus);

    const body = audio.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(freq, t);
    body.connect(g);

    const shimmer = audio.createOscillator();
    const sg = audio.createGain();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(freq * 2, t);
    sg.gain.value = 0.18;
    shimmer.connect(sg).connect(g);

    body.start(t); shimmer.start(t);
    body.stop(t + dur + 0.05); shimmer.stop(t + dur + 0.05);
  }

  // Dunkle Streicher-Fläche für die Boss-Musik
  function padChord(notes, t, dur) {
    const f = audio.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = audio.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.3);
    g.gain.setValueAtTime(0.05, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(ambientBus);
    for (const n of notes) {
      for (const detune of [-6, 6]) {
        const o = audio.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(midiFreq(n), t);
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  function musicKick(t) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g).connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  function musicSnare(t) {
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    const f = audio.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1200;
    const g = audio.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(f).connect(g).connect(musicGain);
    src.start(t);
    src.stop(t + 0.15);
  }

  // ---------- Ruhige Oberwelt-Musik ----------
  // Mehrere Stücke im selben Stil. Die Melodie wird jedes Mal neu „improvisiert“,
  // und nach einer Weile wechselt das Stück.
  const CALM_BPM = 68;
  const CALM_BARS = 16;
  const CALM_PIECES = [
    { chords: [[43, 59, 62, 66], [40, 55, 59, 62], [48, 55, 59, 64], [50, 57, 62, 64]], scale: [74, 76, 79, 81, 83, 86] },
    { chords: [[41, 57, 60, 64], [45, 57, 60, 64], [43, 55, 59, 62], [48, 55, 60, 64]], scale: [72, 74, 76, 79, 81, 84] },
    { chords: [[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]], scale: [69, 72, 74, 76, 79, 81] },
    { chords: [[38, 57, 62, 66], [47, 54, 59, 62], [43, 55, 59, 62], [45, 57, 61, 64]], scale: [74, 76, 78, 81, 83, 86] },
    { chords: [[40, 55, 59, 66], [48, 55, 60, 64], [43, 55, 59, 62], [50, 54, 57, 62]], scale: [71, 74, 76, 78, 79, 83] },
  ];
  const calm = { piece: CALM_PIECES[0], melody: [], idx: -1 };

  function newCalmPiece() {
    let idx;
    do { idx = Math.floor(Math.random() * CALM_PIECES.length); } while (idx === calm.idx);
    calm.idx = idx;
    calm.piece = CALM_PIECES[idx];

    const sc = calm.piece.scale;
    const mel = new Array(CALM_BARS * 8).fill(0);
    let p = Math.floor(Math.random() * sc.length);
    for (let bar = 0; bar < CALM_BARS; bar++) {
      if (bar % 4 === 3 && Math.random() < 0.6) continue; // Atempause
      const count = 1 + Math.floor(Math.random() * 3);
      const steps = [...new Set(Array.from({ length: count }, () => rand([0, 2, 3, 4, 5, 6])))].sort((a, b) => a - b);
      for (const s of steps) {
        p = Math.max(0, Math.min(sc.length - 1, p + rand([-2, -1, -1, 0, 1, 1, 2])));
        mel[bar * 8 + s] = sc[p];
      }
    }
    calm.melody = mel;
  }

  // ---------- Endboss-Musik (eigene Komposition, d-Moll) ----------
  const BOSS_BPM = 150;
  const EPIC = (() => {
    const roots = [38, 38, 46, 48, 38, 38, 43, 45];
    const pads = [[62, 65, 69], [62, 65, 69], [58, 62, 65], [60, 64, 67],
                  [62, 65, 69], [62, 65, 69], [55, 58, 62], [57, 61, 64]];
    const lead = new Array(64).fill(null);
    [[0, 74, 3], [3, 77, 1], [4, 76, 2], [6, 74, 2], [8, 69, 6], [14, 72, 1], [15, 74, 1],
     [16, 70, 3], [19, 74, 1], [20, 77, 4], [24, 76, 3], [27, 72, 1], [28, 67, 4],
     [32, 74, 3], [35, 77, 1], [36, 81, 2], [38, 79, 2], [40, 77, 4], [44, 76, 2], [46, 74, 2],
     [48, 70, 2], [50, 74, 2], [52, 79, 4], [56, 73, 4], [60, 76, 2], [62, 73, 2]]
      .forEach(([s, n, l]) => { lead[s] = { n, l }; });
    return { roots, pads, lead };
  })();

  const music = { track: 'calm', step: 0, nextTime: 0 };

  function musicScheduler() {
    if (!audio || audio.state !== 'running') return;
    const bpm = music.track === 'boss' ? BOSS_BPM : CALM_BPM;
    const stepDur = 60 / bpm / 2;
    if (music.nextTime < audio.currentTime) music.nextTime = audio.currentTime + 0.05;

    while (music.nextTime < audio.currentTime + 0.15) {
      const t = music.nextTime;

      if (music.track === 'calm') {
        const i = music.step % (CALM_BARS * 8);
        if (i === 0) newCalmPiece();
        if (i % 8 === 0) {
          const ch = calm.piece.chords[(i / 8) % calm.piece.chords.length];
          ch.forEach((n, k) => pianoNote(midiFreq(n), t + k * 0.08, 4.5, k === 0 ? 0.16 : 0.07));
        }
        if (calm.melody[i]) pianoNote(midiFreq(calm.melody[i]), t, 2.8, 0.11);
      } else {
        const i = music.step % 64;
        const bar = i >> 3;
        if (i % 8 === 0) padChord(EPIC.pads[bar], t, stepDur * 8);
        musicNote(midiFreq(EPIC.roots[bar] + (i % 4 === 2 ? 12 : 0)), t, stepDur * 0.8, 'triangle', 0.22);
        musicNote(midiFreq(EPIC.roots[bar] - 12), t, stepDur * 0.6, 'square', 0.025);
        const ld = EPIC.lead[i];
        if (ld) {
          musicNote(midiFreq(ld.n), t, ld.l * stepDur * 0.95, 'square', 0.05);
          musicNote(midiFreq(ld.n - 12), t, ld.l * stepDur * 0.95, 'sawtooth', 0.02, ambientBus);
        }
        if (i % 4 === 0) musicKick(t);
        if (i % 4 === 2) musicSnare(t);
      }

      music.nextTime += stepDur;
      music.step++;
    }
  }

  function setTrack(name) {
    if (music.track === name) return;
    music.track = name;
    music.step = 0;
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('summ-muted', muted ? '1' : '0'); } catch (e) {}
    if (musicGain) musicGain.gain.value = muted ? 0 : 0.35;
  }

  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden) audio.suspend(); else audio.resume();
  });

  // =====================================================================
  //  BLOCK-TEXTUREN (8×8 Pixel, prozedural erzeugt, auf 24×24 skaliert)
  // =====================================================================
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeTex(seed, paint) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    const r = seeded(seed);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        g.fillStyle = paint(x, y, r, pick);
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  const DIRT = ['#8b5a2b', '#7a4e25', '#96643a', '#6b4220'];
  const brickLine = (x, y) => y % 4 === 3 || x === (y < 4 ? 3 : 7);

  const TEX = {
    dirt: makeTex(1, (x, y, r, p) => p(DIRT)),
    grass: makeTex(2, (x, y, r, p) => (y < 2 || (y === 2 && r() < 0.5)) ? p(['#5fa83a', '#6cbf45', '#4f9330']) : p(DIRT)),
    stone: makeTex(3, (x, y, r, p) => r() < 0.15 ? '#6e6e6e' : p(['#8f8f8f', '#999999', '#858585'])),
    cobble: makeTex(4, (x, y, r, p) => ((x + (y >> 1) * 3) % 4 === 0 || (y % 3 === 0 && x % 2 === 0)) ? '#4f4f4f' : p(['#8a8a8a', '#9c9c9c', '#777777'])),
    planks: makeTex(5, (x, y, r, p) => y % 4 === 3 ? '#5e3f1f' : x === (y < 4 ? 6 : 2) ? '#6e4a24' : p(['#b07f45', '#a6763f', '#ba8a50'])),
    bricks: makeTex(6, (x, y, r, p) => brickLine(x, y) ? '#c9bfb5' : p(['#a34a32', '#94402a', '#b0553a'])),
    log: makeTex(7, (x, y, r, p) => x % 3 === 0 ? '#4a3018' : p(['#6b4624', '#5e3d1f', '#785030'])),
    leaves: makeTex(8, (x, y, r, p) => r() < 0.15 ? '#1f4a14' : p(['#3d8a2a', '#2f7520', '#4a9a33'])),
    obsidian: makeTex(9, (x, y, r, p) => r() < 0.12 ? '#3d2466' : p(['#140a1f', '#1b0f2b', '#0f0817'])),
    redrock: makeTex(10, (x, y, r, p) => r() < 0.2 ? '#4a1010' : p(['#7a2020', '#6b1a1a', '#8a2a24'])),
    darkBrick: makeTex(11, (x, y, r, p) => brickLine(x, y) ? '#1a0606' : p(['#3d1414', '#4a1a18', '#331010'])),
    glow: makeTex(12, (x, y, r, p) => p(['#ffd66b', '#f5b942', '#ffe9a0', '#d9952b'])),
    paleStone: makeTex(13, (x, y, r, p) => r() < 0.15 ? '#bdb57a' : p(['#e3dca0', '#d8d095', '#ece6b3'])),
    violet: makeTex(14, (x, y, r, p) => (x === 0 || y === 0) ? '#7a4f8a' : (x === 4 || y === 4) ? '#9466a3' : p(['#a77bb5', '#b088be', '#9c70ab'])),
    sand: makeTex(15, (x, y, r, p) => r() < 0.1 ? '#cbb26a' : p(['#e8d49a', '#dfc98a', '#f0dea8'])),
    coral: makeTex(16, (x, y, r, p) => r() < 0.18 ? '#ffd0dc' : p(['#ff6f91', '#f25c85', '#ff86a3'])),
    seaStone: makeTex(17, (x, y, r, p) => brickLine(x, y) ? '#1f5d63' : p(['#3fa7a3', '#369a96', '#4ab5b0'])),
    kelp: makeTex(18, (x, y, r, p) => x % 4 === 1 ? '#1d5c3a' : p(['#2f8f5b', '#28804f', '#379c66'])),
  };

  // =====================================================================
  //  WELTEN
  // =====================================================================
  const WORLDS = {
    over: {
      name: 'Oberwelt',
      ground: ['grass', 'dirt'],
      cols: [
        { body: 'stone', edge: 'cobble' },
        { body: 'dirt', edge: 'dirt', edgeBot: 'grass' },
        { body: 'planks' },
        { body: 'bricks' },
        { body: 'log', edge: 'leaves' },
        { body: 'cobble' },
      ],
    },
    fire: {
      name: 'Feuerwelt',
      ground: ['redrock', 'redrock'],
      cols: [
        { body: 'redrock' },
        { body: 'darkBrick' },
        { body: 'redrock', edge: 'glow' },
      ],
    },
    void: {
      name: 'Sternenleere',
      ground: ['paleStone', 'paleStone'],
      cols: [
        { body: 'paleStone' },
        { body: 'violet' },
        { body: 'obsidian', edge: 'paleStone' },
      ],
    },
    water: {
      name: 'Wasserwelt',
      ground: ['sand', 'sand'],
      cols: [
        { body: 'seaStone' },
        { body: 'coral' },
        { body: 'kelp', edge: 'coral' },
        { body: 'sand', edge: 'seaStone' },
      ],
    },
  };

  // Hintergrund-Partikel (Wolken / Glut / Sterne)
  const clouds = Array.from({ length: 5 }, (_, i) => ({
    x: i * 110 + Math.random() * 60,
    y: 40 + Math.random() * 160,
    s: 0.6 + Math.random() * 0.7,
  }));
  const motes = Array.from({ length: 40 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    s: 0.5 + Math.random(),
    p: Math.random() * 6,
  }));

  // =====================================================================
  //  SPIELZUSTAND
  // =====================================================================
  // mode: 'cols' (Säulen), 'toPortal' (Portal kommt, keine neuen Säulen),
  //       'bossIntro' (durchs Portal, warten bis Säulen weg), 'boss' (Kampf)
  let state, mode, bee, cols, score, groundX, hillX, overT, flash, flashColor, time = 0, newBest;
  let boss, stingers, pollen, shots, popups, nextBossAt, bossLevel, pollenT, warnT;
  let world, spawnWorld;
  let lasers = []; // Laser-Hindernisse, die der Boss erzeugt
  let hole = null;       // „Blockloch“ im Boden – der einzige Ausweg bei der Verfolgung
  let voidT = 0;         // Zeit im Fall durch die Leere
  let voidPortal = null; // Portal in die Wasserwelt
  let cameo = null;      // Viktor fliegt auf dem Joyor-Roller vorbei
  let cameoT = 12;

  function reset() {
    state = 'ready';
    mode = 'cols';
    bee = { x: 110, y: H / 2 - 40, vy: 0, r: 15, rot: 0 };
    cols = [];
    score = START_SCORE;
    groundX = 0;
    hillX = 0;
    overT = 0;
    flash = 0;
    flashColor = '255,255,255';
    newBest = false;
    boss = null;
    stingers = [];
    pollen = [];
    shots = [];
    lasers = [];
    hole = null;
    voidT = 0;
    voidPortal = null;
    cameo = null;
    cameoT = 10 + Math.random() * 10;
    popups = [];
    bossLevel = 0;
    nextBossAt = (Math.floor(score / BOSS_EVERY) + 1) * BOSS_EVERY;
    pollenT = 0;
    warnT = 0;
    world = 'over';
    spawnWorld = 'over';
    setTrack('calm');
  }
  reset();

  function randomGapY() {
    const minY = 70 + GAP / 2;
    const maxY = H - GROUND_H - 70 - GAP / 2;
    return minY + Math.random() * (maxY - minY);
  }

  // Erzeugt die nächste Säule – oder ein Portal, wenn sie den Boss-Punkt bringen würde
  function spawnNext(x) {
    const pending = cols.filter((c) => !c.passed).length;
    const pointNo = score + pending + 1;
    if (pointNo >= nextBossAt) {
      const target = 'fire'; // der Boss wartet in der Feuerwelt
      cols.push({ x, gapY: randomGapY(), passed: false, portal: true, toBoss: true, target, entered: false });
      spawnWorld = target;
      mode = 'toPortal';
      return;
    }
    cols.push({ x, gapY: randomGapY(), passed: false, world: spawnWorld, kind: rand(WORLDS[spawnWorld].cols) });
  }

  function flap() {
    ensureAudio();
    if (state === 'ready') {
      state = 'playing';
      spawnNext(W + 40);
      bee.vy = FLAP_V;
      sfx.flap();
    } else if (state === 'playing' && mode !== 'fallHole') {
      bee.vy = FLAP_V;
      sfx.flap();
    } else if (state === 'over' && overT > 0.6) {
      reset();
    }
  }

  function die() {
    if (state !== 'playing') return;
    state = 'over';
    flash = 1;
    flashColor = '255,255,255';
    sfx.hit();
    if (score > best) { best = score; newBest = true; saveBest(); }
  }

  function addScore(n, x, y) {
    score += n;
    if (n > 1) popups.push({ text: `+${n}`, x, y, t: 0, size: 32 });
  }

  function enterPortal(c) {
    c.entered = true;
    world = c.target;
    flash = 1;
    flashColor = '170,80,255';
    sfx.portal();
    popups.push({ text: WORLDS[world].name, x: W / 2, y: 300, t: 0, size: 34 });
    if (c.toBoss) {
      mode = 'bossIntro';
      warnT = 2.5;
      setTrack('boss');
      setTimeout(sfx.warn, 400);
    } else {
      setTrack('calm');
      // Viktor verabschiedet sich und rennt davon
      if (boss && !boss.leaving) {
        boss.leaving = 0.001;
        boss.sayT = 3.2;
        boss.scream = false;
        boss.say = pickFarewell();
      }
    }
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }

  // =====================================================================
  //  BOSS: Viktor
  // =====================================================================
  // Ablauf des Bosskampfs:
  //  1. 'lasers': Viktor schwebt rechts und erzeugt starre Laser, denen du ausweichst.
  //  2. 'swap':   Er rennt aus dem Bild und taucht hinter dir wieder auf.
  //  3. 'chase':  Er krabbelt dir hinterher und kommt immer näher. Einziger Ausweg:
  //               sich in ein „Blockloch“ im Boden fallen lassen.
  //  4. Danach fällst du durch die Leere und kommst durch ein neues Portal in die Wasserwelt.
  function startBoss() {
    boss = {
      x: W + 90, y: (H - GROUND_H) / 2, homeX: W - 75, t: 0, hurt: 0,
      phase: 'lasers', face: -1, headGrow: 0, mindK: 0,
      spawnT: 1.4, spawned: 0, total: 6 + bossLevel * 2,
      say: null, sayT: 0, scream: false, talkT: 3,
      leaving: 0, vx: 0, holeT: 0,
    };
    mode = 'boss';
  }

  const CHASE_LINES = ['Ich krieg dich!', 'Bleib stehen!', 'Gleich hab ich dich!', 'Hihihi!', 'Du entkommst mir nicht!'];

  // Durchs Blockloch gefallen: Sturz durch die Leere
  function enterVoid() {
    world = 'void';
    mode = 'void';
    voidT = 0;
    voidPortal = null;
    hole = null;
    lasers = [];
    cols = [];
    boss = null;
    bee.y = 30;
    bee.vy = 150;
    flash = 1;
    flashColor = '120,60,220';
    sfx.portal();
    popups.push({ text: WORLDS.void.name, x: W / 2, y: 300, t: 0, size: 34 });
    popups.push({ text: 'Viktor: „Neiiin!“', x: W / 2, y: 350, t: 0, size: 20 });
  }

  // Durch das neue Portal: Ankunft in der Wasserwelt
  function enterWater() {
    world = 'water';
    spawnWorld = 'water';
    mode = 'cols';
    voidPortal = null;
    bossLevel++;
    bossLook++;   // Viktor wird beim nächsten Mal noch verrückter – bleibt auch nach Neustart
    saveLook();
    nextBossAt = (Math.floor(score / BOSS_EVERY) + 1) * BOSS_EVERY;
    flash = 1;
    flashColor = '60,200,255';
    sfx.portal();
    setTrack('calm');
    popups.push({ text: WORLDS.water.name, x: W / 2, y: 300, t: 0, size: 34 });
    spawnNext(W + 160);
  }

  // Gedankenkontrolle: ab und zu verschwimmt und wabert deine Sicht.
  // Je verrückter Viktor, desto stärker und häufiger.
  let warpOn = false;
  function updateWarp(dt) {
    let blur = 0, sc = 1, rot = 0, hue = 0;
    if (state === 'playing' && boss && boss.phase === 'mind' && !boss.leaving) {
      const c = crazy();
      const b = boss;
      b.warpT -= dt;
      if (b.warpT <= 0 && b.warpP <= 0) {
        b.warpP = 0.001;
        b.warpDur = 0.8 + c * 0.15;
      }
      if (b.warpP > 0) {
        b.warpP += dt;
        const p = Math.sin(Math.PI * Math.min(1, b.warpP / b.warpDur));
        blur = p * (1.5 + c * 0.7);
        sc = 1 + p * 0.03 * (1 + c * 0.3);
        rot = Math.sin(time * 7) * p * (0.6 + c * 0.4);
        hue = p * c * 20;
        if (b.warpP >= b.warpDur) {
          b.warpP = 0;
          b.warpT = Math.max(0.6, 2.6 - c * 0.25) * (0.7 + Math.random() * 0.6);
        }
      }
    }
    if (blur > 0.05) {
      canvas.style.filter = `blur(${blur.toFixed(2)}px) hue-rotate(${hue.toFixed(0)}deg)`;
      canvas.style.transform = `scale(${sc.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
      warpOn = true;
    } else if (warpOn) {
      canvas.style.filter = '';
      canvas.style.transform = '';
      warpOn = false;
    }
  }

  const bossGroundY = () => H - GROUND_H - (58 * (1 + Math.min(bossLook, 10) * 0.06) + 19);

  function spawnLaser() {
    const top = 28, bottom = H - GROUND_H - 28;
    const kind = rand(['v', 'v', 'h', 'd1', 'd2']);
    let len, angle;
    // kurze Laser = viel Platz zum Ausweichen
    if (kind === 'v') { len = 90 + bossLevel * 8 + Math.random() * 30; angle = Math.PI / 2; }
    else if (kind === 'h') { len = 70 + Math.random() * 30; angle = 0; }
    else { len = 100 + bossLevel * 8 + Math.random() * 30; angle = kind === 'd1' ? Math.PI / 4 : -Math.PI / 4; }
    len = Math.min(len, 170);
    const halfH = Math.abs(Math.sin(angle)) * len / 2;
    const y = top + halfH + Math.random() * (bottom - top - halfH * 2);
    lasers.push({ x: boss.x - 70, y, len, angle, charge: 0 });
    beep(1200, 0.25, 'sawtooth', 0.04, 300);
  }

  function laserEnds(l) {
    const dx = Math.cos(l.angle) * l.len / 2, dy = Math.sin(l.angle) * l.len / 2;
    return [l.x - dx, l.y - dy, l.x + dx, l.y + dy];
  }

  function segDist2(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1);
    return (px - (ax + vx * t)) ** 2 + (py - (ay + vy * t)) ** 2;
  }

  function updateBoss(dt) {
    const b = boss;
    b.t += dt;
    b.sayT = Math.max(0, b.sayT - dt);

    if (b.phase === 'lasers') {
      // rechts schweben und nacheinander Laser erzeugen
      b.face = -1;
      b.x += (b.homeX - b.x) * Math.min(1, dt * 2.5);
      b.y = (H - GROUND_H) / 2 + Math.sin(b.t * 0.9) * 120;
      if (Math.abs(b.x - b.homeX) < 10) {
        b.spawnT -= dt;
        if (b.spawnT <= 0) {
          if (b.spawned < b.total) {
            spawnLaser();
            b.spawned++;
            b.spawnT = (SPACING / SPEED) * 1.3;   // viel Abstand zwischen den Lasern
          } else if (lasers.length === 0) {
            b.phase = 'swap';
            b.vx = 0;
            b.say = ['Jetzt krieg ich dich!'];
            b.scream = true;
            b.sayT = 1.6;
            sfx.warn();
          }
        }
      }
    } else if (b.phase === 'swap') {
      // rennt rechts aus dem Bild – und taucht gleich hinter dir wieder auf
      b.face = 1;
      b.y += (bossGroundY() - b.y) * Math.min(1, dt * 5);
      b.vx += 520 * dt;
      b.x += b.vx * dt;
      if (b.x > W + 140) {
        b.phase = 'chase';
        b.x = -120;
        b.holeT = 1.2;
        b.talkT = 0.4;
      }
    } else {
      // Verfolgung: Viktor krabbelt dir hinterher und kommt langsam näher
      b.face = 1;
      b.x += 16 * dt;
      b.y = H - GROUND_H - 24 + Math.sin(time * 14) * 2;
      b.talkT -= dt;
      if (b.talkT <= 0) {
        b.say = [CHASE_LINES[Math.floor(Math.random() * CHASE_LINES.length)]];
        b.scream = true;
        b.sayT = 1.5;
        b.talkT = 2.8;
      }
      // Blockloch kommt von rechts; verpasst du es, kommt bald das nächste
      if (!hole) {
        b.holeT -= dt;
        if (b.holeT <= 0) hole = { x: W + 40, w: 112 };
      } else {
        hole.x -= SPEED * dt;
        if (hole.x + hole.w < -30) { hole = null; b.holeT = 1.0; }
      }
      if (b.x + 60 >= bee.x - 8) die();   // erwischt! (seine langen Krallen reichen weit nach vorne)
    }
  }

  // =====================================================================
  //  UPDATE
  // =====================================================================
  function update(dt) {
    time += dt;
    updateWarp(dt);
    flash = Math.max(0, flash - dt * 2);
    warnT = Math.max(0, warnT - dt);
    for (const p of popups) p.t += dt;
    popups = popups.filter((p) => p.t < 1.5);

    const scrolling = state !== 'over' && mode !== 'fallHole';
    if (scrolling) {
      groundX = (groundX + SPEED * dt) % B;
      hillX += SPEED * 0.25 * dt;
      for (const c of clouds) {
        c.x -= SPEED * 0.12 * c.s * dt;
        if (c.x < -100) { c.x = W + 60; c.y = 40 + Math.random() * 160; }
      }
    }
    for (const m of motes) {
      m.p += dt;
      if (world === 'fire') {
        m.y -= 30 * m.s * dt;
        m.x -= (scrolling ? 20 : 0) * dt;
        if (m.y < -5) { m.y = H - GROUND_H; m.x = Math.random() * W; }
        if (m.x < -5) m.x = W + 5;
      }
    }

    if (state === 'ready') {
      bee.y = H / 2 - 40 + Math.sin(time * 4) * 8;
      bee.rot = 0;
      return;
    }

    // Sturz durch die Leere – hier kann nichts passieren, bis das Portal kommt
    if (mode === 'void' && state === 'playing') {
      voidT += dt;
      bee.vy = clamp(bee.vy + 320 * dt, -220, 170);
      bee.y = clamp(bee.y + bee.vy * dt, 60, 380);
      bee.rot = Math.sin(time * 3) * 0.4;
      if (voidT > 2.5 && !voidPortal) voidPortal = { y: H + 70 };
      if (voidPortal) {
        voidPortal.y -= 170 * dt;
        if (voidPortal.y <= bee.y + 18) enterWater();
      }
      return;
    }

    // Biene: Schwerkraft
    bee.vy = Math.min(bee.vy + GRAVITY * dt, MAX_FALL);
    bee.y += bee.vy * dt;
    bee.rot = clamp(bee.vy / 600, -0.45, 1.3);

    const floor = H - GROUND_H - bee.r;
    const overHole = hole && bee.x - 10 > hole.x && bee.x + 10 < hole.x + hole.w;
    if (mode === 'fallHole') {
      // im Blockloch nach unten – ab in die Leere
      if (bee.y > H + 40) enterVoid();
      return;
    } else if (bee.y >= floor) {
      if (overHole && state === 'playing') {
        mode = 'fallHole';
        bee.vy = Math.max(bee.vy, 200);
        sfx.portal();
        if (boss) { boss.say = ['Neiiin! Komm zurück!']; boss.scream = true; boss.sayT = 2; }
        return;
      }
      bee.y = floor;
      bee.vy = 0;
      die();
    }

    if (state === 'over') {
      overT += dt;
      return;
    }

    if (bee.y < bee.r) { bee.y = bee.r; bee.vy = 0; }

    const hr = bee.r * 0.85;

    // Säulen bewegen, neue erzeugen, alte entfernen
    for (const c of cols) c.x -= SPEED * dt;
    const last = cols[cols.length - 1];
    if (mode === 'cols' && last && last.x < W - SPACING) spawnNext(last.x + SPACING);
    if (cols.length && cols[0].x < -COL_W - 10) cols.shift();

    for (const c of cols) {
      if (c.portal && !c.entered && bee.x > c.x + COL_W / 2) enterPortal(c);
      if (!c.passed && c.x + COL_W < bee.x) {
        c.passed = true;
        addScore(1);
        sfx.score();
      }
      const top = c.gapY - GAP / 2;
      const bot = c.gapY + GAP / 2;
      // Körper (Huhn) + Kopf des Reiters prüfen
      const headY = bee.y - 26;
      if (circleRect(bee.x, bee.y, hr, c.x, 0, COL_W, top) ||
          circleRect(bee.x, bee.y, hr, c.x, bot, COL_W, H - GROUND_H - bot) ||
          circleRect(bee.x, headY, 7, c.x, 0, COL_W, top)) {
        die();
        return;
      }
    }

    // Ab und zu fliegt Viktor auf seinem Joyor-Roller durch die Oberwelt an dir vorbei
    if (world === 'over' && mode === 'cols' && !boss) {
      if (!cameo) {
        cameoT -= dt;
        if (cameoT <= 0) {
          cameo = { x: -150, y: 150 + Math.random() * 110, baseY: 0, vx: 210, t: 0, phase: 'ride', face: 1,
            leaving: 0, headGrow: 0, mindK: 0, say: null, sayT: 0, scream: false };
          cameo.baseY = cameo.y;
          beep(140, 0.8, 'sawtooth', 0.04, 420);
        }
      }
    }
    if (cameo) {
      cameo.t += dt;
      cameo.x += cameo.vx * dt;
      cameo.y = cameo.baseY + Math.sin(cameo.t * 3) * 10;
      cameo.sayT = Math.max(0, cameo.sayT - dt);
      if (!cameo.said && cameo.x > 30) { cameo.said = true; cameo.say = ['Joyor Preis-Leistung!']; cameo.sayT = 2.6; }
      if (cameo.x > W + 220) { cameo = null; cameoT = 25 + Math.random() * 25; }
    }

    if (mode === 'bossIntro' && cols.length === 0) startBoss();
    if (boss) updateBoss(dt);
    if (state !== 'playing') return;

    // Laser: starr (kein Drehen, kein Hoch/Runter), sie kommen nur mit dem Bild auf dich zu
    for (const l of lasers) {
      l.x -= SPEED * dt;
      l.charge = Math.min(1, l.charge + dt * 2.5);
    }
    lasers = lasers.filter((l) => l.x > -l.len);
    for (const l of lasers) {
      if (l.charge < 1) continue; // lädt noch auf – noch harmlos
      const [ax, ay, bx, by] = laserEnds(l);
      // großzügige Trefferzone: nur ein echter Treffer zählt
      if (segDist2(bee.x, bee.y, ax, ay, bx, by) < (hr * 0.7 + 2) ** 2 ||
          segDist2(bee.x, bee.y - 26, ax, ay, bx, by) < 7 ** 2) {
        die();
        return;
      }
    }
  }

  // =====================================================================
  //  ZEICHNEN
  // =====================================================================
  // Treppenförmige (blockige) Hügel
  function drawBlockHills(baseY, amp, freq, color, offset, step = 12) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const off = offset % step;
    for (let x = -off; x <= W + step; x += step) {
      const t = (x + offset) * 0.012 * freq;
      let y = baseY - Math.abs(Math.sin(t)) * amp - Math.sin(t * 0.37) * amp * 0.3;
      y = Math.round(y / step) * step;
      ctx.lineTo(x, y);
      ctx.lineTo(x + step, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function skyGradient(stops) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBackground() {
    if (world === 'over') {
      skyGradient(['#6b9cff', '#9cc0ff', '#cfe2ff']);
      // Eckige Sonne
      ctx.fillStyle = '#fff6b0';
      ctx.fillRect(300, 60, 48, 48);
      ctx.fillStyle = 'rgba(255,246,176,0.35)';
      ctx.fillRect(292, 52, 64, 64);
      // Blockige Wolken
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      for (const c of clouds) {
        const s = 12 * c.s;
        const x = Math.round(c.x), y = Math.round(c.y);
        ctx.fillRect(x, y, s * 7, s * 2);
        ctx.fillRect(x + s * 2, y - s, s * 3, s);
      }
      drawBlockHills(H - GROUND_H - 40, 60, 0.6, '#8fc77a', hillX * 0.5);
      drawBlockHills(H - GROUND_H - 8, 40, 1.1, '#6fae58', hillX);
    } else if (world === 'fire') {
      skyGradient(['#1a0303', '#4a0b06', '#8a2108']);
      // Lava-Glühen am Horizont
      const g = ctx.createLinearGradient(0, H - GROUND_H - 140, 0, H - GROUND_H);
      g.addColorStop(0, 'rgba(255,90,0,0)');
      g.addColorStop(1, 'rgba(255,120,0,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H - GROUND_H - 140, W, 140);
      // Hängende Felsen oben
      ctx.save();
      ctx.translate(0, H);
      ctx.scale(1, -1);
      drawBlockHills(H - 60, 40, 0.8, '#2a0605', hillX * 0.4);
      ctx.restore();
      drawBlockHills(H - GROUND_H - 50, 70, 0.6, '#3d0a07', hillX * 0.5);
      drawBlockHills(H - GROUND_H - 10, 40, 1.1, '#5a120b', hillX);
      // Aufsteigende Glut
      for (const m of motes) {
        ctx.fillStyle = `rgba(255,${120 + Math.floor(m.s * 80)},40,${0.4 + Math.sin(m.p * 5) * 0.3})`;
        ctx.fillRect(Math.round(m.x), Math.round(m.y), 3, 3);
      }
    } else if (world === 'water') {
      skyGradient(['#0a3a66', '#11639a', '#27a0c6']);
      // Lichtstrahlen von der Wasseroberfläche
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let k = 0; k < 4; k++) {
        const lx = ((k * 140 - hillX * 0.15) % (W + 160) + W + 160) % (W + 160) - 80;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx + 40, 0);
        ctx.lineTo(lx + 110, H - GROUND_H);
        ctx.lineTo(lx + 50, H - GROUND_H);
        ctx.closePath();
        ctx.fill();
      }
      // Aufsteigende Luftblasen
      ctx.strokeStyle = 'rgba(220,245,255,0.6)';
      ctx.lineWidth = 1.5;
      for (const m of motes) {
        const by = (((m.y - time * 40 * m.s) % H) + H) % H;
        const bx = ((m.x - hillX * 0.1) % W + W) % W + Math.sin(m.p + time * 2) * 4;
        ctx.beginPath();
        ctx.arc(bx, by, 2 + m.s * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawBlockHills(H - GROUND_H - 40, 60, 0.6, '#0d4a68', hillX * 0.5);
      drawBlockHills(H - GROUND_H - 8, 40, 1.1, '#156b86', hillX);
    } else {
      skyGradient(['#05020c', '#140a24', '#25163b']);
      // Funkelnde Sterne
      for (const m of motes) {
        const a = 0.4 + Math.sin(m.p * 2 * m.s) * 0.4;
        ctx.fillStyle = `rgba(240,230,255,${Math.max(0, a)})`;
        const sx = ((m.x - hillX * 0.05 * m.s) % W + W) % W;
        ctx.fillRect(Math.round(sx), Math.round(m.y * 0.7), 2, 2);
      }
      // Schwebende Inseln in der Ferne (nicht beim Sturz durch den Schacht)
      if (mode === 'void') return;
      ctx.globalAlpha = 0.5;
      drawBlockHills(H - GROUND_H - 70, 50, 0.5, '#3a2b52', hillX * 0.3);
      ctx.globalAlpha = 1;
      drawBlockHills(H - GROUND_H - 15, 30, 1.0, '#a39d6e', hillX);
    }
  }

  function drawBlockRow(tex, x, y) {
    for (let k = 0; k < 3; k++) ctx.drawImage(tex, x + k * B, y, B, B);
  }

  function drawColumn(c) {
    const top = c.gapY - GAP / 2;
    const bot = c.gapY + GAP / 2;
    const x = Math.round(c.x);
    const kind = c.portal ? { body: 'obsidian' } : c.kind;
    const body = TEX[kind.body];
    const edgeTop = TEX[kind.edge || kind.body];
    const edgeBot = TEX[kind.edgeBot || kind.edge || kind.body];

    // Obere Säule: von der Lücke nach oben
    for (let y = top - B, row = 0; y > -B; y -= B, row++) drawBlockRow(row === 0 ? edgeTop : body, x, Math.round(y));
    // Untere Säule: von der Lücke nach unten
    for (let y = bot, row = 0; y < H - GROUND_H; y += B, row++) drawBlockRow(row === 0 ? edgeBot : body, x, Math.round(y));

    // Licht & Schatten für 3D-Gefühl
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, 0, 6, top);
    ctx.fillRect(x, bot, 6, H - GROUND_H - bot);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + COL_W - 8, 0, 8, top);
    ctx.fillRect(x + COL_W - 8, bot, 8, H - GROUND_H - bot);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, -5, COL_W, top + 5);
    ctx.strokeRect(x, bot, COL_W, H - GROUND_H - bot);

    if (c.portal) drawPortal(x, top, bot);
  }

  function drawPortal(x, top, bot) {
    const h = bot - top;
    // Rahmen-Pfosten (nur Optik)
    ctx.fillStyle = '#140a1f';
    ctx.fillRect(x, top, 8, h);
    ctx.fillRect(x + COL_W - 8, top, 8, h);

    // Wirbelnde Portalfläche
    const px = x + 8, pw = COL_W - 16;
    ctx.fillStyle = `rgba(130,50,220,${0.7 + Math.sin(time * 3) * 0.1})`;
    ctx.fillRect(px, top, pw, h);
    for (let k = 0; k < 28; k++) {
      const dir = k % 2 ? 1 : -1;
      const sx = px + (((k * 37 + time * 15 * (k % 3 + 1)) % pw) + pw) % pw;
      const sy = top + (((k * 53 + dir * time * 45 * (1 + (k % 4) * 0.3)) % h) + h) % h;
      ctx.fillStyle = k % 3 === 0 ? 'rgba(230,190,255,0.8)' : 'rgba(180,110,255,0.7)';
      ctx.fillRect(Math.round(sx), Math.round(sy), 4, 4);
    }
    // Leuchten
    ctx.fillStyle = `rgba(200,140,255,${0.15 + Math.sin(time * 5) * 0.08})`;
    ctx.fillRect(x - 6, top - 6, COL_W + 12, h + 12);
  }

  function drawGround() {
    const y = H - GROUND_H;
    const [topT, bodyT] = WORLDS[world].ground;
    for (let x = -groundX; x < W; x += B) {
      for (let row = 0; row * B < GROUND_H; row++) {
        ctx.drawImage(TEX[row === 0 ? topT : bodyT], Math.round(x), y + row * B, B, B);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, y + B, W, GROUND_H - B);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, y, W, 2);
    if (world === 'fire') {
      ctx.fillStyle = `rgba(255,110,0,${0.15 + Math.sin(time * 2) * 0.05})`;
      ctx.fillRect(0, y, W, GROUND_H);
    }
    if (hole) drawHole(y);
  }

  // Blockloch im Boden: führt hinunter in die Leere
  function drawHole(y) {
    const x = Math.round(hole.x), w = hole.w;
    const g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, '#1c0b33');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, GROUND_H);
    // lila Funkeln, das nach unten in die Tiefe fällt
    for (let k = 0; k < 12; k++) {
      const sx = x + 8 + ((k * 29) % (w - 16));
      const sy = y + (((k * 41 + time * 70 * (1 + (k % 3) * 0.4)) % GROUND_H) + GROUND_H) % GROUND_H;
      ctx.fillStyle = k % 3 ? 'rgba(170,110,255,0.7)' : 'rgba(240,220,255,0.9)';
      ctx.fillRect(sx, Math.round(sy), 3, 3);
    }
    // Blockkanten links und rechts
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x, y, 5, GROUND_H);
    ctx.fillRect(x + w - 5, y, 5, GROUND_H);
    // blinkender Pfeil: hier runter!
    if (Math.floor(time * 4) % 2 === 0) {
      const ax = x + w / 2, ay = y - 34 + Math.sin(time * 6) * 4;
      ctx.fillStyle = '#ffe14d';
      ctx.strokeStyle = '#3a2400';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax - 7, ay - 16);
      ctx.lineTo(ax + 7, ay - 16);
      ctx.lineTo(ax + 7, ay);
      ctx.lineTo(ax + 15, ay);
      ctx.lineTo(ax, ay + 15);
      ctx.lineTo(ax - 15, ay);
      ctx.lineTo(ax - 7, ay);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
  }

  // Sturz durch die Leere: ein Schacht aus Blöcken, der an dir vorbei nach oben saust
  function drawVoidFall() {
    const dist = voidT * 340;
    const off = dist % B;
    const row0 = Math.floor(dist / B);
    // Sternen-Streifen
    for (const m of motes) {
      const yy = (((m.y - voidT * 420 * m.s) % H) + H) % H;
      ctx.fillStyle = 'rgba(210,180,255,0.55)';
      ctx.fillRect(Math.round(m.x), Math.round(yy), 2, Math.round(10 + 14 * m.s));
    }
    // Schachtwände
    for (let k = -1; k * B - off < H; k++) {
      const yy = Math.round(k * B - off);
      [0, B, W - 2 * B, W - B].forEach((wx, col) => {
        const tex = (row0 + k + col) % 4 === 0 ? TEX.violet : TEX.obsidian;
        ctx.drawImage(tex, wx, yy, B, B);
      });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(B * 2 - 6, 0, 6, H);
    ctx.fillRect(W - B * 2, 0, 6, H);
    // Portal in die Wasserwelt kommt von unten
    if (voidPortal) {
      const py = voidPortal.y, cx = W / 2;
      ctx.save();
      ctx.fillStyle = `rgba(80,220,255,${0.18 + Math.sin(time * 5) * 0.06})`;
      ctx.beginPath();
      ctx.ellipse(cx, py, 140, 46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a2a4a';
      ctx.beginPath();
      ctx.ellipse(cx, py, 124, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,170,230,0.85)';
      ctx.beginPath();
      ctx.ellipse(cx, py, 112, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 24; k++) {
        const a = k * 0.9 + time * (k % 2 ? 2 : -2.6);
        const r = 0.25 + (k % 5) * 0.17;
        ctx.fillStyle = k % 3 ? 'rgba(200,245,255,0.85)' : 'rgba(120,255,220,0.8)';
        ctx.fillRect(Math.round(cx + Math.cos(a) * 108 * r), Math.round(py + Math.sin(a) * 26 * r), 4, 4);
      }
      ctx.restore();
    }
  }

  // Viktors E-Roller mit „JOYOR“-Schriftzug (Viktor fährt nach rechts)
  function drawScooter(b) {
    const e = 1 + Math.min(bossLook, 10) * 0.06;
    const x = b.x, deckY = b.y + 58 * e + 6;
    // Fahrtwind-Streifen hinter dem Roller
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 4; k++) {
      const len = 26 + ((k * 13 + time * 300) % 30);
      ctx.fillRect(Math.round(x - 60 - len), Math.round(deckY - 50 + k * 18), Math.round(len), 3);
    }
    // Lenkstange
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 46, deckY + 4);
    ctx.lineTo(x + 38, b.y - 12 * e);
    ctx.stroke();
    // Lenker mit Griffen
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 30, b.y - 14 * e);
    ctx.lineTo(x + 46, b.y - 10 * e);
    ctx.stroke();
    // Licht vorne
    ctx.fillStyle = `rgba(255,250,190,${0.5 + Math.sin(time * 10) * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(x + 44, b.y + 6 * e);
    ctx.lineTo(x + 100, b.y - 8 * e);
    ctx.lineTo(x + 100, b.y + 22 * e);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6a0';
    ctx.fillRect(x + 38, b.y + 2 * e, 8, 7);
    // Trittbrett mit Schriftzug
    roundRect(x - 40, deckY, 92, 14, 5);
    ctx.fillStyle = '#26292e';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    text('JOYOR', x + 6, deckY + 7.5, 11, '#7dff6a', '#000');
    // Räder (drehen sich)
    for (const wx of [x - 30, x + 44]) {
      const wy = deckY + 18;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(wx, wy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9aa0a6';
      ctx.beginPath();
      ctx.arc(wx, wy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#9aa0a6';
      ctx.lineWidth = 1.5;
      const a = time * 18;
      ctx.beginPath();
      ctx.moveTo(wx + Math.cos(a) * 8, wy + Math.sin(a) * 8);
      ctx.lineTo(wx - Math.cos(a) * 8, wy - Math.sin(a) * 8);
      ctx.stroke();
    }
  }

  // Spielfigur: kleiner Zombie-Knirps, der auf einem Huhn reitet
  function drawBee() {
    const dead = state === 'over';
    ctx.save();
    ctx.translate(bee.x, bee.y);
    ctx.rotate(bee.rot * 0.8);
    ctx.lineJoin = 'round';
    const outline = '#2a2018';

    // --- Huhn ---
    // Beine
    ctx.strokeStyle = '#e8a317';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-3, 16); ctx.lineTo(-5, 22); ctx.lineTo(-1, 22);
    ctx.moveTo(4, 16); ctx.lineTo(3, 22); ctx.lineTo(7, 22);
    ctx.stroke();

    // Schwanzfedern
    ctx.fillStyle = '#f2f2ee';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 2);
    ctx.lineTo(-24, -6);
    ctx.lineTo(-21, 4);
    ctx.lineTo(-25, 8);
    ctx.lineTo(-13, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Körper
    ctx.beginPath();
    ctx.ellipse(0, 6, 17, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fbfbf7';
    ctx.fill();
    ctx.stroke();

    // Kopf + Hals
    ctx.beginPath();
    ctx.ellipse(15, -4, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Kamm
    ctx.fillStyle = '#e0322b';
    ctx.beginPath();
    ctx.arc(13, -12, 2.5, 0, Math.PI * 2);
    ctx.arc(16.5, -13, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Schnabel
    ctx.fillStyle = '#f2a516';
    ctx.beginPath();
    ctx.moveTo(21, -6); ctx.lineTo(28, -3); ctx.lineTo(21, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Kehllappen
    ctx.fillStyle = '#e0322b';
    ctx.beginPath();
    ctx.ellipse(20, 2, 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Auge
    ctx.fillStyle = outline;
    if (dead) {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(15, -7); ctx.lineTo(19, -3);
      ctx.moveTo(19, -7); ctx.lineTo(15, -3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(17, -5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flatternder Flügel
    const flapA = dead ? 0.3 : Math.sin(time * 30) * 0.7;
    ctx.save();
    ctx.translate(-2, 4);
    ctx.rotate(-0.3 + flapA);
    ctx.beginPath();
    ctx.ellipse(-6, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#e6e3d8';
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // --- Zombie-Knirps ---
    // Beine (hängen seitlich runter)
    ctx.fillStyle = '#5b4a7a';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.fillRect(-1, -6, 6, 12);
    ctx.strokeRect(-1, -6, 6, 12);
    ctx.fillStyle = '#7fae5a';
    ctx.fillRect(0, 6, 5, 3);

    // Oberkörper: zerrissenes Hemd
    ctx.fillStyle = '#b5652e';
    ctx.beginPath();
    ctx.moveTo(-7, -6);
    ctx.lineTo(-6, -20);
    ctx.lineTo(6, -20);
    ctx.lineTo(7, -6);
    ctx.lineTo(4, -8);
    ctx.lineTo(1, -5);
    ctx.lineTo(-3, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Flicken
    ctx.fillStyle = '#d9a35c';
    ctx.fillRect(-4, -16, 4, 4);

    // Arme nach vorne gestreckt (typische Zombie-Pose)
    const armWobble = dead ? 0.6 : Math.sin(time * 6) * 0.08;
    ctx.save();
    ctx.translate(3, -16);
    ctx.rotate(armWobble);
    ctx.fillStyle = '#7fae5a';
    ctx.fillRect(0, -2.5, 16, 5);
    ctx.strokeRect(0, -2.5, 16, 5);
    ctx.restore();

    // Kopf
    ctx.beginPath();
    ctx.arc(0, -29, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#86b860';
    ctx.fill();
    ctx.stroke();
    // Strubbelhaare
    ctx.fillStyle = '#3b2d22';
    ctx.beginPath();
    ctx.moveTo(-10, -31);
    ctx.lineTo(-8, -40);
    ctx.lineTo(-4, -36);
    ctx.lineTo(-1, -42);
    ctx.lineTo(2, -37);
    ctx.lineTo(6, -41);
    ctx.lineTo(9, -33);
    ctx.quadraticCurveTo(0, -37, -10, -31);
    ctx.fill();
    // Naht über der Stirn
    ctx.strokeStyle = '#3d5a2a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-7, -26); ctx.lineTo(-2, -27);
    for (const sx of [-6, -4]) { ctx.moveTo(sx, -28); ctx.lineTo(sx, -25); }
    ctx.stroke();

    // Augen: ein großes, ein kleines
    if (dead) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const [ex, ey] of [[3, -31], [8, -30]]) {
        ctx.moveTo(ex - 2, ey - 2); ctx.lineTo(ex + 2, ey + 2);
        ctx.moveTo(ex + 2, ey - 2); ctx.lineTo(ex - 2, ey + 2);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(3, -31, 3.5, 0, Math.PI * 2);
      ctx.arc(8.5, -30, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c0161b';
      ctx.beginPath();
      ctx.arc(4, -31, 1.6, 0, Math.PI * 2);
      ctx.arc(9, -30, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // Offener Mund mit Zahn
    ctx.fillStyle = '#2a1a14';
    ctx.beginPath();
    ctx.ellipse(5, -23, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffbe0';
    ctx.fillRect(4, -25, 1.6, 1.8);

    ctx.restore();
  }

  // Viktor – dürres, langgezogenes Gruselwesen mit einem Kopf.
  // Mit jedem Boss wird er länger, sein Geweih wächst und er wird verrückter.
  function drawBoss(b = boss) {
    const crawling = b.phase === 'chase';
    const st = bossStage();
    const c = crazy();
    const g = Math.min(bossLook, 10);
    const e = 1 + g * 0.06;            // wird mit jeder Stufe länger
    const SKIN = '#b9b2a5', DARK = '#2a2622', BONE = '#ddd5c4';
    const eyeColor = st.aura ? `rgb(${st.aura})` : '#ff3030';
    const running = b.phase === 'run' || b.leaving > 0;
    const runT = time * (12 + c * 2);
    const sway = running ? 0 : Math.sin(time * 2.2) * 3;

    ctx.save();
    ctx.translate(b.x, b.y);
    // je verrückter, desto mehr zittert er
    ctx.rotate(Math.sin(time * (6 + c * 2)) * 0.025 * c);
    // beim Rennen in Laufrichtung schauen (Grundhaltung schaut nach links)
    if (b.face > 0) ctx.scale(-1, 1);

    // Aura (ab Stufe 2): flackernder Strahlenkranz
    if (st.aura) {
      const pulse = (1 + Math.sin(time * 10) * 0.06) * st.auraSize;
      const ag = ctx.createRadialGradient(0, -5, 10, 0, -5, 80 * pulse);
      ag.addColorStop(0, `rgba(${st.aura},0.5)`);
      ag.addColorStop(1, `rgba(${st.aura},0)`);
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(0, -5, 80 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blitze (ab Stufe 3)
    if (st.bolts && Math.random() < 0.5) {
      ctx.strokeStyle = 'rgba(230,245,255,0.9)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        let x = (Math.random() - 0.5) * 70, y = -60 + Math.random() * 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (Math.random() - 0.5) * 18;
          y += 10 + Math.random() * 8;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Dünne Gliedmaßen: dunkle Kontur + helle Füllung
    const limb = (pts, w, fill = SKIN) => {
      for (const [color, lw] of [[DARK, w + 3], [fill, w]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    };
    // Lange Krallen (dir = Richtung, 0 = nach unten)
    const claws = (x, y, dir) => {
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 2;
      for (const a of [-0.45, 0, 0.45]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(a + dir) * 11, y + Math.cos(a + dir) * 11);
        ctx.stroke();
      }
    };

    const ant = 10 + g * 3;
    const s = 1.3 + c * 0.08 + b.headGrow;
    let hx, hy, hRot;

    if (crawling) {
      // Verfolgung: Viktor krabbelt auf allen Vieren wie eine riesige Spinne (Boden bei y = 22)
      const ct = time * (11 + c);
      const bob = Math.sin(ct * 2) * 2;
      // Schattenfetzen auf dem Rücken
      ctx.fillStyle = 'rgba(20,16,14,0.75)';
      ctx.beginPath();
      ctx.moveTo(-28 * e, -26 + bob);
      for (let i = 0; i <= 6; i++) {
        ctx.lineTo((-24 + i * 9) * e, -32 - (i % 2 ? 0 : 10) + Math.sin(time * 12 + i) * 3 + bob);
      }
      ctx.lineTo(34 * e, -14 + bob);
      ctx.closePath();
      ctx.fill();
      // Hinterbeine – abgeknickt nach oben wie bei einer Spinne
      for (const [k, ph] of [[0, 0], [1, Math.PI]]) {
        const sw = Math.sin(ct + ph);
        const lift = Math.max(0, sw) * 8;
        const fx = (34 + k * 6) * e + sw * 14;
        limb([[(22 + k * 4) * e, -16 + bob], [(40 + k * 4) * e, -40 + bob], [fx, 22 - lift]], 4);
        claws(fx, 22 - lift, -1.2);
      }
      // Waagerechter, dürrer Körper mit Rippen
      ctx.beginPath();
      ctx.ellipse(0, -18 + bob, 32 * e, 11, 0, 0, Math.PI * 2);
      ctx.fillStyle = SKIN;
      ctx.fill();
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(42,38,34,0.7)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const x = (-18 + i * 8) * e;
        ctx.beginPath();
        ctx.moveTo(x - 3, -26 + bob);
        ctx.quadraticCurveTo(x + 3, -18 + bob, x - 3, -10 + bob);
        ctx.stroke();
      }
      // Viel zu lange Arme – greifen abwechselnd weit nach vorne
      for (const ph of [0, Math.PI]) {
        const sw = Math.sin(ct + ph + 1);
        const lift = Math.max(0, -sw) * 10;
        const fx = -52 * e - sw * 16;
        limb([[-24 * e, -22 + bob], [-36 * e - sw * 6, -46 + bob], [fx, 22 - lift]], 3.5);
        claws(fx, 22 - lift, -1.0);
      }
      // Hals und Kopf vorne, Schnauze nach vorne
      hx = -40 * e - 8;
      hy = -34 + bob + Math.sin(ct) * 2;
      hRot = 1.0;
      limb([[-28 * e, -24 + bob], [hx + 6, hy + 6]], 3 + s * 1.2);
    } else {
    // Zottelige Schattenfetzen hinter dem Körper (flattern beim Rennen)
    ctx.fillStyle = 'rgba(20,16,14,0.75)';
    ctx.beginPath();
    ctx.moveTo(-14, -42 * e);
    ctx.lineTo(14, -42 * e);
    for (let i = 0; i <= 6; i++) {
      const x = 18 - i * 6 + (running ? 10 : 0);
      const y = (10 + (i % 2 ? 0 : 16)) * e + Math.sin(time * (running ? 14 : 4) + i) * 3;
      ctx.lineTo(x + sway * 0.5, y);
    }
    ctx.closePath();
    ctx.fill();

    // Abgeknickte Tierbeine – beim Rennen schwingen sie wild
    const hipY = 12 * e, footY = 58 * e;
    const ls = running ? Math.sin(runT) : 0;
    const upL = Math.max(0, ls) * 10, upR = Math.max(0, -ls) * 10;
    limb([[-5, hipY], [-13 + ls * 10, hipY + 20 * e], [-4 + ls * 14, hipY + 34 * e - upL], [-10 + ls * 18, footY - upL]], 4);
    limb([[5, hipY], [12 - ls * 10, hipY + 22 * e], [6 - ls * 14, hipY + 36 * e - upR], [11 - ls * 18, footY - upR]], 4);
    claws(-10 + ls * 18, footY - upL, -1.2);
    claws(11 - ls * 18, footY - upR, -1.2);

    // Dürrer Oberkörper mit Rippen
    ctx.beginPath();
    ctx.ellipse(0, -14 * e, 12, 30 * e, running ? -0.15 : 0, 0, Math.PI * 2);
    ctx.fillStyle = SKIN;
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(42,38,34,0.7)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const y = (-34 + i * 8) * e;
      ctx.beginPath();
      ctx.moveTo(-9, y + 3);
      ctx.quadraticCurveTo(0, y - 3, 9, y + 3);
      ctx.stroke();
    }

    // Unnatürlich lange Arme
    const shY = -38 * e;
    let elbowL, handL, elbowR, handR;
    if (running) {
      // wild rudern
      const a = Math.sin(runT + Math.PI);
      elbowL = [-22, -10 * e]; handL = [-26 + a * 18, 20 * e - Math.abs(a) * 30];
      elbowR = [22, -10 * e]; handR = [22 - a * 18, 20 * e - Math.abs(-a) * 30];
    } else if (b.phase === 'mind') {
      // beide Krallen zur Spielfigur ausgestreckt
      const r = 14 + Math.sin(time * 3) * 4 + c * 2;
      elbowL = [-28, -40 * e]; handL = [-50 - r, -30 * e];
      elbowR = [10, -16 * e]; handR = [-36 - r * 0.6, -10 * e];
    } else if (b.phase === 'ride') {
      // hält den Lenker des E-Rollers fest
      elbowL = [-26, -26 * e]; handL = [-38, -14 * e];
      elbowR = [-8, -14 * e]; handR = [-35, -11 * e];
    } else {
      elbowL = [-24, -6 * e]; handL = [-30, 40 * e];
      elbowR = [22, -4 * e + sway]; handR = [20 + sway, 44 * e];
    }
    limb([[-9, shY], elbowL, handL], 3.5);
    limb([[9, shY], elbowR, handR], 3.5);
    claws(handL[0], handL[1], b.phase === 'mind' && !running ? -1.4 : 0.3);
    claws(handR[0], handR[1], b.phase === 'mind' && !running ? -1.4 : 0);

    // Ein Kopf – wird bei der Gedankenkontrolle größer
    hx = -10;
    hy = -58 * e - 8 * s + (running ? -Math.abs(Math.sin(runT)) * 4 : Math.sin(time * 2) * 2);
    hRot = running ? -0.3 + Math.sin(runT * 0.5) * 0.35 : -0.3;
    limb([[0, -42 * e], [-4, -56 * e], [hx, hy]], 3 + s * 1.2);
    }

    // Geweih – wächst mit jeder Stufe
    const an = ant * s;
    for (const sd of [-1, 1]) {
      const ax = hx + sd * 5 * s, ay = hy - 12 * s;
      limb([[ax, ay], [ax + sd * an * 0.6, ay - an]], 2.5 * s, BONE);
      limb([[ax + sd * an * 0.25, ay - an * 0.4], [ax + sd * an * 0.75, ay - an * 0.55]], 2 * s, BONE);
      if (g >= 3) limb([[ax + sd * an * 0.45, ay - an * 0.75], [ax + sd * an * 0.2, ay - an * 1.05]], 2 * s, BONE);
    }
    drawSkull(hx, hy, hRot, s);

    // Schwindel-Sternchen beim Rennen
    if (running) {
      for (let i = 0; i < 3 + Math.min(c, 4); i++) {
        const a = time * 6 + (i * Math.PI * 2) / (3 + Math.min(c, 4));
        ctx.fillStyle = i % 2 ? '#ffe14d' : '#ffffff';
        ctx.beginPath();
        ctx.arc(hx + Math.cos(a) * 18 * s, hy - 20 * s + Math.sin(a) * 6 * s, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Kopfposition in Bildschirm-Koordinaten (für Gedanken-Wellen und Namensschild)
    b.headX = b.x + (b.face > 0 ? -hx : hx);
    b.headY = b.y + hy;

    // Name über dem Kopf
    text('Viktor', b.headX, b.headY - 22 * s - an, 13 + (s - 1) * 5, '#ffffff', '#2a2622');

    // Sprechblase – gerade und immer im Bild
    if (b.sayT > 0 && b.say) {
      const size = b.scream ? 22 : 16;
      ctx.font = `900 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
      const lines = b.say;
      const lh = size + 6;
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28;
      const bh = lines.length * lh + 14;
      const shake = b.scream ? (Math.random() - 0.5) * 5 : 0;
      const cx = clamp(b.x - 40, bw / 2 + 6, W - bw / 2 - 6) + shake;
      const cy = clamp(b.headY - 22 * s - an - 40, bh / 2 + 6, H - GROUND_H - bh / 2) + shake;
      ctx.globalAlpha = Math.min(1, b.sayT * 2);
      roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 12);
      ctx.fillStyle = b.scream ? '#fff0f0' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 10, cy + bh / 2);
      ctx.lineTo(cx + 30, cy + bh / 2 + 16);
      ctx.lineTo(cx + 26, cy + bh / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      lines.forEach((l, i) => {
        const color = b.scream ? '#e0141e' : i === 0 ? '#2a2622' : '#c0392b';
        text(l, cx, cy - bh / 2 + 7 + lh * (i + 0.5), i === 0 ? size : 14, color, '#ffffff');
      });
      ctx.globalAlpha = 1;
    }

    // Langer Tierschädel als Kopf
    function drawSkull(headX, headY, rot, scale) {
      ctx.save();
      ctx.translate(headX, headY);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.fillStyle = BONE;
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Schnauze
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.lineTo(-6, 23);
      ctx.lineTo(2, 25);
      ctx.lineTo(7, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Kiefer mit spitzen Zähnen – beim Rennen weit offen (verrücktes Grinsen)
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const open = running || crawling ? 3 : 0;
      ctx.moveTo(-6, 17);
      ctx.lineTo(4, 18 + open);
      for (let i = 0; i < 4; i++) {
        const x = -5 + i * 2.6;
        ctx.moveTo(x, 17);
        ctx.lineTo(x + 1, 20 + open);
      }
      ctx.stroke();
      // Augenhöhlen: bei Gedankenkontrolle Spiral-Augen, sonst glühende Punkte
      ctx.fillStyle = DARK;
      ctx.beginPath();
      ctx.ellipse(-4, -3, 3.5, 5, 0, 0, Math.PI * 2);
      ctx.ellipse(4, -3, 3.5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (b.phase === 'mind' && !running) {
        ctx.strokeStyle = '#d68cff';
        ctx.lineWidth = 1;
        for (const ex of [-4, 4]) {
          ctx.beginPath();
          for (let a = 0; a < Math.PI * 4; a += 0.4) {
            const r = a * 0.28;
            const x = ex + Math.cos(a + time * 8) * r, y = -3 + Math.sin(a + time * 8) * r;
            if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = eyeColor;
        ctx.shadowColor = eyeColor;
        ctx.shadowBlur = 12 + g;
        ctx.beginPath();
        // verrückt: Augen unterschiedlich groß
        ctx.arc(-4, -2, 1.8 + (running ? c * 0.15 : 0), 0, Math.PI * 2);
        ctx.arc(4, -2, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }

  // Viktors Gedankenkontrolle: lila Schleier, Psycho-Wellen vom Kopf zur Spielfigur,
  // und eine Hypnose-Spirale über dem Kopf des Reiters
  function drawMindControl() {
    const b = boss;
    const k = b.mindK;      // blendet beim Phasenwechsel weich ein/aus
    const c = crazy();      // je verrückter, desto stärker

    // Lila Schleier am Bildrand – wird mit jedem Boss dichter
    const v = ctx.createRadialGradient(W / 2, H / 2, 120 - c * 8, W / 2, H / 2, 420);
    v.addColorStop(0, 'rgba(150,60,255,0)');
    v.addColorStop(1, `rgba(120,30,220,${Math.min(0.85, 0.3 + c * 0.06 + Math.sin(time * 2) * 0.1) * k})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    const hx = b.headX, hy = b.headY;
    const tx = bee.x, ty = bee.y - 30;

    // Welliger Gedanken-Strahl
    ctx.strokeStyle = `rgba(210,150,255,${0.55 * k})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = hx + (tx - hx) * t;
      const y = hy + (ty - hy) * t + Math.sin(t * 14 - time * 10) * 8 * Math.sin(t * Math.PI);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Ringe, die vom Kopf zur Spielfigur wandern
    for (let i = 0; i < 6; i++) {
      const t = (time * 0.7 + i / 6) % 1;
      const x = hx + (tx - hx) * t;
      const y = hy + (ty - hy) * t;
      ctx.strokeStyle = `rgba(230,180,255,${(1 - t) * 0.8 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 6 + t * 16, 10 + t * 22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hypnose-Spirale über dem Kopf des Reiters
    ctx.save();
    ctx.translate(bee.x, bee.y - 52);
    ctx.rotate(time * 6);
    ctx.strokeStyle = `rgba(200,110,255,${k})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 6; a += 0.2) {
      const r = a * 1.6;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.6;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Kleine schwebende Gedanken-Symbole
    ctx.globalAlpha = 0.8 * k;
    const syms = ['?', '!', '♥', '★', '@'];
    for (let i = 0; i < 5; i++) {
      const a = time * 1.5 + i * 1.26;
      text(syms[i], bee.x + Math.cos(a) * 34, bee.y - 30 + Math.sin(a) * 22, 14, '#f0d0ff', '#5a1a8a');
    }
    ctx.globalAlpha = 1;
  }

  // Laser: zwei Metall-Knoten mit leuchtendem Strahl dazwischen
  function drawLasers() {
    const st = bossStage();
    const glow = st.aura || '255,60,90';
    for (const l of lasers) {
      const [ax, ay, bx, by] = laserEnds(l);
      ctx.lineCap = 'round';
      if (l.charge < 1) {
        // Aufladen: dünner, flackernder Strahl
        ctx.strokeStyle = `rgba(${glow},${0.25 + Math.random() * 0.25})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const flick = 0.85 + Math.random() * 0.15;
        ctx.strokeStyle = `rgba(${glow},${0.35 * flick})`;
        ctx.lineWidth = 16;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = `rgba(${glow},0.9)`;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      for (const [x, y] of [[ax, ay], [bx, by]]) {
        ctx.fillStyle = '#3b3f4a';
        ctx.strokeStyle = '#15171c';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = `rgb(${glow})`;
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawProjectiles() {
    for (const p of pollen) {
      const glow = 0.5 + Math.sin(time * 8 + p.t) * 0.2;
      ctx.fillStyle = `rgba(255, 255, 150, ${glow})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe14d';
      ctx.strokeStyle = '#c99700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c99700';
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + p.t;
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const s of shots) {
      ctx.fillStyle = '#ffb000';
      ctx.strokeStyle = '#8a5a0a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (const s of stingers) {
      ctx.save();
      ctx.translate(s.x, s.y);
      if (s.kind === 'block') {
        // geworfener Block
        ctx.rotate(time * 8);
        ctx.drawImage(TEX.cobble, -7, -7, 14, 14);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-7, -7, 14, 14);
      } else {
        // Energiekugel
        ctx.fillStyle = `rgba(${s.color},0.35)`;
        ctx.beginPath();
        ctx.arc(0, 0, 11 + Math.sin(time * 20) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgb(${s.color})`;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function text(str, x, y, size, fill = '#fff', stroke = '#3a2400', align = 'center') {
    ctx.font = `900 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size / 6);
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawUI() {
    if (state === 'ready') {
      text('Summ!', W / 2, 130, 64, '#ffd23f');
      const pulse = 0.6 + Math.sin(time * 4) * 0.4;
      ctx.globalAlpha = pulse;
      text('Tippen oder Leertaste', W / 2, 380, 22);
      ctx.globalAlpha = 1;
      if (best > 0) text(`Rekord: ${best}`, W / 2, 420, 18);
      if (START_SCORE > 0) text(`Testmodus: Start bei ${START_SCORE}`, W / 2, 450, 14, '#ffb0b0');
    } else if (state === 'playing') {
      text(String(score), W / 2, 70, 56);

      if (warnT > 0 && Math.floor(time * 6) % 2 === 0) {
        text('ACHTUNG!', W / 2, 200, 44, '#ff5c5c');
        text(bossLook === 0 ? 'Viktor naht...' : `Viktor – Stufe ${bossLook + 1}! Noch verrückter!`, W / 2, 245, 20);
      }

      if (boss) {
        text(`Viktor · Stufe ${bossLook + 1}`, W / 2, 102, 14, bossStage().hair || '#ffd700');
        if (boss.phase === 'lasers') {
          // Fortschritt: wie viele Laser noch kommen
          const bw = 220, bx = W / 2 - bw / 2, by = 112;
          roundRect(bx, by, bw, 14, 7);
          ctx.fillStyle = '#3a2400';
          ctx.fill();
          roundRect(bx + 2, by + 2, Math.max(10, (bw - 4) * Math.min(1, boss.spawned / boss.total)), 10, 5);
          ctx.fillStyle = '#ff5c5c';
          ctx.fill();
          ctx.globalAlpha = 0.6 + Math.sin(time * 3) * 0.4;
          text('Weiche den Lasern aus!', W / 2, 160, 17, '#ffcf8a');
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = 0.6 + Math.sin(time * 5) * 0.4;
          text('Viktor verfolgt dich!', W / 2, 140, 20, '#ff8a8a');
          text('Lass dich ins Blockloch fallen!', W / 2, 168, 17, '#ffe14d');
          ctx.globalAlpha = 1;
        }
      }
      if (mode === 'void') text('Du fällst durch die Leere …', W / 2, 130, 18, '#d9a6ff', '#1c0b33');
    } else {
      const t = Math.min(1, overT * 3);
      const py = 150 + (1 - t) * 40;
      ctx.globalAlpha = t;
      text('Autsch!', W / 2, py, 52, '#ff8a5c');

      roundRect(W / 2 - 120, py + 45, 240, 150, 18);
      ctx.fillStyle = '#fff4d6';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#8a5a0a';
      ctx.stroke();

      text('Punkte', W / 2 - 55, py + 80, 18, '#e08e0b', '#fff4d6');
      text(String(score), W / 2 - 55, py + 125, 44);
      text('Rekord', W / 2 + 55, py + 80, 18, '#e08e0b', '#fff4d6');
      text(String(best), W / 2 + 55, py + 125, 44);
      if (newBest) text('NEU!', W / 2 + 55, py + 168, 16, '#ff5c5c', '#fff4d6');

      if (overT > 0.6) {
        ctx.globalAlpha = 0.6 + Math.sin(time * 4) * 0.4;
        text('Tippen für neuen Versuch', W / 2, py + 240, 20);
      }
      ctx.globalAlpha = 1;
    }

    // Popups (Bonus-Punkte, Weltname)
    for (const p of popups) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1.5);
      text(p.text, p.x, p.y - p.t * 30, p.size, '#ffe14d');
    }
    ctx.globalAlpha = 1;

    text(muted ? 'Ton aus (M)' : 'Ton an (M)', W - 10, H - 20, 13, '#fff', '#3a2400', 'right');
  }

  function draw() {
    drawBackground();
    for (const c of cols) drawColumn(c);
    if (cameo) { drawScooter(cameo); drawBoss(cameo); }
    if (boss) drawBoss();
    drawLasers();
    drawProjectiles();
    if (mode === 'void') drawVoidFall();
    else drawGround();
    drawBee();
    if (boss && boss.mindK > 0.02 && boss.headX !== undefined) drawMindControl();
    drawUI();

    if (flash > 0) {
      ctx.fillStyle = `rgba(${flashColor},${Math.min(1, flash) * 0.8})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // =====================================================================
  //  STEUERUNG & LOOP
  // =====================================================================
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    flap();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) flap();
    } else if (e.code === 'KeyM') {
      ensureAudio();
      toggleMute();
    }
  });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
