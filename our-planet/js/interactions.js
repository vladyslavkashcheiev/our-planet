/* =====================================================================
   OUR PLANET — нажатия по 3D-объектам и их реакции.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});
  const V3 = THREE.Vector3;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let forestMsg = 0;

  function findInteract(o) {
    while (o) { if (o.userData && o.userData.interact) return o; o = o.parent; }
    return null;
  }

  /* Обработка короткого нажатия по сцене */
  function handleTap(x, y) {
    const app = OP.app;
    if (!app || !app.canInteract()) return;
    const rect = app.renderer.domElement.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, app.camera);
    raycaster.params.Points = { threshold: 0 };

    // 1) интерактивные объекты (ближайший, не закрытый планетой)
    const hits = raycaster.intersectObjects(OP.interactives, true);
    const terrainHit = raycaster.intersectObject(app.planet.terrain, false)[0];
    for (const h of hits) {
      const obj = findInteract(h.object);
      if (!obj || !obj.visible || !isVisibleDeep(obj)) continue;
      // если планета ближе — объект с обратной стороны
      if (terrainHit && terrainHit.distance < h.distance - 0.35) break;
      activate(obj, h.point);
      return;
    }
    // 2) поверхность планеты → выбрать место
    if (terrainHit) {
      const local = app.planet.planet.worldToLocal(terrainHit.point.clone()).normalize();
      const info = OP.planetLib.heightInfo(local);
      if (info.biome && info.w > 0.35 && info.biome !== app.state.focused) {
        OP.audio.sfx("tap");
        app.focusPlace(info.biome);
      }
    }
  }
  function isVisibleDeep(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }

  /* Реакции объектов */
  function activate(obj, point) {
    const app = OP.app;
    const d = obj.userData.interact;
    const C = app.content;
    OP.audio.sfx("tap");

    if (d.kind === "secret") return secret(obj, d.secret, point);
    if (d.kind === "marker") return app.focusPlace(d.biome);

    // объект в другом месте — сначала долетаем, потом действие
    const run = () => action(obj, d, point);
    if (app.state.focused !== d.biome) app.focusPlace(d.biome, run, { quiet: true });
    else run();
  }

  function action(obj, d, point) {
    const app = OP.app, C = app.content, scene = app.scene;
    const up = obj.userData.normal ? obj.userData.normal.clone().transformDirection(app.planet.planet.matrixWorld) : new V3(0, 1, 0);
    const anchorW = obj.userData.anchor ? app.planet.planet.localToWorld(obj.userData.anchor.clone()) : point;
    switch (d.kind) {
      case "lighthouse":
        OP.effects.burst(scene, anchorW, { count: 40, colors: ["#fff1c2", "#9ff8ff", "#ffc6ea"], up, scale: 0.35 });
        app.openPlace("ocean");
        break;
      case "tree": {
        const msgs = C.locations.forest.messages;
        const msg = msgs[(d.index + forestMsg++) % msgs.length];
        wiggle(obj);
        OP.effects.burst(scene, anchorW, { count: 34, colors: ["#fff3a0", "#d9ff9a", "#ffd47a", "#ffffff"], up, scale: 0.3 });
        OP.ui.bubble(msg);
        app.markOpened("forest");
        break;
      }
      case "spirit": {
        const msgs = C.locations.forest.messages;
        hop(obj, up);
        OP.effects.burst(scene, anchorW || point, { count: 20, hearts: true, up, scale: 0.22 });
        OP.ui.bubble(msgs[(forestMsg++ * 3 + d.index) % msgs.length]);
        app.markOpened("forest");
        break;
      }
      case "flag":
      case "bridge":
        OP.effects.burst(scene, anchorW, { count: 30, colors: ["#ffffff", "#ffd98a", "#ff9fcb"], up, scale: 0.35 });
        app.openPlace("mountains");
        break;
      case "flower":
        bloomFlower(obj, d.index, up, anchorW);
        break;
      case "tower":
        OP.effects.burst(scene, anchorW, { count: 50, colors: ["#ffd98a", "#ffe2a0", "#ffc0e0", "#ffffff"], up, scale: 0.45 });
        app.openPlace("city");
        break;
      case "door":
        app.openPlace("home");
        break;
    }
  }

  function bloomFlower(obj, index, up, anchorW) {
    const app = OP.app;
    const opened = app.state.flowers;
    const first = !opened.has(index);
    opened.add(index);
    obj.userData.opened = true;
    app.saveFlowers();
    const mesh = obj.userData.mesh;
    // цветок «распускается»: короткий упругий импульс масштаба вокруг якоря
    const a = obj.userData.anchor;
    const s = { v: 1 };
    gsap.fromTo(s, { v: 1 }, { v: 1.18, duration: .25, yoyo: true, repeat: 1, ease: "sine.inOut", onUpdate: () => {
      mesh.position.copy(a).multiplyScalar(1 - s.v);
      mesh.scale.setScalar(s.v);
    } });
    OP.effects.burst(app.scene, anchorW, { count: first ? 36 : 16, hearts: true, up, scale: 0.25 });
    if (first) OP.audio.sfx("open");
    app.markOpened("garden");
    setTimeout(() => OP.ui.openReason(index, opened), 350);
  }

  function wiggle(obj) {
    const mesh = obj.userData.mesh;
    const a = obj.userData.anchor, n = obj.userData.normal;
    const axis = new V3().crossVectors(n, new V3(0, 1, 0)).normalize();
    if (axis.lengthSq() < 0.1) axis.set(1, 0, 0);
    const base = a.clone().addScaledVector(n, -0.5);  // основание ствола
    const st = { a: 0 };
    gsap.to(st, { keyframes: [{ a: 0.12, duration: .12 }, { a: -0.1, duration: .16 }, { a: 0.06, duration: .14 }, { a: 0, duration: .2 }], onUpdate() {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, st.a);
      mesh.quaternion.copy(q);
      // поворот вокруг основания: p' = base + q*(p-base) => offset = base - q*base
      mesh.position.copy(base).sub(base.clone().applyQuaternion(q));
    } });
  }
  function hop(obj, up) {
    const st = { h: 0 }, b = obj.userData.base;
    obj.userData.base = b; // базовая высота задаётся в анимации духов
    gsap.to(obj.rotation, { y: obj.rotation.y + Math.PI * 2, duration: .8, ease: "power2.out" });
  }

  /* Секреты */
  function secret(obj, key, point) {
    const app = OP.app;
    const firstTime = app.findSecret(key);
    OP.audio.sfx("secret");
    const wp = new V3(); obj.getWorldPosition(wp);
    if (key === "heart") {
      OP.effects.burst(app.scene, wp, { count: 70, hearts: true, scale: 0.5, up: wp.clone().normalize() });
      gsap.fromTo(obj.scale, { x: 1, y: 1, z: 1 }, { x: 1.8, y: 1.8, z: 1.8, duration: .25, yoyo: true, repeat: 1 });
    } else if (key === "bottle") {
      OP.effects.burst(app.scene, wp, { count: 30, colors: ["#a8fff0", "#ffffff", "#9fd8ff"], scale: 0.3, up: wp.clone().normalize() });
      gsap.fromTo(obj.rotation, { y: 0 }, { y: Math.PI * 4, duration: 1.2, ease: "power2.out" });
    } else if (key === "moon") {
      OP.effects.burst(app.scene, wp, { count: 50, colors: ["#e9e2ff", "#ffffff", "#c9a6ff"], scale: 1.2 });
      gsap.fromTo(obj.rotation, { x: 0 }, { x: Math.PI * 2, duration: 1.4, ease: "power3.out" });
      gsap.fromTo(obj.scale, { x: 1, y: 1, z: 1 }, { x: 1.35, y: 1.35, z: 1.35, duration: .35, yoyo: true, repeat: 1 });
    } else if (key === "star") {
      OP.effects.burst(app.scene, wp, { count: 60, colors: ["#fff1d0", "#ffd98a", "#ffc0e0"], scale: 6 });
      const sp = app.secretStar.sprite;
      gsap.fromTo(sp.scale, { x: 9, y: 9 }, { x: 22, y: 22, duration: .4, yoyo: true, repeat: 1, ease: "sine.inOut" });
    }
    setTimeout(() => OP.ui.openSecret(key, app.state.secrets.size, app.secretTotal), firstTime ? 650 : 250);
  }

  OP.interactions = { handleTap, wiggle };
})();
