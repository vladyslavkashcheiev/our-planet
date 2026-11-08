/* =====================================================================
   OUR PLANET — интерфейс: карточки, окна, письмо, финал, подписи.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});
  const $ = (s) => document.querySelector(s);
  let C = null;
  const tx = (s) => String(s == null ? "" : s).replace(/\{her\}/g, (C && C.names && C.names.her) || "").replace(/\{him\}/g, (C && C.names && C.names.him) || "");
  const esc = (s) => tx(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icons = () => { if (window.lucide) lucide.createIcons({ attrs: { "stroke-width": 1.8 } }); };

  const UI = {};
  OP.ui = UI;

  UI.icons = icons;
  UI.esc = esc;

  /* ---------- Статические тексты ---------- */
  UI.init = function (content) {
    C = content;
    const p = C.project, u = C.ui;
    document.title = p.pageTitle || p.title;
    $("#intro-title").textContent = tx(p.title);
    $("#intro-tag").textContent = tx(p.tagline);
    $("#intro-dates").textContent = tx(C.dates.label);
    const days = UI.daysTogether();
    $("#intro-days").textContent = days > 0 ? u.daysTogether.replace("{n}", days) : "";
    $("#btn-enter").textContent = tx(C.intro.enterButton);
    $("#sound-hint-text").textContent = tx(C.intro.soundHint);
    $("#brand-name").textContent = tx(p.title);
    $("#brand-tag").textContent = tx(p.tagline);
    $("#hint-text").textContent = tx(u.rotateHint);
    $("#counter-label").textContent = u.discovered;
    $("#overview-text").textContent = u.overviewButton;
    $("#home-text").textContent = u.homeButton;
    $("#story-text").textContent = tx(u.storyButton);
    $("#loc-open-text").textContent = tx(u.openButton);
    $("#light-label").textContent = u.lightMode;
    $("#secrets-label").textContent = u.secretsFound;
    $("#reset-label").textContent = u.resetProgress;
    $("#finale-title").textContent = tx(C.finale.title);
    $("#finale-tag").textContent = tx(C.finale.tagline);
    $("#finale-closing").textContent = tx(C.finale.closing);
    $("#finale-back-text").textContent = tx(C.finale.backButton);
    document.querySelectorAll(".intro-line").forEach((el, i) => { el.textContent = tx(C.intro.lines[i] || ""); });
    $("#counter-dots").innerHTML = "<i></i><i></i><i></i><i></i><i></i>";
    icons();

    // закрытие модального окна
    document.querySelectorAll("#modal [data-close]").forEach(el => el.addEventListener("click", () => UI.closeModal()));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { if (!$("#modal").hidden) UI.closeModal(); else if (!$("#letter").hidden) UI.closeLetter(); }
    });
  };

  UI.daysTogether = function () {
    const s = new Date(C.dates.start + "T00:00:00");
    if (isNaN(s)) return 0;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((now - s) / 86400000);
  };

  /* ---------- Тост ---------- */
  let toastT = null;
  UI.toast = function (msg, ms) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    gsap.killTweensOf(t);
    gsap.fromTo(t, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .35 });
    clearTimeout(toastT);
    toastT = setTimeout(() => gsap.to(t, { opacity: 0, y: 8, duration: .4, onComplete: () => { t.hidden = true; } }), ms || 2600);
  };

  /* ---------- Счётчик ---------- */
  UI.setCounter = function (n, bump) {
    $("#counter-num").textContent = n;
    document.querySelectorAll("#counter-dots i").forEach((d, i) => d.classList.toggle("on", i < n));
    if (bump) { const c = $("#counter"); c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
  };
  UI.setSecrets = function (n, total) { $("#secrets-count").textContent = n + " / " + total; };
  UI.setSound = function (on) {
    const b = $("#btn-sound");
    b.innerHTML = `<i data-lucide="${on ? "volume-2" : "volume-x"}"></i>`;
    b.classList.toggle("on", on);
    $("#btn-sound-hint").classList.toggle("on", on);
    $("#sound-hint-text").textContent = on ? "Музыка включена" : C.intro.soundHint;
    icons();
  };
  UI.setFullscreen = function (on) {
    $("#btn-fullscreen").innerHTML = `<i data-lucide="${on ? "minimize" : "maximize"}"></i>`;
    icons();
  };

  /* ---------- Карточка места ---------- */
  const KICKERS = { ocean: "Место 1 из 5", forest: "Место 2 из 5", mountains: "Место 3 из 5", garden: "Место 4 из 5", city: "Место 5 из 5", home: "Сердце планеты" };
  let locOpenHandler = null;
  UI.showLocCard = function (key, onOpen) {
    const L = key === "home" ? C.home : C.locations[key];
    $("#loc-kicker").textContent = KICKERS[key];
    $("#loc-title").textContent = tx(L.title);
    $("#loc-desc").textContent = tx(L.description);
    $("#loc-action").textContent = tx(L.action);
    locOpenHandler = onOpen;
    const card = $("#loc-card");
    card.hidden = false;
    gsap.killTweensOf(card);
    gsap.fromTo(card, { opacity: 0, y: 30, scale: .97 }, { opacity: 1, y: 0, scale: 1, duration: .6, ease: "power3.out" });
    gsap.fromTo(card.children, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .5, stagger: .06, delay: .1, ease: "power2.out" });
  };
  UI.hideLocCard = function () {
    const card = $("#loc-card");
    if (card.hidden) return;
    gsap.killTweensOf(card);
    gsap.to(card, { opacity: 0, y: 20, duration: .35, ease: "power2.in", onComplete: () => { card.hidden = true; } });
  };
  UI.bindLocCard = function (onClose) {
    $("#loc-open").addEventListener("click", () => { if (locOpenHandler) locOpenHandler(); });
    $("#loc-close").addEventListener("click", () => { UI.hideLocCard(); onClose && onClose(); });
  };

  /* ---------- Пузырь (лес) ---------- */
  let bubbleT = null;
  UI.bubble = function (text) {
    const b = $("#bubble");
    $("#bubble-text").textContent = tx(text);
    b.hidden = false;
    gsap.killTweensOf(b);
    gsap.fromTo(b, { opacity: 0, y: -14, scale: .9, xPercent: -50, x: 0 }, { opacity: 1, y: 0, scale: 1, xPercent: -50, duration: .5, ease: "back.out(1.8)" });
    clearTimeout(bubbleT);
    bubbleT = setTimeout(() => gsap.to(b, { opacity: 0, y: -10, duration: .45, onComplete: () => { b.hidden = true; } }), 3800);
  };

  /* ---------- Модальное окно ---------- */
  let modalClose = null;
  UI.openModal = function (html, onMount, onClose) {
    const m = $("#modal"), body = $("#modal-body"), panel = m.querySelector(".modal-panel");
    body.innerHTML = html;
    modalClose = onClose || null;
    m.hidden = false;
    icons();
    gsap.killTweensOf([m.querySelector(".modal-backdrop"), panel]);
    gsap.fromTo(m.querySelector(".modal-backdrop"), { opacity: 0 }, { opacity: 1, duration: .45 });
    gsap.fromTo(panel, { opacity: 0, y: 40, scale: .94, rotationX: 8 }, { opacity: 1, y: 0, scale: 1, rotationX: 0, duration: .7, ease: "power3.out" });
    if (onMount) onMount(body);
  };
  UI.closeModal = function () {
    const m = $("#modal");
    if (m.hidden) return;
    const panel = m.querySelector(".modal-panel");
    gsap.to(m.querySelector(".modal-backdrop"), { opacity: 0, duration: .35 });
    gsap.to(panel, { opacity: 0, y: 30, scale: .96, duration: .35, ease: "power2.in", onComplete: () => { m.hidden = true; $("#modal-body").innerHTML = ""; } });
    if (modalClose) { const f = modalClose; modalClose = null; f(); }
  };
  UI.isModalOpen = () => !$("#modal").hidden;

  /* Листаемые карточки (свайп + стрелки) */
  function carousel(root, items, opts) {
    opts = opts || {};
    const track = root.querySelector(".carousel-track"), dots = root.querySelector(".dots");
    let i = opts.start || 0;
    track.innerHTML = items.map((t, k) => `<div class="c-card" data-k="${k}"><span class="c-num">${String(k + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}</span><span>${esc(t)}</span><span class="c-heart">♥</span></div>`).join("");
    dots.innerHTML = items.map(() => "<i></i>").join("");
    const cards = [...track.children];
    cards.forEach((c, k) => gsap.set(c, { opacity: k === i ? 1 : 0, x: 0, rotation: 0, scale: 1, pointerEvents: k === i ? "auto" : "none" }));
    const sync = () => [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
    sync();
    function go(dir) {
      const n = (i + dir + items.length) % items.length;
      const out = cards[i], inn = cards[n];
      gsap.to(out, { x: -dir * 120, rotation: -dir * 6, opacity: 0, duration: .45, ease: "power2.in", pointerEvents: "none" });
      gsap.fromTo(inn, { x: dir * 120, rotation: dir * 6, opacity: 0, scale: .96 }, { x: 0, rotation: 0, opacity: 1, scale: 1, duration: .55, delay: .12, ease: "power3.out", pointerEvents: "auto" });
      i = n; sync();
      OP.audio.sfx("tap");
    }
    root.querySelector("[data-prev]").addEventListener("click", () => go(-1));
    root.querySelector("[data-next]").addEventListener("click", () => go(1));
    // свайп
    let sx = null, sy = null;
    track.addEventListener("pointerdown", e => { sx = e.clientX; sy = e.clientY; });
    track.addEventListener("pointerup", e => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    });
    track.addEventListener("pointercancel", () => { sx = null; });
  }

  /* ---------- Окна мест ---------- */
  UI.openCompliments = function (onClose) {
    const L = C.locations.ocean;
    UI.openModal(`
      <div class="m-icon"><i data-lucide="lightbulb"></i></div>
      <div class="m-kicker">${esc(L.title)}</div>
      <h3 class="m-title">${esc(L.complimentsTitle)}</h3>
      <div class="carousel">
        <div class="carousel-track"></div>
        <div class="carousel-nav">
          <button class="icon-btn" data-prev aria-label="Назад"><i data-lucide="chevron-left"></i></button>
          <div class="dots"></div>
          <button class="icon-btn" data-next aria-label="Дальше"><i data-lucide="chevron-right"></i></button>
        </div>
        <div class="swipe-hint">Листай карточки</div>
      </div>`, (body) => { carousel(body.querySelector(".carousel"), L.compliments); icons(); }, onClose);
  };

  UI.openMountain = function (onClose) {
    const L = C.locations.mountains;
    UI.openModal(`
      <div class="m-icon"><i data-lucide="mountain"></i></div>
      <div class="m-kicker">${esc(L.title)}</div>
      <h3 class="m-title">${esc(L.messageTitle)}</h3>
      <p class="quote">${esc(L.message)}</p>`, (body) => {
      gsap.fromTo(body.querySelector(".quote"), { opacity: 0, y: 16, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.2, delay: .25, ease: "power2.out" });
    }, onClose);
  };

  UI.openReason = function (index, opened, onClose) {
    const L = C.locations.garden;
    const list = L.reasons;
    const N = list.length;
    let cur = index % N;
    // каждая просмотренная причина «распускает» свой цветок на планете
    const see = (k) => { if (OP.app && OP.app.openFlower) OP.app.openFlower(k); else opened.add(k); };
    const render = (body) => {
      const n = opened.size;
      body.querySelector(".reason-num").textContent = String(cur + 1).padStart(2, "0");
      body.querySelector(".reason-text").textContent = tx(list[cur]);
      body.querySelector(".reason-progress").innerHTML = `Открыто причин: <b>${n}</b> из ${N}` + (n < N ? " · листай дальше" : " · ты открыла все ❤");
      body.querySelectorAll(".reason-grid button[data-k]").forEach(b => {
        const k = +b.dataset.k;
        b.classList.toggle("on", opened.has(k));
        b.classList.toggle("cur", k === cur);
        b.textContent = opened.has(k) ? k + 1 : "·";
      });
    };
    function go(body, k, dir) {
      cur = (k + N) % N;
      see(cur);
      render(body);
      const card = body.querySelector(".reason-card");
      gsap.fromTo(card, { opacity: 0, x: (dir || 0) * 60, scale: .97 }, { opacity: 1, x: 0, scale: 1, duration: .45, ease: "power3.out" });
      OP.audio.sfx("tap");
    }
    UI.openModal(`
      <div class="m-icon"><i data-lucide="flower-2"></i></div>
      <div class="m-kicker">${esc(L.title)}</div>
      <h3 class="m-title">${esc(L.reasonsTitle)}</h3>
      <div class="reason-card" style="touch-action:pan-y"><div class="reason-num"></div><p class="reason-text"></p></div>
      <div class="carousel-nav">
        <button class="icon-btn" type="button" data-prev aria-label="Предыдущая причина"><i data-lucide="chevron-left"></i></button>
        <div class="reason-progress" style="margin:0"></div>
        <button class="icon-btn" type="button" data-next aria-label="Следующая причина"><i data-lucide="chevron-right"></i></button>
      </div>
      <div class="reason-grid">${list.map((_, k) => `<button type="button" data-k="${k}" aria-label="Причина ${k + 1}">·</button>`).join("")}</div>
      <div class="swipe-hint">Листай стрелками или свайпом</div>`, (body) => {
      see(cur);
      render(body);
      icons();
      body.querySelector("[data-prev]").addEventListener("click", () => go(body, cur - 1, -1));
      body.querySelector("[data-next]").addEventListener("click", () => go(body, cur + 1, 1));
      body.querySelectorAll(".reason-grid button[data-k]").forEach(b => b.addEventListener("click", () => { const k = +b.dataset.k; go(body, k, k > cur ? 1 : -1); }));
      const card = body.querySelector(".reason-card");
      let sx = null, sy = null;
      card.addEventListener("pointerdown", e => { sx = e.clientX; sy = e.clientY; });
      card.addEventListener("pointerup", e => {
        if (sx === null) return;
        const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(body, cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      });
      card.addEventListener("pointercancel", () => { sx = null; });
      UI._reasonKeys = (e) => { if (e.key === "ArrowRight") go(body, cur + 1, 1); else if (e.key === "ArrowLeft") go(body, cur - 1, -1); };
      document.addEventListener("keydown", UI._reasonKeys);
      gsap.fromTo(body.querySelector(".reason-text"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .8, delay: .2 });
    }, () => { document.removeEventListener("keydown", UI._reasonKeys); if (onClose) onClose(); });
  };

  UI.openCity = function (onClose) {
    const L = C.locations.city;
    UI.openModal(`
      <div class="m-icon"><i data-lucide="building-2"></i></div>
      <div class="m-kicker">${esc(L.title)}</div>
      <p class="quote" style="margin-top:12px">${esc(L.towerMessage)}</p>
      <div class="divider">${esc(L.dreamsTitle)}</div>
      <div class="dreams">${L.dreams.map(d => `
        <div class="dream"><div class="dream-icon"><i data-lucide="${esc(d.icon || "sparkles")}"></i></div>
          <div><div class="dream-title">${esc(d.title)}</div><div class="dream-text">${esc(d.text || "")}</div></div></div>`).join("")}
      </div>`, (body) => {
      icons();
      gsap.fromTo(body.querySelector(".quote"), { opacity: 0, scale: .94 }, { opacity: 1, scale: 1, duration: 1, delay: .2, ease: "power2.out" });
      gsap.fromTo(body.querySelectorAll(".dream"), { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: .55, stagger: .12, delay: .7, ease: "power2.out" });
    }, onClose);
  };

  UI.openSecret = function (key, found, total, onClose) {
    const S = C.secrets[key];
    const all = found >= total;
    UI.openModal(`
      <div class="secret-wrap">
        <div class="secret-badge">✦ СЕКРЕТ ${found} / ${total}</div>
        <h3 class="m-title">${esc(S.title)}</h3>
        <p class="secret-text">${esc(S.text)}</p>
        ${all ? `<div class="divider">✦</div><p class="secret-text" style="font-size:20px;color:var(--gold)">${esc(C.secrets.allFoundTitle)} ${esc(C.secrets.allFoundText)}</p>` : ""}
      </div>`, (body) => {
      gsap.fromTo(body.querySelector(".secret-badge"), { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: .6, ease: "back.out(2)" });
    }, onClose);
  };

  /* ---------- Письмо ---------- */
  UI.openLetter = function (onClose) {
    const ov = $("#letter"), env = $("#envelope"), paper = $("#letter-paper");
    const Lt = C.home.letter;
    UI._letterClose = onClose;
    env.classList.remove("open"); env.hidden = false; paper.hidden = true;
    gsap.set(env, { opacity: 1, scale: 1, y: 0 });
    const photos = (C.photos || []).filter(p => p && p.src);
    const d = new Date();
    $("#letter-inner").innerHTML = `
      <div class="l-stamp"><div>OUR PLANET</div></div>
      <div class="l-date">${esc(C.dates.label)}</div>
      <h3 class="l-greeting">${esc(Lt.greeting)}</h3>
      ${Lt.paragraphs.map(p => `<p class="l-p ${/^\s*\[/.test(p) ? "ph" : ""}">${esc(p)}</p>`).join("")}
      ${photos.length ? `<div class="l-photos">${photos.map(p => `<figure class="l-photo"><img src="${esc(p.src)}" alt="" loading="lazy"><span>${esc(p.caption || "")}</span></figure>`).join("")}</div>` : ""}
      <p class="l-closing">${esc(Lt.closing)}</p>
      <p class="l-sign">${esc(Lt.signature)}</p>`;
    ov.hidden = false;
    gsap.fromTo(ov, { opacity: 0 }, { opacity: 1, duration: .8 });
    gsap.fromTo(env, { y: 60, opacity: 0, rotation: -4 }, { y: 0, opacity: 1, rotation: 0, duration: 1.1, ease: "power3.out", delay: .2 });
    $("#letter-close").hidden = false;
  };
  UI.bindLetter = function () {
    $("#env-seal").addEventListener("click", () => {
      const env = $("#envelope"), paper = $("#letter-paper");
      if (env.classList.contains("open")) return;
      env.classList.add("open");
      OP.audio.sfx("letter");
      gsap.to(env, { opacity: 0, y: 40, scale: .9, duration: .7, delay: 1.2, ease: "power2.in", onComplete: () => {
        env.hidden = true; paper.hidden = false; paper.scrollTop = 0;
        gsap.fromTo(paper, { opacity: 0, y: 60, scale: .92, rotation: -1.5 }, { opacity: 1, y: 0, scale: 1, rotation: 0, duration: 1.1, ease: "power3.out" });
        gsap.fromTo(paper.querySelectorAll(".l-greeting, .l-p, .l-photos, .l-closing, .l-sign"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .9, stagger: .35, delay: .5, ease: "power2.out" });
      } });
    });
    $("#letter-close").addEventListener("click", () => UI.closeLetter());
  };
  UI.closeLetter = function () {
    const ov = $("#letter");
    if (ov.hidden) return;
    gsap.to(ov, { opacity: 0, duration: .6, onComplete: () => { ov.hidden = true; } });
    if (UI._letterClose) { const f = UI._letterClose; UI._letterClose = null; f(); }
  };

  /* ---------- Подписи мест ---------- */
  const LABEL_COLORS = { ocean: "#7fe8ff", forest: "#9dffb0", mountains: "#ffffff", garden: "#ff9fd0", city: "#ffd98a", home: "#ffc9a0" };
  const labels = {};
  UI.buildLabels = function (keys, onClick) {
    const root = $("#labels");
    root.innerHTML = "";
    keys.forEach(k => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "label" + (k === "home" ? " home" : "");
      el.style.setProperty("--c", LABEL_COLORS[k]);
      el.textContent = tx(k === "home" ? C.home.title : C.locations[k].title);
      el.addEventListener("click", (e) => { e.stopPropagation(); onClick(k); });
      root.appendChild(el);
      labels[k] = { el, vis: true };
    });
  };
  UI.updateLabel = function (k, x, y, visible, seen) {
    const L = labels[k];
    if (!L) return;
    if (visible !== L.vis) { L.el.classList.toggle("hide", !visible); L.vis = visible; }
    if (seen !== L.seen) { L.el.classList.toggle("seen", !!seen); L.seen = seen; }
    if (visible) L.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  };
  UI.showLabels = function (on) {
    const r = $("#labels");
    if (on) { r.hidden = false; gsap.to(r, { opacity: 1, duration: .6 }); }
    else gsap.to(r, { opacity: 0, duration: .4, onComplete: () => { r.hidden = true; } });
  };

  /* ---------- Интро-тексты ---------- */
  UI.introSequence = function (tl) {
    const lines = document.querySelectorAll(".intro-line");
    const t = document.querySelector(".intro-title");
    tl.fromTo(lines[0], { opacity: 0, y: 14, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.6, ease: "power2.out" }, "+=0.3")
      .to(lines[0], { opacity: 0, y: -8, filter: "blur(6px)", duration: 1.1, ease: "power2.in" }, "+=1.6")
      .fromTo(lines[1], { opacity: 0, y: 14, filter: "blur(8px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.6, ease: "power2.out" }, "+=0.2")
      .to(lines[1], { opacity: 0, y: -8, filter: "blur(6px)", duration: 1.1, ease: "power2.in" }, "+=1.6")
      .addLabel("title")
      .fromTo(t.querySelector(".title-main"), { opacity: 0, letterSpacing: ".5em", filter: "blur(10px)" }, { opacity: 1, letterSpacing: ".14em", filter: "blur(0px)", duration: 2, ease: "power3.out" }, "title")
      .fromTo(t.querySelector(".title-tag"), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 1 }, "title+=0.9")
      .fromTo(t.querySelector(".title-dates"), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 1 }, "title+=1.3")
      .fromTo(t.querySelector(".title-days"), { opacity: 0 }, { opacity: 1, duration: 1 }, "title+=1.6")
      .fromTo(t.querySelector(".btn-enter"), { opacity: 0, y: 14, scale: .95 }, { opacity: 1, y: 0, scale: 1, duration: .9, ease: "back.out(1.6)" }, "title+=2")
      .fromTo(t.querySelector(".btn-sound-hint"), { opacity: 0 }, { opacity: 1, duration: .8 }, "title+=2.4");
    return tl;
  };

  /* ---------- Финал ---------- */
  UI.runFinale = function (onEnd) {
    const f = $("#finale"), box = $("#finale-lines"), end = $("#finale-end");
    box.innerHTML = C.finale.lines.map((l, i) => `<p class="finale-line ${i === C.finale.lines.length - 1 && l.length < 8 ? "big" : ""}">${esc(l)}</p>`).join("");
    f.hidden = false; gsap.set(end, { opacity: 0 }); end.style.pointerEvents = "none";
    const tl = gsap.timeline();
    const ls = box.querySelectorAll(".finale-line");
    ls.forEach((el, i) => {
      const last = i === ls.length - 1;
      tl.fromTo(el, { opacity: 0, y: 16, filter: "blur(10px)", scale: last ? .85 : 1 }, { opacity: 1, y: 0, filter: "blur(0px)", scale: 1, duration: last ? 1.8 : 1.5, ease: "power2.out" }, i === 0 ? "+=0.4" : "+=0.5");
      tl.to(el, { opacity: 0, y: -10, filter: "blur(8px)", duration: 1.1, ease: "power2.in" }, last ? "+=1.8" : "+=1.7");
    });
    tl.add(() => { end.style.pointerEvents = "auto"; if (onEnd) onEnd("end"); });
    tl.fromTo(end, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1.6, ease: "power2.out" });
    tl.fromTo(end.children, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 1, stagger: .35 }, "<");
    UI._finaleTl = tl;
    return tl;
  };
  UI.hideFinale = function () {
    const f = $("#finale");
    if (UI._finaleTl) UI._finaleTl.kill();
    gsap.to(f, { opacity: 0, duration: .8, onComplete: () => { f.hidden = true; gsap.set(f, { opacity: 1 }); } });
  };
})();
