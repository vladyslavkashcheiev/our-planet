/* =====================================================================
   OUR PLANET — главный модуль: сцена, рендер, интро, режимы, финал.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});
  const U = OP.util;
  const V3 = THREE.Vector3;
  const $ = (s) => document.querySelector(s);
  const content = window.OUR_PLANET_CONTENT;
  const PLACE_KEYS = ["ocean", "forest", "mountains", "garden", "city"];
  const ALL_KEYS = PLACE_KEYS.concat(["home"]);
  const params = new URLSearchParams(location.search);

  /* ---------- Проверки ---------- */
  function fatal(msg) {
    const l = $("#loader");
    l.innerHTML = `<p class="loader-text" style="max-width:420px;text-align:center;padding:0 24px">${msg}</p>`;
  }
  if (!window.THREE || !window.gsap) { fatal("Не удалось загрузить библиотеки. Проверьте подключение к интернету и обновите страницу."); return; }
  if (!content) { fatal("Не найден файл js/content.js"); return; }
  function webglOK() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }
  if (!webglOK()) { fatal("Этот браузер не поддерживает 3D-графику (WebGL). Откройте сайт в Safari или Chrome."); return; }

  /* ---------- Качество ---------- */
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  const storedLight = U.store.get("light", null);
  const weak = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  const quality = params.get("q") || (storedLight === true ? "low" : storedLight === false ? "high" : (weak ? "low" : "high"));
  const dpr = window.devicePixelRatio || 1;
  let pixelRatio = quality === "low" ? Math.min(dpr, 1.25) : Math.min(dpr, isMobile ? 1.75 : 2);
  OP.pixelRatio = pixelRatio;

  /* ---------- Рендерер и сцена ---------- */
  const canvas = $("#scene");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", powerPreference: "high-performance", alpha: false });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x05060f, 1);
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 2400);

  // свет
  const hemi = new THREE.HemisphereLight(0xcab8ff, 0x24365e, 0.62);
  const sun = new THREE.DirectionalLight(0xfff0de, 1.05);
  const rim = new THREE.DirectionalLight(0x9d8cff, 0.45);
  const amb = new THREE.AmbientLight(0x5a4a90, 0.18);
  scene.add(hemi, sun, sun.target, rim, rim.target, amb);
  if (renderer.shadowMap.enabled) {
    sun.castShadow = true;
    const sz = isMobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  }

  /* ---------- Строим мир ---------- */
  const t0 = performance.now();
  const stars = OP.effects.buildStars(quality === "low" ? 1400 : 3200);
  stars.material.uniforms.uPR.value = pixelRatio;
  const nebula = OP.effects.buildNebula(quality);
  const distant = OP.effects.buildDistantPlanets();
  const dust = OP.effects.buildDust(quality === "low" ? 140 : 280);
  dust.material.uniforms.uPR.value = pixelRatio;
  const birth = OP.effects.buildBirth(quality === "low" ? 300 : 650);
  birth.material.uniforms.uPR.value = pixelRatio;
  scene.add(nebula, stars, distant, dust, birth);
  const core = U.glowSprite(new THREE.Color("#e9dcff"), 0.01, 0);
  const coreHalo = U.glowSprite(new THREE.Color("#ff9fd0"), 0.01, 0);
  scene.add(core, coreHalo);

  const planet = OP.planetLib.create(scene, quality);
  const locations = OP.locationsLib.create(planet, scene, { quality, content });
  const beacons = OP.effects.buildFinaleBeacons(planet.planet, PLACE_KEYS);

  // секретная звезда
  const secretStar = OP.effects.buildSecretStar();
  scene.add(secretStar.sprite, secretStar.hit);
  secretStar.hit.userData.interact = { kind: "secret", secret: "star" };
  OP.interactives.push(secretStar.hit);

  const cam = OP.cameraLib.create(camera, canvas);
  console.info("[Our Planet] мир построен за " + Math.round(performance.now() - t0) + " мс, качество: " + quality);

  /* ---------- Состояние ---------- */
  const state = {
    mode: "intro",
    focused: null,
    discovered: new Set((U.store.get("discovered", []) || []).filter(k => PLACE_KEYS.includes(k))),
    secrets: new Set(U.store.get("secrets", []) || []),
    flowers: new Set(U.store.get("flowers", []) || []),
    storyShown: false
  };
  locations.places.garden && locations.ctx.garden.flowers.forEach((f, i) => { if (state.flowers.has(i)) f.userData.opened = true; });

  const app = OP.app = {
    renderer, scene, camera, planet, locations, content, state, secretStar,
    secretTotal: 4,
    canInteract: () => (state.mode === "explore" || state.mode === "focus") && !cam.busy && !OP.ui.isModalOpen(),
    focusPlace, openPlace, markOpened, findSecret, saveFlowers, openFlower
  };
  function openFlower(k) {
    const fl = locations.ctx.garden.flowers[k];
    if (state.flowers.has(k)) return;
    state.flowers.add(k);
    if (fl) fl.userData.opened = true;
    saveFlowers();
  }

  /* ---------- Места ---------- */
  function placeTarget(key) {
    const b = OP.BIOMES[key];
    let local, normal = b.c.clone();
    if (key === "home") {
      const h = locations.ctx.home;
      local = h.doorWorld.clone().addScaledVector(h.houseDir, 0.05);
      normal = h.houseDir.clone();
    } else if (key === "mountains") {
      local = b.c.clone().multiplyScalar(OP.R + 1.1);
    } else if (key === "ocean") {
      local = b.c.clone().multiplyScalar(OP.R + 0.45);
    } else {
      local = b.c.clone().multiplyScalar(OP.R + Math.max(0, OP.planetLib.heightAt(b.c)) + 0.12);
    }
    planet.planet.updateMatrixWorld(true);
    const world = planet.planet.localToWorld(local.clone());
    const nWorld = normal.transformDirection(planet.planet.matrixWorld);
    return { world, nWorld };
  }

  function focusPlace(key, then, opts) {
    opts = opts || {};
    if (!OP.BIOMES[key]) return;
    const already = state.focused === key && state.mode === "focus";
    state.focused = key; state.mode = "focus";
    planet.autoRotate = false;
    locations.setFocus(key);
    OP.ui.showLabels(false);
    gsap.to(cloudFade, { v: 0.12, duration: 1.2, onUpdate: () => planet.setCloudOpacity(cloudFade.v) });
    hideSettings();
    if (!already) {
      const t = placeTarget(key);
      const info = locations.places[key];
      let viewDir = null;
      if (info.viewDir) viewDir = info.viewDir.clone().transformDirection(planet.planet.matrixWorld);
      OP.audio.sfx("whoosh");
      cam.focus(t.world, t.nWorld, { dist: info.focusDist, viewDir, phi: key === "home" ? 1.05 : 0.95, onDone: () => { if (then) then(); } });
    } else if (then) then();
    OP.ui.showLocCard(key, () => openPlace(key));
    if (PLACE_KEYS.includes(key) && !state.discovered.has(key)) {
      state.discovered.add(key);
      U.store.set("discovered", [...state.discovered]);
      setTimeout(() => { OP.audio.sfx("location"); OP.ui.setCounter(state.discovered.size, true); checkAll(); }, 900);
    } else if (!opts.quiet && !already) setTimeout(() => OP.audio.sfx("location"), 900);
  }
  const cloudFade = { v: 0.94 };

  function overview() {
    if (state.mode !== "focus" && state.mode !== "explore") return;
    state.focused = null; state.mode = "explore";
    locations.setFocus(null);
    OP.ui.hideLocCard();
    OP.audio.sfx("whoosh");
    cam.overview({ duration: 2.2, onDone: () => { planet.autoRotate = true; } });
    gsap.to(cloudFade, { v: 0.94, duration: 1.6, delay: .6, onUpdate: () => planet.setCloudOpacity(cloudFade.v) });
    setTimeout(() => { if (state.mode === "explore") OP.ui.showLabels(true); }, 1400);
  }

  function markOpened(key) { /* место считается открытым уже при посещении */ }
  function saveFlowers() { U.store.set("flowers", [...state.flowers]); }
  function findSecret(key) {
    const first = !state.secrets.has(key);
    state.secrets.add(key);
    U.store.set("secrets", [...state.secrets]);
    OP.ui.setSecrets(state.secrets.size, app.secretTotal);
    return first;
  }

  /* Главное действие каждого места */
  function openPlace(key) {
    OP.audio.sfx("open");
    if (key === "ocean") OP.ui.openCompliments();
    else if (key === "mountains") OP.ui.openMountain();
    else if (key === "city") OP.ui.openCity();
    else if (key === "home") openDoor();
    else if (key === "forest") {
      const trees = locations.ctx.forest.smileTrees;
      const tree = trees[Math.floor(Math.random() * trees.length)];
      const msgs = content.locations.forest.messages;
      OP.interactions.wiggle(tree);
      OP.effects.burst(scene, planet.planet.localToWorld(tree.userData.anchor.clone()), { count: 30, colors: ["#fff3a0", "#d9ff9a", "#ffd47a"], up: tree.userData.normal.clone().transformDirection(planet.planet.matrixWorld), scale: 0.3 });
      OP.ui.bubble(msgs[Math.floor(Math.random() * msgs.length)]);
    } else if (key === "garden") {
      const fl = locations.ctx.garden.flowers;
      let idx = fl.findIndex((f, i) => !state.flowers.has(i));
      if (idx < 0) idx = 0;
      if (state.flowers.size === 0) OP.ui.toast("Каждый цветок хранит свою причину — нажимай на них");
      const f = fl[idx];
      state.flowers.add(idx); f.userData.opened = true; saveFlowers();
      OP.effects.burst(scene, planet.planet.localToWorld(f.userData.anchor.clone()), { count: 30, hearts: true, up: f.userData.normal.clone().transformDirection(planet.planet.matrixWorld), scale: 0.25 });
      OP.ui.openReason(idx, state.flowers);
    }
  }

  /* ---------- Дом: дверь, камера, письмо ---------- */
  let doorOpen = false;
  function openDoor() {
    if (state.mode === "letter") return;
    const h = locations.ctx.home;
    state.mode = "letter";
    OP.ui.hideLocCard();
    OP.audio.sfx("open");
    const tl = gsap.timeline();
    tl.to(h.hinge.rotation, { y: -1.75, duration: 1.3, ease: "power2.inOut" })
      .to(h.doorLight.material, { opacity: 1, duration: 1 }, "<0.3")
      .to(h.doorLight.scale, { x: 0.9, y: 0.9, duration: 1.2 }, "<")
      .to(cam.st.sph, { dist: 0.75, phi: 1.32, duration: 2.0, ease: "power2.inOut" }, "<0.2")
      .to("#fade", { opacity: 0.85, duration: 0.6, ease: "power1.in" }, "-=0.7")
      .add(() => {
        gsap.to("#hud", { opacity: 0, duration: .4 });
        OP.ui.openLetter(closeLetter);
        gsap.to("#fade", { opacity: 0, duration: 0.6 });
      });
    doorOpen = true;
  }
  function closeLetter() {
    const h = locations.ctx.home;
    gsap.to("#hud", { opacity: 1, duration: .8, delay: .4 });
    state.mode = "focus";
    const info = locations.places.home;
    gsap.to(cam.st.sph, { dist: info.focusDist * cam.aspectFactor(), phi: 1.05, duration: 1.8, ease: "power2.inOut" });
    gsap.to(h.hinge.rotation, { y: 0, duration: 1.2, delay: 0.8, ease: "power2.inOut" });
    gsap.to(h.doorLight.material, { opacity: 0, duration: 1, delay: 0.8 });
    gsap.to(h.doorLight.scale, { x: 0.35, y: 0.35, duration: 1, delay: 0.8 });
    setTimeout(() => { if (state.mode === "focus" && state.focused === "home") OP.ui.showLocCard("home", () => openPlace("home")); }, 1400);
    doorOpen = false;
  }

  /* ---------- Все пять мест открыты ---------- */
  function checkAll() {
    const all = state.discovered.size >= PLACE_KEYS.length;
    const btn = $("#btn-story");
    if (all && btn.hidden) {
      btn.hidden = false;
      gsap.fromTo(btn, { opacity: 0, y: 20, scale: .9 }, { opacity: 1, y: 0, scale: 1, duration: .9, ease: "back.out(1.7)" });
      if (!state.storyShown && state.mode !== "intro") OP.ui.toast("Все пять мест открыты ✨ Посмотри нашу историю", 3600);
      state.storyShown = true;
    }
  }

  /* ---------- Финальная сцена ---------- */
  function runFinale() {
    if (state.mode === "finale") return;
    OP.ui.closeModal();
    state.mode = "finale"; state.focused = null;
    locations.setFocus(null);
    OP.ui.hideLocCard(); OP.ui.showLabels(false); hideSettings();
    gsap.to("#hud", { opacity: 0, duration: .8, onComplete: () => { $("#hud").hidden = true; } });
    planet.autoRotate = true; planet.rotSpeed = 0.05;
    gsap.to(cloudFade, { v: 0.5, duration: 2, onUpdate: () => planet.setCloudOpacity(cloudFade.v) });
    OP.audio.sfx("whoosh");
    cam.overview({ dist: 50 * cam.aspectFactor(), phi: 1.2, duration: 3.6, ease: "power2.inOut" });
    gsap.to(viewShift, { v: 0.15, duration: 3.6, ease: "power2.inOut", onUpdate: applyShift });
    beacons.group.visible = true;
    beacons.sprites.forEach((s, i) => gsap.fromTo(s.material, { opacity: 0 }, { opacity: 1, duration: 1.2, delay: 2.2 + i * 0.45 }));
    beacons.sprites.forEach((s, i) => gsap.fromTo(s.scale, { x: 0.1, y: 0.1 }, { x: 3.2, y: 3.2, duration: 1.2, delay: 2.2 + i * 0.45, ease: "back.out(2)" }));
    beacons.lines.forEach((l, i) => {
      const o = { n: 0 };
      l.material.opacity = 0.75;
      gsap.to(o, { n: 49, duration: 1.4, delay: 4.6 + i * 0.4, ease: "power1.inOut", onUpdate: () => l.geometry.setDrawRange(0, Math.floor(o.n)) });
    });
    setTimeout(() => { if (state.mode === "finale") OP.ui.runFinale(); }, 3800);
  }
  function closeFinale() {
    OP.ui.hideFinale();
    beacons.sprites.forEach(s => gsap.to(s.material, { opacity: 0, duration: 1 }));
    beacons.lines.forEach(l => gsap.to(l.material, { opacity: 0, duration: 1, onComplete: () => { l.geometry.setDrawRange(0, 0); } }));
    setTimeout(() => { beacons.group.visible = false; }, 1100);
    planet.rotSpeed = 0.028;
    state.mode = "explore";
    gsap.to(cloudFade, { v: 0.94, duration: 1.5, onUpdate: () => planet.setCloudOpacity(cloudFade.v) });
    cam.overview({ duration: 2.4 });
    gsap.to(viewShift, { v: 0, duration: 2.4, ease: "power2.inOut", onUpdate: applyShift });
    showHud();
  }

  /* ---------- HUD ---------- */
  function showHud() {
    const hud = $("#hud");
    hud.hidden = false;
    gsap.fromTo(hud, { opacity: 0 }, { opacity: 1, duration: 1 });
    gsap.fromTo(".topbar", { y: -20 }, { y: 0, duration: 1, ease: "power3.out" });
    gsap.fromTo(".bottombar", { y: 20 }, { y: 0, duration: 1, ease: "power3.out" });
    setTimeout(() => { if (state.mode === "explore") OP.ui.showLabels(true); }, 600);
  }
  function hideSettings() { $("#settings").hidden = true; }

  OP.ui.init(content);
  OP.ui.setCounter(state.discovered.size, false);
  OP.ui.setSecrets(state.secrets.size, app.secretTotal);
  OP.ui.buildLabels(ALL_KEYS, (k) => { OP.audio.sfx("tap"); focusPlace(k); });
  OP.ui.bindLocCard(() => overview());
  OP.ui.bindLetter();
  $("#opt-light").checked = quality === "low";

  $("#btn-overview").addEventListener("click", () => { OP.audio.sfx("tap"); if (state.mode === "focus") overview(); else if (state.mode === "explore") { cam.overview({ duration: 1.6 }); } });
  $("#btn-home").addEventListener("click", () => { OP.audio.sfx("tap"); if (state.mode === "explore" || state.mode === "focus") focusPlace("home"); });
  $("#btn-story").addEventListener("click", () => { OP.audio.sfx("open"); runFinale(); });
  $("#finale-back").addEventListener("click", () => { OP.audio.sfx("tap"); closeFinale(); });
  $("#btn-settings").addEventListener("click", (e) => {
    e.stopPropagation();
    const s = $("#settings"); s.hidden = !s.hidden;
    if (!s.hidden) gsap.fromTo(".settings-panel", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: .3 });
  });
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#settings") && !e.target.closest("#btn-settings")) hideSettings(); });
  $("#opt-light").addEventListener("change", (e) => {
    U.store.set("light", e.target.checked);
    OP.ui.toast("Перезагружаем мир…");
    gsap.to("#fade", { opacity: 1, duration: .6, onComplete: () => { const u = new URL(location.href); u.searchParams.delete("q"); u.searchParams.set("skip", "1"); location.replace(u.toString()); } });
  });
  $("#opt-reset").addEventListener("click", () => {
    const light = U.store.get("light", null);
    U.store.clear();
    if (light !== null) U.store.set("light", light);
    location.reload();
  });

  // звук
  async function toggleSound() {
    const on = await OP.audio.toggle();
    OP.ui.setSound(on);
  }
  $("#btn-sound").addEventListener("click", toggleSound);
  $("#btn-sound-hint").addEventListener("click", toggleSound);

  // полный экран
  const fsEl = document.documentElement;
  const canFS = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  $("#btn-fullscreen").addEventListener("click", () => {
    const isFS = document.fullscreenElement || document.webkitFullscreenElement;
    if (!canFS) { OP.ui.toast("На iPhone: «Поделиться» → «На экран Домой» — и мир откроется во весь экран", 4200); return; }
    if (isFS) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { const r = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl); if (r && r.catch) r.catch(() => {}); }
  });
  ["fullscreenchange", "webkitfullscreenchange"].forEach(n => document.addEventListener(n, () => OP.ui.setFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement))));

  // жесты камеры
  let hintStage = 0;
  cam.st.onTap = (x, y) => OP.interactions.handleTap(x, y);
  cam.st.onDragStart = () => {
    if (state.mode === "explore") planet.autoRotate = false;
    clearTimeout(resumeTimer);
    if (hintStage === 0) {
      hintStage = 1;
      const ht = $("#hint-text");
      gsap.to(ht, { opacity: 0, duration: .3, onComplete: () => { ht.textContent = content.ui.tapHint; gsap.to(ht, { opacity: 1, duration: .4 }); } });
      setTimeout(() => $("#hint").classList.add("gone"), 9000);
    }
  };
  cam.st.onZoomOut = () => { if (state.mode === "focus") overview(); };
  let resumeTimer = null;
  canvas.addEventListener("pointerup", () => {
    if (state.mode !== "explore") return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { if (state.mode === "explore") planet.autoRotate = true; }, 4000);
  });

  /* ---------- Интро ---------- */
  const fadeU = (obj, key, to, dur, delay) => gsap.to(obj, { [key]: to, duration: dur, delay: delay || 0 });
  function startIntro() {
    const skip = params.has("skip");
    if (!skip) { viewShift.v = 0.13; applyShift(); }
    cam.setInstant("overview", { theta: 0.35, phi: 1.36, dist: skip ? 34 : 80 });
    planet.pivot.scale.setScalar(skip ? 1 : 0.001);
    planet.atmosphere.scale.setScalar(skip ? 1 : 0.001);
    planet.atmosphere.userData.mats.forEach(m => { m.uniforms.uPower.value = skip ? 1 : 0; });
    $("#loader").style.opacity = 0;
    setTimeout(() => $("#loader").remove(), 1100);

    if (skip) {
      stars.material.uniforms.uFade.value = 1; dust.material.uniforms.uFade.value = 1; nebula.material.opacity = 1;
      birth.visible = false;
      $("#intro").remove();
      state.mode = "explore";
      cam.overview({ dist: cam.defaultDist(), duration: 1.6 });
      showHud(); checkAll();
      return;
    }
    const tl = gsap.timeline();
    tl.to(stars.material.uniforms.uFade, { value: 1, duration: 3, ease: "power1.inOut" }, 0)
      .to(nebula.material, { opacity: 1, duration: 4 }, 0.8)
      .to(dust.material.uniforms.uFade, { value: 1, duration: 3 }, 1.2)
      .to(birth.material.uniforms.uFade, { value: 1, duration: 2 }, 1.4)
      .to(birth.material.uniforms.uP, { value: 1, duration: 6.5, ease: "power1.inOut" }, 1.4)
      .to(core.material, { opacity: 1, duration: 3 }, 2.6)
      .to(core.scale, { x: 7, y: 7, duration: 4.2, ease: "power2.in" }, 2.6)
      .to(coreHalo.material, { opacity: 0.6, duration: 3 }, 3)
      .to(coreHalo.scale, { x: 26, y: 26, duration: 4.5, ease: "power2.inOut" }, 3)
      .add("born", 7.2)
      .to(planet.pivot.scale, { x: 1, y: 1, z: 1, duration: 2.6, ease: "expo.out" }, "born")
      .to(planet.atmosphere.scale, { x: 1, y: 1, z: 1, duration: 2.8, ease: "expo.out" }, "born")
      .to(core.scale, { x: 34, y: 34, duration: .5, ease: "power2.out" }, "born")
      .to(core.material, { opacity: 0, duration: 1.8 }, "born+=0.3")
      .to(coreHalo.material, { opacity: 0, duration: 2.5 }, "born+=0.2")
      .to(birth.material.uniforms.uFade, { value: 0, duration: 1.2 }, "born")
      .add(() => planet.atmosphere.userData.mats.forEach(m => gsap.to(m.uniforms.uPower, { value: 1, duration: 2.5 })), "born+=0.4")
      .add(() => { birth.visible = false; }, "born+=1.5")
      .to(cam.st.sph, { dist: 47 * cam.aspectFactor(), theta: 0.9, duration: 11, ease: "power2.out" }, 0.5);
    const tt = gsap.timeline({ delay: 0.6 });
    OP.ui.introSequence(tt);
    tt.add(() => { state.introReady = true; });
  }

  $("#btn-enter").addEventListener("click", () => {
    if (state.mode !== "intro") return;
    gsap.to(viewShift, { v: 0, duration: 3, ease: "power2.inOut", onUpdate: applyShift });
    state.mode = "entering";
    OP.audio.sfx("whoosh");
    gsap.to("#intro", { opacity: 0, duration: 1, onComplete: () => $("#intro").remove() });
    gsap.killTweensOf(cam.st.sph);
    const d = camera.position.clone().normalize();
    cam.overview({ dist: cam.defaultDist(), theta: Math.atan2(d.x, d.z) + 1.1, phi: 1.25, duration: 3.4, ease: "power3.inOut", onDone: () => {
      state.mode = "explore"; planet.autoRotate = true;
      checkAll();
    } });
    setTimeout(showHud, 2200);
  });

  /* ---------- Цикл рендера ---------- */
  const clock = new THREE.Clock();
  let time = 0, running = true, rafId = 0, slowFrames = 0, lowered = false;
  const _v = new V3(), _camDir = new V3();
  const sunDir = new V3();
  const markerWorld = new V3();

  function frame() {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    time += dt;

    cam.update(dt);

    // свет «следует» за камерой: всегда красивый терминатор
    _camDir.copy(camera.position).normalize();
    sunDir.copy(_camDir).applyAxisAngle(new V3(0, 1, 0), 0.75);
    sunDir.y += 0.45; sunDir.normalize();
    sun.position.copy(sunDir).multiplyScalar(40);
    rim.position.copy(_camDir).multiplyScalar(-30).add(new V3(0, 12, 0));

    planet.update(dt, time, sunDir);
    locations.update(time, dt);
    OP.effects.updateBursts(dt);
    stars.material.uniforms.uTime.value = time;
    dust.material.uniforms.uTime.value = time;
    stars.rotation.y += dt * 0.002;
    dust.rotation.y -= dt * 0.01;
    distant.rotation.y += dt * 0.0015;
    secretStar.sprite.material.rotation = time * 0.2;
    const ss = 9 + Math.sin(time * 1.7) * 1.2;
    if (!gsap.isTweening(secretStar.sprite.scale)) secretStar.sprite.scale.set(ss, ss, 1);

    // подписи мест
    if (state.mode === "explore") {
      const w = window.innerWidth, h = window.innerHeight;
      for (const k of ALL_KEYS) {
        const mk = locations.places[k].marker;
        mk.getWorldPosition(markerWorld);
        const facing = _v.copy(markerWorld).normalize().dot(_camDir);
        _v.copy(markerWorld).project(camera);
        const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h - 18;
        const vis = facing > 0.28 && _v.z < 1 && sx > 64 && sx < w - 64 && sy > 90 && sy < h - 150;
        OP.ui.updateLabel(k, sx, sy, vis, state.discovered.has(k));
      }
    }

    renderer.render(scene, camera);

    // адаптивное качество: если долго тормозит — уменьшаем разрешение
    if (state.mode === "explore" && !lowered) {
      if (dt > 0.045) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 90) {
        lowered = true;
        pixelRatio = Math.max(1, pixelRatio * 0.7);
        renderer.setPixelRatio(pixelRatio);
        resize();
      }
    }
  }

  const viewShift = { v: 0 };
  function applyShift() {
    const w = window.innerWidth, h = window.innerHeight;
    if (viewShift.v > 0.001) camera.setViewOffset(w, h, 0, h * viewShift.v, w, h); else camera.clearViewOffset();
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.fov = w / h < 0.7 ? 50 : 42;
    camera.updateProjectionMatrix();
    applyShift();
    renderer.setSize(w, h, false);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 300));
  resize();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { running = false; cancelAnimationFrame(rafId); gsap.globalTimeline.pause(); }
    else if (!running) { running = true; clock.getDelta(); gsap.globalTimeline.resume(); frame(); }
  });

  // освобождение ресурсов при закрытии страницы
  window.addEventListener("pagehide", () => { cancelAnimationFrame(rafId); U.disposeObject(scene); renderer.dispose(); });

  // первый кадр, затем интро
  renderer.compile(scene, camera);
  frame();
  requestAnimationFrame(() => startIntro());
})();
