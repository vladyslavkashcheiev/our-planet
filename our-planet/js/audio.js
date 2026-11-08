/* =====================================================================
   OUR PLANET — звук.
   • Если в content.js указан файл музыки и он существует — играет он.
   • Иначе играет встроенная мягкая музыка, которая генерируется прямо
     в браузере (Web Audio) — оригинальная, без авторских прав.
   • Звуки интерфейса тоже синтезируются, файлы не нужны.
   Ничего не запускается без нажатия пользователя.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});

  let ctx = null, master = null, musicGain = null, sfxGain = null, reverb = null;
  let enabled = false, fileAudio = null, fileOk = null, synthTimer = null, synthOn = false;
  const content = window.OUR_PLANET_CONTENT || {};
  const musicCfg = content.music || {};

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(3.2, 2.6);
    const rv = ctx.createGain(); rv.gain.value = 0.55; reverb.connect(rv); rv.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(master); musicGain.connect(reverb);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master); sfxGain.connect(reverb);
    return ctx;
  }
  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- Простая нота ---------- */
  function note(freq, start, dur, opts) {
    opts = opts || {};
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opts.type || "sine"; o.frequency.value = freq;
    if (opts.detune) o.detune.value = opts.detune;
    const a = opts.attack || 0.01, v = opts.vol || 0.2;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(v, start + a);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    let out = g;
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = opts.lp; g.connect(f); out = f; }
    o.connect(g); out.connect(opts.dest || sfxGain);
    o.start(start); o.stop(start + dur + 0.05);
  }

  /* ---------- Встроенная фоновая музыка ---------- */
  // Аккорды: Fmaj9 – Am7 – Dm9 – Bbmaj7(#11) – медленно и тепло
  const chords = [[53, 60, 64, 67, 69], [57, 60, 64, 67, 71], [50, 57, 60, 64, 65], [46, 57, 62, 65, 69]];
  const melody = [72, 74, 76, 79, 81, 84, 76, 72];
  let step = 0;
  function scheduleBar() {
    if (!synthOn) return;
    const t = ctx.currentTime + 0.05, bar = 6.4;
    const ch = chords[step % chords.length];
    // мягкий пэд
    ch.forEach((m, i) => {
      note(mtof(m), t + i * 0.04, bar + 1.6, { type: i === 0 ? "sine" : "triangle", vol: i === 0 ? 0.12 : 0.045, attack: 1.8, lp: 1400, dest: musicGain, detune: (i % 2 ? 6 : -6) });
    });
    // «музыкальная шкатулка»
    const n = 5 + (step % 3);
    for (let k = 0; k < n; k++) {
      if (Math.random() < 0.3) continue;
      const m = melody[Math.floor(Math.random() * melody.length)] + (ch[0] % 12 === 10 ? -2 : 0);
      const tt = t + 0.4 + k * (bar / n) + Math.random() * 0.1;
      note(mtof(m), tt, 2.2, { type: "sine", vol: 0.055, attack: 0.005, dest: musicGain });
      note(mtof(m + 12), tt, 1.2, { type: "sine", vol: 0.012, attack: 0.005, dest: musicGain });
    }
    step++;
    synthTimer = setTimeout(scheduleBar, bar * 1000 - 60);
  }
  function startSynth() { if (synthOn) return; synthOn = true; step = 0; scheduleBar(); }
  function stopSynth() { synthOn = false; clearTimeout(synthTimer); }

  /* ---------- Пользовательский файл ---------- */
  function tryFile() {
    return new Promise(res => {
      if (fileOk !== null) return res(fileOk);
      if (!musicCfg.file) { fileOk = false; return res(false); }
      fileAudio = new Audio();
      fileAudio.loop = true; fileAudio.preload = "auto";
      fileAudio.volume = musicCfg.volume === undefined ? 0.6 : musicCfg.volume;
      let done = false;
      const fin = ok => { if (done) return; done = true; fileOk = ok; res(ok); };
      fileAudio.addEventListener("canplay", () => fin(true), { once: true });
      fileAudio.addEventListener("error", () => fin(false), { once: true });
      setTimeout(() => fin(fileAudio.readyState >= 2), 2500);
      fileAudio.src = musicCfg.file;
      fileAudio.load();
    });
  }

  async function enable() {
    if (!ensureCtx()) return false;
    if (ctx.state === "suspended") await ctx.resume();
    enabled = true;
    const ok = await tryFile();
    if (!enabled) return true;
    if (ok) {
      try { await fileAudio.play(); } catch (e) { fileOk = false; }
    }
    if (!fileOk) {
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(0.9, ctx.currentTime, 1.2);
      startSynth();
    }
    return true;
  }
  function disable() {
    enabled = false;
    if (fileAudio) fileAudio.pause();
    if (ctx) { musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => { if (!enabled) stopSynth(); }, 900); }
  }
  function toggle() { return enabled ? (disable(), Promise.resolve(false)) : enable().then(() => true); }

  /* ---------- Звуковые эффекты ---------- */
  function sfx(kind) {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + 0.01;
    if (kind === "tap") {
      note(mtof(88), t, 0.25, { vol: 0.06 }); note(mtof(95), t + 0.04, 0.3, { vol: 0.04 });
    } else if (kind === "location") {
      [72, 76, 79, 84].forEach((m, i) => note(mtof(m), t + i * 0.09, 1.6, { vol: 0.07, type: "sine" }));
      note(mtof(48), t, 2.5, { vol: 0.08, type: "sine", attack: 0.3 });
    } else if (kind === "open") {
      [79, 84, 88].forEach((m, i) => note(mtof(m), t + i * 0.06, 0.9, { vol: 0.06 }));
    } else if (kind === "letter") {
      // шорох бумаги + тёплое арпеджио
      const len = 0.6, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2) * 0.5;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "bandpass"; f.frequency.value = 2400; g.gain.value = 0.25;
      src.buffer = buf; src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
      [65, 69, 72, 77, 81, 84].forEach((m, i) => note(mtof(m), t + 0.3 + i * 0.12, 2.4, { vol: 0.06 }));
    } else if (kind === "secret") {
      [84, 88, 91, 96, 100].forEach((m, i) => note(mtof(m), t + i * 0.07, 1.2, { vol: 0.045 }));
    } else if (kind === "whoosh") {
      const len = 1.2, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = "lowpass"; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1600, t + 0.6); f.frequency.linearRampToValueAtTime(300, t + 1.2);
      g.gain.value = 0.12; src.buffer = buf; src.connect(f); f.connect(g); g.connect(sfxGain); src.start(t);
    }
  }

  // пауза, когда вкладка скрыта
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend(); if (fileAudio && enabled) fileAudio.pause(); }
    else if (enabled) { ctx.resume(); if (fileAudio && fileOk) fileAudio.play().catch(() => {}); }
  });

  OP.audio = { enable, disable, toggle, sfx, get enabled() { return enabled; } };
})();
