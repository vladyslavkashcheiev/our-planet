/* =====================================================================
   OUR PLANET — пять мест, Наш дом и секреты в 3D.
   Каждое место собирается из простых форм в один-два меша
   (мало draw calls), интерактивные объекты — отдельно.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});
  const U = OP.util;
  const V3 = THREE.Vector3;
  const P = OP.planetLib;
  const R = OP.R;
  const B = OP.BIOMES;

  /* ---------- Общие геометрии ---------- */
  const G = {};
  function initGeo(q) {
    const seg = q === "low" ? 7 : 10;
    G.cyl = new THREE.CylinderGeometry(1, 1, 1, seg).translate(0, 0.5, 0);
    G.cylT = new THREE.CylinderGeometry(0.7, 1, 1, seg).translate(0, 0.5, 0);
    G.cone = new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0);
    G.sph = new THREE.IcosahedronGeometry(1, q === "low" ? 1 : 2);
    G.sphLo = new THREE.IcosahedronGeometry(1, 1);
    G.box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    G.boxC = new THREE.BoxGeometry(1, 1, 1);
    G.pyr = new THREE.ConeGeometry(0.72, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    G.plane = new THREE.PlaneGeometry(1, 1);
    G.torus = new THREE.TorusGeometry(1, 0.18, 6, 18).rotateX(Math.PI / 2);
    G.petal = new THREE.SphereGeometry(1, 8, 6).scale(0.42, 0.12, 1).translate(0, 0, 0.85);
    G.disc = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  }

  /* ---------- Размещение ---------- */
  function at(b, dx, dy, water) {
    const dir = U.offsetDir(b.c, dx, dy);
    const h = P.heightAt(dir);
    return { dir, h, r: R + (water ? Math.max(h, 0) : h) };
  }
  /* Поворот вокруг нормали так, чтобы локальная ось +Z смотрела в сторону target-направления */
  const _up = new V3(0, 1, 0);
  function faceSpin(dir, towardDir) {
    const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
    const z = new V3(0, 0, 1).applyQuaternion(q);
    const t = towardDir.clone().addScaledVector(dir, -towardDir.dot(dir)).normalize();
    const ang = Math.atan2(new V3().crossVectors(z, t).dot(dir), z.dot(t));
    return ang;
  }
  function put(builder, geo, b, dx, dy, lm, color, o) {
    o = o || {};
    const p = at(b, dx, dy, o.water);
    const m = U.surfaceMatrix(p.dir, p.r - (o.sink === undefined ? 0.02 : o.sink), { spin: o.spin || 0 });
    if (lm) m.multiply(lm);
    builder.add(geo, m, color);
    return p;
  }
  const L = U.localMatrix;

  const stdMat = (opts) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, metalness: 0 }, opts || {}));
  const glowMat = () => new THREE.MeshBasicMaterial({ vertexColors: true });

  function meshFrom(builder, mat, shadows) {
    const g = builder.build();
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    if (shadows) { m.castShadow = true; m.receiveShadow = true; }
    return m;
  }

  /* Интерактивный объект: свой материал (для подсветки) + невидимая зона нажатия */
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  function makeInteractive(builder, pos, dir, data, hitRadius, ctx) {
    const geo = builder.build();
    const mat = stdMat({ emissive: new THREE.Color("#b58cff"), emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = ctx.shadows; mesh.receiveShadow = ctx.shadows;
    const group = new THREE.Group();
    group.add(mesh);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 8, 6), hitMat);
    hit.position.copy(pos);
    group.add(hit);
    group.userData.interact = data;
    group.userData.anchor = pos.clone();
    group.userData.normal = dir.clone();
    group.userData.mesh = mesh;
    ctx.glowMats.push(mat);
    ctx.interactives.push(group);
    OP.interactives.push(group);
    return group;
  }

  /* ---------- Частицы: парение / падение / фонтан ---------- */
  function floaters(b, opts) {
    const n = opts.count;
    const r = U.rng(opts.seed || 9);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), tan = new Float32Array(n * 3), ph = new Float32Array(n), col = new Float32Array(n * 3);
    const pal = opts.colors.map(c => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      let dx, dy;
      if (opts.center) { dx = opts.center[0]; dy = opts.center[1]; }
      else { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * opts.spread; dx = Math.cos(a) * d; dy = Math.sin(a) * d; }
      const p = at(b, dx, dy, true);
      const hgt = opts.h0 + r() * (opts.h1 - opts.h0);
      const base = p.dir.clone().multiplyScalar(p.r + hgt);
      pos.set([base.x, base.y, base.z], i * 3);
      nor.set([p.dir.x, p.dir.y, p.dir.z], i * 3);
      const f = U.tangentFrame(p.dir);
      const a2 = r() * Math.PI * 2;
      const t = f.east.clone().multiplyScalar(Math.cos(a2)).addScaledVector(f.north, Math.sin(a2));
      tan.set([t.x, t.y, t.z], i * 3);
      ph[i] = r();
      const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aN", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("aT", new THREE.BufferAttribute(tan, 3));
    g.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: opts.normalBlend ? THREE.NormalBlending : THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uTime: { value: 0 }, uPR: { value: OP.pixelRatio || 1 }, uSize: { value: opts.size }, uMode: { value: opts.mode || 0 }, uAmp: { value: opts.amp || 0.15 }, uBoost: { value: 1 }, uMap: { value: opts.map || U.glowTexture() } },
      vertexShader: `attribute vec3 aN; attribute vec3 aT; attribute float aPh; uniform float uTime; uniform float uPR; uniform float uSize; uniform float uMode; uniform float uAmp;
        varying vec3 vC; varying float vA;
        void main(){
          vec3 p = position; vA = 1.0;
          vec3 b2 = cross(aN, aT);
          if (uMode < 0.5) {            // парение
            float t = uTime * (0.4 + aPh*0.5) + aPh*20.0;
            p += aT * sin(t) * uAmp + b2 * cos(t*1.3) * uAmp + aN * sin(t*0.7) * uAmp * 0.6;
            vA = 0.35 + 0.65 * pow(0.5 + 0.5*sin(uTime*2.0 + aPh*30.0), 2.0);
          } else if (uMode < 1.5) {     // падение лепестков
            float h = fract(uTime * 0.06 + aPh);
            p += aN * (0.6 - h * 0.9) + aT * (h * 0.6 + sin(uTime + aPh*10.0)*0.08) + b2 * cos(uTime*0.8 + aPh*7.0) * 0.1;
            vA = smoothstep(0.0, 0.15, h) * (1.0 - smoothstep(0.8, 1.0, h));
          } else {                      // фонтан
            float tau = fract(uTime * 0.7 + aPh) * 1.0;
            p += aN * (tau * 0.55 - tau * tau * 0.5) + aT * tau * 0.12;
            vA = 1.0 - tau;
          }
          vC = color;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * uPR * (60.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uMap; uniform float uBoost; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * uBoost, t.a * vA); }`
    });
    if (!opts.normalBlend) mat.fragmentShader = mat.fragmentShader.replace("gl_FragColor = vec4(vC * uBoost, t.a * vA);", "gl_FragColor = vec4(vC * uBoost * t.a * vA, 1.0);");
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    return pts;
  }

  function petalTexture() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    g.translate(32, 32); g.rotate(0.6);
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 26);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 26, 13, 0, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(cv);
  }

  /* ================= ДЕРЕВЬЯ И ДЕКОР ================= */
  function addPine(bd, b, dx, dy, s, r) {
    const sp = r() * 6;
    put(bd, G.cyl, b, dx, dy, L(0, 0, 0, 0, 0, 0, 0.035 * s, 0.12 * s, 0.035 * s), "#7a5a4a", { spin: sp });
    put(bd, G.cone, b, dx, dy, L(0, 0.08 * s, 0, 0, 0, 0, 0.16 * s, 0.24 * s, 0.16 * s), "#2f8a6e", { spin: sp });
    put(bd, G.cone, b, dx, dy, L(0, 0.2 * s, 0, 0, 0, 0, 0.12 * s, 0.2 * s, 0.12 * s), "#3aa27c", { spin: sp });
    put(bd, G.cone, b, dx, dy, L(0, 0.31 * s, 0, 0, 0, 0, 0.08 * s, 0.15 * s, 0.08 * s), "#4dbb8a", { spin: sp });
  }
  function addRoundTree(bd, b, dx, dy, s, col, r) {
    put(bd, G.cyl, b, dx, dy, L(0, 0, 0, 0, 0, 0, 0.03 * s, 0.18 * s, 0.03 * s), "#86604c");
    put(bd, G.sph, b, dx, dy, L(0, 0.24 * s, 0, 0, 0, 0, 0.14 * s, 0.13 * s, 0.14 * s), col);
    put(bd, G.sph, b, dx, dy, L(0.07 * s, 0.2 * s, 0.03 * s, 0, 0, 0, 0.09 * s), col);
    put(bd, G.sph, b, dx, dy, L(-0.06 * s, 0.19 * s, -0.04 * s, 0, 0, 0, 0.085 * s), col);
  }
  function addRock(bd, b, dx, dy, s, col, water) {
    put(bd, G.sphLo, b, dx, dy, L(0, 0, 0, 0.3, 0.5, 0, 0.07 * s, 0.05 * s, 0.06 * s), col || "#9a93b5", { water, sink: 0.01 });
  }
  function addPalm(bd, b, dx, dy, s, r) {
    const lean = (r() - 0.5) * 0.4;
    put(bd, G.cylT, b, dx, dy, L(0, 0, 0, lean, 0, 0, 0.022 * s, 0.26 * s, 0.022 * s), "#a07a58");
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      put(bd, G.petal, b, dx, dy, L(0, 0.26 * s, Math.sin(lean) * 0.26 * s, -0.35, a, 0, 0.13 * s, 0.13 * s, 0.13 * s), i % 2 ? "#3fb37c" : "#56c98d");
    }
  }
  function addFlowerSmall(bd, b, dx, dy, s, col) {
    put(bd, G.cyl, b, dx, dy, L(0, 0, 0, 0, 0, 0, 0.006 * s, 0.05 * s, 0.006 * s), "#4f9e5a");
    put(bd, G.sphLo, b, dx, dy, L(0, 0.055 * s, 0, 0, 0, 0, 0.018 * s), col);
  }

  /* ================= 1. ОКЕАН НЕЖНОСТИ ================= */
  function buildOcean(ctx) {
    const b = B.ocean, root = new THREE.Group(), r = U.rng(101);
    const bd = new U.GeoBuilder(), gl = new U.GeoBuilder();
    // пальмы и камни на островках
    [[-6.5, 4.5], [5.5, -5], [7.5, 5], [-4, -7]].forEach(([x, y], i) => {
      addPalm(bd, b, x + 0.3, y - 0.2, 1.0 + r() * 0.3, r);
      if (i % 2 === 0) addPalm(bd, b, x - 0.5, y + 0.4, 0.8, r);
      addRock(bd, b, x + 0.9, y + 0.6, 1, "#b5aacb");
    });
    addRock(bd, b, 1.6, -1.2, 1.3); addRock(bd, b, -1.5, 1.4, 1.0);
    addPalm(bd, b, -1.6, -1.2, 1.1, r);
    // светящиеся буйки
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      put(gl, G.sphLo, b, Math.cos(a) * 9, Math.sin(a) * 9, L(0, 0.01, 0, 0, 0, 0, 0.03), i % 2 ? "#8ff7ff" : "#ffc0e4", { water: true, sink: 0 });
    }
    root.add(meshFrom(bd, stdMat(), ctx.shadows));
    root.add(meshFrom(gl, glowMat()));

    // маяк — интерактивный
    const lh = new U.GeoBuilder();
    const base = at(b, 0, 0);
    const mm = (lm) => { const m = U.surfaceMatrix(base.dir, base.r - 0.03); m.multiply(lm); return m; };
    lh.add(G.cylT, mm(L(0, 0, 0, 0, 0, 0, 0.17, 0.08, 0.17)), "#b7aecb");
    const stripes = ["#ffffff", "#ff8fb8", "#ffffff", "#ff8fb8", "#ffffff"];
    for (let i = 0; i < 5; i++) lh.add(G.cylT, mm(L(0, 0.08 + i * 0.13, 0, 0, 0, 0, 0.115 - i * 0.012, 0.13, 0.115 - i * 0.012)), stripes[i]);
    lh.add(G.cyl, mm(L(0, 0.73, 0, 0, 0, 0, 0.1, 0.025, 0.1)), "#5d5486");
    lh.add(G.cyl, mm(L(0, 0.755, 0, 0, 0, 0, 0.055, 0.1, 0.055)), "#fff2c4");
    lh.add(G.cone, mm(L(0, 0.855, 0, 0, 0, 0, 0.085, 0.12, 0.085)), "#7b5fd0");
    lh.add(G.sphLo, mm(L(0, 0.985, 0, 0, 0, 0, 0.02)), "#ffd98a");
    lh.add(G.box, mm(L(0.07, 0.0, 0.1, 0, 0.4, 0, 0.06, 0.08, 0.025)), "#7a5a4a");
    const top = base.dir.clone().multiplyScalar(base.r + 0.8);
    const lighthouse = makeInteractive(lh, top, base.dir, { biome: "ocean", kind: "lighthouse" }, 0.55, ctx);
    root.add(lighthouse);
    // свет маяка
    const lampPos = base.dir.clone().multiplyScalar(base.r + 0.78);
    const lamp = U.glowSprite(new THREE.Color("#ffe3a0"), 0.7, 0.95);
    lamp.position.copy(lampPos); root.add(lamp);
    const beamPivot = new THREE.Group();
    U.placeOnSurface(beamPivot, base.dir, base.r + 0.78);
    const beamGeo = new THREE.ConeGeometry(0.16, 1.8, 16, 1, true).translate(0, -0.9, 0).rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: "#fff1c2", transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam1 = new THREE.Mesh(beamGeo, beamMat), beam2 = new THREE.Mesh(beamGeo, beamMat);
    beam2.rotation.y = Math.PI;
    beamPivot.add(beam1, beam2);
    root.add(beamPivot);

    // плавающие цветы (лотосы) — InstancedMesh
    const lotusB = new U.GeoBuilder();
    for (let i = 0; i < 6; i++) lotusB.add(G.petal, L(0, 0.01, 0, 0.35, (i / 6) * Math.PI * 2, 0, 0.05), i % 2 ? "#ffd1e6" : "#ff9cc6");
    for (let i = 0; i < 5; i++) lotusB.add(G.petal, L(0, 0.02, 0, 0.75, (i / 5) * Math.PI * 2 + 0.3, 0, 0.035), "#fff0f7");
    lotusB.add(G.sphLo, L(0, 0.025, 0, 0, 0, 0, 0.015), "#ffd25a");
    lotusB.add(G.disc, L(0, 0.002, 0, 0, 0, 0, 0.075), "#44b07a");
    const lotusGeo = lotusB.build();
    const nL = 16;
    const lotus = new THREE.InstancedMesh(lotusGeo, stdMat({ emissive: new THREE.Color("#ff8fc0"), emissiveIntensity: 0.25 }), nL);
    const lotusData = [];
    for (let i = 0; i < nL; i++) {
      let dx, dy, tries = 0;
      do { const a = r() * Math.PI * 2, d = 2.5 + r() * 9; dx = Math.cos(a) * d; dy = Math.sin(a) * d; tries++; }
      while (P.heightAt(U.offsetDir(b.c, dx, dy)) > -0.05 && tries < 20);
      lotusData.push({ dir: U.offsetDir(b.c, dx, dy), ph: r() * 6.28, spin: r() * 6.28, s: 0.8 + r() * 0.6 });
    }
    root.add(lotus);
    const tmpM = new THREE.Matrix4();

    // светлячки над водой
    const sparks = floaters(b, { count: ctx.low ? 24 : 50, spread: 11, h0: 0.05, h1: 0.4, colors: ["#9ff8ff", "#ffffff", "#ffc6ea"], size: 2.2, amp: 0.2, seed: 12 });
    root.add(sparks);

    ctx.updates.push((t) => {
      beamPivot.rotateY(0.02);
      lamp.material.opacity = 0.75 + Math.sin(t * 3) * 0.2;
      for (let i = 0; i < nL; i++) {
        const d = lotusData[i];
        const m = U.surfaceMatrix(d.dir, R + 0.005 + Math.sin(t * 1.2 + d.ph) * 0.012, { spin: d.spin + t * 0.05, scale: d.s });
        lotus.setMatrixAt(i, m);
      }
      lotus.instanceMatrix.needsUpdate = true;
      sparks.material.uniforms.uTime.value = t;
    });
    return { root, focusDist: 5.2, viewYaw: 0, markerH: 1.6 };
  }

  /* ================= 2. ЛЕС УЛЫБОК ================= */
  function buildForest(ctx) {
    const b = B.forest, root = new THREE.Group(), r = U.rng(202);
    const bd = new U.GeoBuilder(), gl = new U.GeoBuilder();
    const used = [];
    const free = (x, y, d) => used.every(u => Math.hypot(u[0] - x, u[1] - y) > d);
    // «деревья улыбок» — интерактивные, по кругу
    const smileTrees = [];
    const nT = Math.max(5, Math.min(9, (ctx.content.locations.forest.messages || []).length || 7));
    const canopyCols = ["#ff9ccc", "#b892ff", "#7fd7ff", "#ffc98a", "#9bf0b5", "#ffb3d9", "#c9a6ff", "#8fe3d8", "#ffd27a"];
    for (let i = 0; i < nT; i++) {
      const a = (i / nT) * Math.PI * 2 + 0.3, d = i % 2 ? 7.5 : 4.5;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      used.push([x, y]);
      const tb = new U.GeoBuilder();
      const p = at(b, x, y);
      const m0 = U.surfaceMatrix(p.dir, p.r - 0.03, { spin: faceSpin(p.dir, new V3(0, -1, 0)) });
      const add = (geo, lm, c) => { const m = m0.clone(); m.multiply(lm); tb.add(geo, m, c); };
      const s = 1.25;
      add(G.cylT, L(0, 0, 0, 0.08, 0, 0.05, 0.05 * s, 0.32 * s, 0.05 * s), "#8a6450");
      add(G.cylT, L(0.03, 0.18 * s, 0, 0, 0, -0.7, 0.025 * s, 0.14 * s, 0.025 * s), "#8a6450");
      const cc = canopyCols[i % canopyCols.length];
      add(G.sph, L(0, 0.42 * s, 0, 0, 0, 0, 0.2 * s, 0.17 * s, 0.2 * s), cc);
      add(G.sph, L(0.13 * s, 0.34 * s, 0.05 * s, 0, 0, 0, 0.12 * s), cc);
      add(G.sph, L(-0.12 * s, 0.35 * s, -0.06 * s, 0, 0, 0, 0.12 * s), cc);
      add(G.sph, L(0.02 * s, 0.55 * s, 0.03 * s, 0, 0, 0, 0.1 * s), cc);
      // «улыбка» на кроне из светящихся точек
      for (let k = 0; k < 5; k++) {
        const ang = -0.9 + k * 0.45;
        add(G.sphLo, L(Math.sin(ang) * 0.11 * s, 0.4 * s - Math.cos(ang) * 0.05 * s, 0.19 * s, 0, 0, 0, 0.016 * s), "#fff6c8");
      }
      add(G.sphLo, L(-0.06 * s, 0.47 * s, 0.18 * s, 0, 0, 0, 0.018 * s), "#fff6c8");
      add(G.sphLo, L(0.06 * s, 0.47 * s, 0.18 * s, 0, 0, 0, 0.018 * s), "#fff6c8");
      const center = p.dir.clone().multiplyScalar(p.r + 0.5);
      const tree = makeInteractive(tb, center, p.dir, { biome: "forest", kind: "tree", index: i }, 0.42, ctx);
      // крона смотрит на центр леса
      smileTrees.push(tree);
      root.add(tree);
    }
    // обычные деревья
    for (let i = 0; i < (ctx.low ? 26 : 44); i++) {
      const a = r() * Math.PI * 2, d = 2 + Math.sqrt(r()) * 13;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (!free(x, y, 1.3)) continue;
      if (P.heightAt(U.offsetDir(b.c, x, y)) < 0.08) continue;
      used.push([x, y]);
      if (r() < 0.55) addPine(bd, b, x, y, 1 + r() * 0.9, r);
      else addRoundTree(bd, b, x, y, 1 + r() * 0.6, ["#3fae7f", "#58c08a", "#2f9a78", "#7cc88a"][i % 4], r);
    }
    // домики
    [[0.6, 1.0, 0.3], [-2.2, -1.5, 2.2], [1.8, -2.3, 4.0]].forEach(([x, y, sp]) => {
      if (!free(x, y, 0.8)) return;
      used.push([x, y]);
      put(bd, G.box, b, x, y, L(0, 0, 0, 0, 0, 0, 0.13, 0.11, 0.12), "#ffe6cf", { spin: sp });
      put(bd, G.pyr, b, x, y, L(0, 0.11, 0, 0, 0, 0, 0.13, 0.1, 0.13), "#c86f8f", { spin: sp });
      put(gl, G.plane, b, x, y, L(0, 0.05, 0.061, 0, 0, 0, 0.035, 0.04, 1), "#ffd27a", { spin: sp });
      put(bd, G.box, b, x, y, L(0.035, 0.13, 0, 0, 0, 0, 0.025, 0.07, 0.025), "#8d7a9a", { spin: sp });
    });
    // светящиеся грибы
    for (let i = 0; i < (ctx.low ? 14 : 26); i++) {
      const a = r() * Math.PI * 2, d = 1.5 + Math.sqrt(r()) * 12;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (P.heightAt(U.offsetDir(b.c, x, y)) < 0.08) continue;
      const s = 0.6 + r() * 0.8;
      put(bd, G.cyl, b, x, y, L(0, 0, 0, 0, 0, 0, 0.012 * s, 0.05 * s, 0.012 * s), "#f6efe6");
      put(gl, G.sph, b, x, y, L(0, 0.05 * s, 0, 0, 0, 0, 0.035 * s, 0.02 * s, 0.035 * s), ["#7ff7ff", "#ff9ee0", "#c4a2ff"][i % 3]);
    }
    root.add(meshFrom(bd, stdMat(), ctx.shadows));
    const glow = meshFrom(gl, glowMat());
    root.add(glow);

    // милые лесные духи
    const spirits = [];
    const bodyMat = stdMat({ emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.25 });
    [[-1.0, 2.6, "#ffffff"], [2.6, 0.2, "#ffe2f1"], [-3.0, -0.6, "#e6dcff"]].forEach(([x, y, c], i) => {
      const sb = new U.GeoBuilder();
      sb.add(G.sph, L(0, 0.05, 0, 0, 0, 0, 0.05, 0.055, 0.05), c);
      sb.add(G.sphLo, L(-0.017, 0.065, 0.044, 0, 0, 0, 0.007), "#2a2340");
      sb.add(G.sphLo, L(0.017, 0.065, 0.044, 0, 0, 0, 0.007), "#2a2340");
      sb.add(G.sphLo, L(-0.03, 0.05, 0.04, 0, 0, 0, 0.009, 0.005, 0.004), "#ff9ec4");
      sb.add(G.sphLo, L(0.03, 0.05, 0.04, 0, 0, 0, 0.009, 0.005, 0.004), "#ff9ec4");
      sb.add(G.sphLo, L(0.0, 0.11, 0, 0, 0, 0.3, 0.012, 0.02, 0.012), c);
      const mesh = new THREE.Mesh(sb.build(), bodyMat);
      mesh.castShadow = ctx.shadows;
      const g = new THREE.Group(); g.add(mesh);
      const p = at(b, x, y);
      U.placeOnSurface(g, p.dir, p.r, faceSpin(p.dir, new V3(0, -1, 0)));
      g.userData.base = p.r; g.userData.dir = p.dir; g.userData.ph = i * 2.1;
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), hitMat); hit.position.y = 0.08; g.add(hit);
      g.userData.interact = { biome: "forest", kind: "spirit", index: i };
      ctx.interactives.push(g); OP.interactives.push(g);
      spirits.push(g); root.add(g);
    });

    // светлячки
    const flies = floaters(b, { count: ctx.low ? 40 : 90, spread: 13, h0: 0.08, h1: 0.7, colors: ["#fff3a0", "#d9ff9a", "#ffd47a"], size: 2.4, amp: 0.25, seed: 21 });
    root.add(flies);

    ctx.updates.push((t) => {
      flies.material.uniforms.uTime.value = t;
      spirits.forEach(s => {
        const h = s.userData.base + 0.02 + Math.abs(Math.sin(t * 2.2 + s.userData.ph)) * 0.06;
        s.position.copy(s.userData.dir).multiplyScalar(h);
      });
    });
    ctx.forest = { smileTrees, flies };
    return { root, focusDist: 5.4, markerH: 1.5 };
  }

  /* ================= 3. ГОРЫ ПРИКЛЮЧЕНИЙ ================= */
  function buildMountains(ctx) {
    const b = B.mountains, root = new THREE.Group(), r = U.rng(303);
    const bd = new U.GeoBuilder(), gl = new U.GeoBuilder();
    // сосны на склонах
    for (let i = 0; i < (ctx.low ? 30 : 55); i++) {
      const x = -12 + r() * 30, y = -11 + r() * 22;
      const h = P.heightAt(U.offsetDir(b.c, x, y));
      if (h < 0.1 || h > 0.85) continue;
      addPine(bd, b, x, y, 0.8 + r() * 0.6, r);
    }
    for (let i = 0; i < 18; i++) {
      const x = -10 + r() * 20, y = -9 + r() * 18;
      const hr = P.heightAt(U.offsetDir(b.c, x, y));
      if (hr < 0.05 || hr > 0.6) continue;
      addRock(bd, b, x, y, 1 + r() * 1.5, "#8f88ad");
    }
    // мост между большим островом и маленьким
    const yb = -1.6;
    let x0 = null, x1 = null;
    for (let x = 4; x < 16; x += 0.1) {
      const h = P.heightAt(U.offsetDir(b.c, x, yb));
      if (x0 === null && h < 0.12) x0 = x - 0.5;
      if (x0 !== null && x1 === null && x > x0 + 1.5 && h > 0.12) { x1 = x + 0.5; break; }
    }
    if (x0 === null) x0 = 9; if (x1 === null) x1 = 13;
    const bridgeB = new U.GeoBuilder();
    const pA = at(b, x0, yb), pB = at(b, x1, yb);
    const A = pA.dir.clone().multiplyScalar(pA.r + 0.06), Bp = pB.dir.clone().multiplyScalar(pB.r + 0.06);
    const N = 16;
    const along = Bp.clone().sub(A);
    const len = along.length();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = A.clone().lerp(Bp, t);
      const nrm = p.clone().normalize();
      p.addScaledVector(nrm, Math.sin(t * Math.PI) * 0.12);
      const q = new THREE.Quaternion().setFromUnitVectors(_up, nrm);
      const fwd = new V3(0, 0, 1).applyQuaternion(q);
      const spin = Math.atan2(new V3().crossVectors(fwd, along).dot(nrm), fwd.dot(along));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, spin));
      const m = new THREE.Matrix4().compose(p, q, new V3(0.16, 0.012, len / N * 0.8));
      bridgeB.add(G.boxC, m, i % 2 ? "#b88a62" : "#a57a55");
      if (i % 4 === 0) {
        [-1, 1].forEach(sd => {
          const mp = new THREE.Matrix4().compose(p.clone().add(new V3(0.075 * sd, 0, 0).applyQuaternion(q)), q, new V3(0.01, 0.1, 0.01));
          bridgeB.add(G.box, mp, "#7a5a4a");
          const ml = new THREE.Matrix4().compose(p.clone().add(new V3(0.075 * sd, 0.1, 0).applyQuaternion(q)), q, new V3(0.012, 0.012, 0.012));
          gl.add(G.sphLo, ml, "#ffd98a");
        });
      }
    }
    const bridgeMid = A.clone().lerp(Bp, 0.5); bridgeMid.addScaledVector(bridgeMid.clone().normalize(), 0.12);
    const bridge = makeInteractive(bridgeB, bridgeMid, bridgeMid.clone().normalize(), { biome: "mountains", kind: "bridge" }, Math.max(0.35, len * 0.45), ctx);
    root.add(bridge);

    // флаг на главной вершине
    let best = { h: -9, x: 0, y: 0 };
    for (let x = -2; x <= 2; x += 0.25) for (let y = -2; y <= 2; y += 0.25) {
      const h = P.heightAt(U.offsetDir(b.c, x, y)); if (h > best.h) best = { h, x, y };
    }
    const fb = new U.GeoBuilder();
    const pk = at(b, best.x, best.y);
    const fm = (lm) => { const m = U.surfaceMatrix(pk.dir, pk.r - 0.04); m.multiply(lm); return m; };
    fb.add(G.cyl, fm(L(0, 0, 0, 0, 0, 0, 0.008, 0.42, 0.008)), "#f2ecff");
    fb.add(G.sphLo, fm(L(0, 0.43, 0, 0, 0, 0, 0.018)), "#ffd98a");
    const flagGeo = new THREE.PlaneGeometry(0.2, 0.12, 6, 1).translate(0.1, 0, 0);
    fb.add(flagGeo, fm(L(0, 0.35, 0, 0, 0, 0)), "#ff7fb2");
    fb.add(new THREE.ShapeGeometry(U.heartShape(0.025)), fm(L(0.1, 0.35, 0.002, 0, 0, 0)), "#ffffff");
    const flagTop = pk.dir.clone().multiplyScalar(pk.r + 0.3);
    const flag = makeInteractive(fb, flagTop, pk.dir, { biome: "mountains", kind: "flag" }, 0.45, ctx);
    flag.userData.mesh.material.side = THREE.DoubleSide;
    root.add(flag);

    // водопад: из ущелья второй вершины вниз к морю
    const wTop = at(b, 2.2, -4.4), wBot = at(b, 3.6, -10.2, true);
    const P0 = wTop.dir.clone().multiplyScalar(wTop.r + 0.04);
    const P2 = wBot.dir.clone().multiplyScalar(R + 0.01);
    const P1 = P0.clone().lerp(P2, 0.5).add(P0.clone().normalize().multiplyScalar(0.25));
    const curve = new THREE.QuadraticBezierCurve3(P0, P1, P2);
    const segs = 24, wid = 0.16;
    const wpos = [], wuv = [], widx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, p = curve.getPoint(t), tg = curve.getTangent(t);
      const side = new V3().crossVectors(tg, p.clone().normalize()).normalize().multiplyScalar(wid * (0.7 + t * 0.6) / 2);
      const a = p.clone().add(side), c = p.clone().sub(side);
      wpos.push(a.x, a.y, a.z, c.x, c.y, c.z); wuv.push(0, t, 1, t);
      if (i < segs) { const k = i * 2; widx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2));
    wg.setIndex(widx);
    const wMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float s = sin(vUv.y*60.0 - uTime*9.0 + sin(vUv.x*12.0)*2.0)*0.5+0.5;
          float edge = smoothstep(0.0,0.2,vUv.x)*smoothstep(1.0,0.8,vUv.x);
          vec3 c = mix(vec3(0.55,0.9,1.0), vec3(1.0), s*0.7);
          gl_FragColor = vec4(c, edge*(0.55+0.4*s)); }`
    });
    const waterfall = new THREE.Mesh(wg, wMat);
    waterfall.renderOrder = 2;
    root.add(waterfall);
    const mist = floaters(b, { count: 26, center: [3.6, -10.2], h0: 0.0, h1: 0.12, colors: ["#ffffff", "#d8f6ff"], size: 6, amp: 0.08, seed: 33 });
    root.add(mist);

    // облака вокруг вершин
    const cb = new U.GeoBuilder();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const p = at(b, Math.cos(a) * 4.5, Math.sin(a) * 4.5);
      for (let k = 0; k < 4; k++) {
        const s = 0.12 + r() * 0.1;
        const m = U.surfaceMatrix(p.dir, R + 1.15 + r() * 0.35, { spin: a });
        m.multiply(L((k - 1.5) * 0.12, 0, (r() - 0.5) * 0.1, 0, 0, 0, s, s * 0.7, s));
        cb.add(G.sph, m, "#ffffff");
      }
    }
    const cloudRing = new THREE.Mesh(cb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: new THREE.Color("#a59ce0"), emissiveIntensity: 0.85, transparent: true, opacity: 0.92 }));
    const cloudPivot = new THREE.Group();
    cloudPivot.add(cloudRing);
    root.add(cloudPivot);

    // солнечный свет
    const sun = U.glowSprite(new THREE.Color("#ffe2a8"), 3.2, 0.35);
    sun.position.copy(at(b, 2, 3).dir.multiplyScalar(R + 2.8));
    root.add(sun);

    root.add(meshFrom(bd, stdMat(), ctx.shadows));
    root.add(meshFrom(gl, glowMat()));

    const qAxis = b.c.clone();
    ctx.updates.push((t, dt) => {
      wMat.uniforms.uTime.value = t;
      mist.material.uniforms.uTime.value = t;
      cloudPivot.rotateOnAxis(qAxis, dt * 0.05);
    });
    return { root, focusDist: 8.2, markerH: 2.6 };
  }

  /* ================= 4. САД ЛЮБВИ ================= */
  function buildGarden(ctx) {
    const b = B.garden, root = new THREE.Group(), r = U.rng(404);
    const bd = new U.GeoBuilder(), gl = new U.GeoBuilder();
    const reasons = ctx.content.locations.garden.reasons || [];
    const nF = Math.max(15, reasons.length);
    // фонтан в центре
    put(bd, G.cyl, b, 0, 0, L(0, 0, 0, 0, 0, 0, 0.26, 0.04, 0.26), "#efe6ff");
    put(bd, G.torus, b, 0, 0, L(0, 0.045, 0, 0, 0, 0, 0.25, 0.25, 0.25), "#d9cdf5");
    put(bd, G.cyl, b, 0, 0, L(0, 0.03, 0, 0, 0, 0, 0.04, 0.16, 0.04), "#efe6ff");
    put(bd, G.cyl, b, 0, 0, L(0, 0.17, 0, 0, 0, 0, 0.11, 0.02, 0.11), "#efe6ff");
    put(gl, G.cyl, b, 0, 0, L(0, 0.042, 0, 0, 0, 0, 0.23, 0.006, 0.23), "#7fe7ff");
    put(gl, G.cyl, b, 0, 0, L(0, 0.19, 0, 0, 0, 0, 0.09, 0.005, 0.09), "#9ff0ff");
    const drops = floaters(b, { count: ctx.low ? 40 : 80, center: [0, 0], h0: 0.19, h1: 0.2, colors: ["#bff6ff", "#ffffff"], size: 1.6, mode: 2, seed: 41 });
    root.add(drops);
    // дорожка-спираль из камешков
    for (let i = 0; i < 70; i++) {
      const a = i * 0.32, d = 1.8 + i * 0.16;
      put(bd, G.sphLo, b, Math.cos(a) * d, Math.sin(a) * d, L(0, 0, 0, 0, 0, 0, 0.022, 0.008, 0.022), "#f4ead6", { sink: 0.0 });
    }
    // мелкие цветы
    const smallCols = ["#ff9ccc", "#c9a6ff", "#ffe08a", "#ffffff", "#ff7fb2", "#9fd8ff"];
    for (let i = 0; i < (ctx.low ? 90 : 180); i++) {
      const a = r() * Math.PI * 2, d = 1 + Math.sqrt(r()) * 14;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (P.heightAt(U.offsetDir(b.c, x, y)) < 0.08) continue;
      addFlowerSmall(bd, b, x, y, 0.8 + r() * 0.8, smallCols[i % smallCols.length]);
    }
    // кусты по краю
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.2, d = 12.5 + r() * 1.5;
      addRoundTree(bd, b, Math.cos(a) * d, Math.sin(a) * d, 0.8 + r() * 0.5, ["#5cbf86", "#7ccf8e", "#ffb3d4"][i % 3], r);
    }
    // большие необычные цветы — интерактивные
    const petalCols = [["#ff8fc0", "#ffd1e6"], ["#b892ff", "#e6d6ff"], ["#ff9f80", "#ffd9c4"], ["#7fd7ff", "#d6f4ff"], ["#ffc85a", "#fff0c2"], ["#ff6fa5", "#ffc2da"]];
    const flowers = [];
    for (let i = 0; i < nF; i++) {
      const a = i * 2.39996, d = 2.6 + Math.sqrt(i + 0.5) * 2.55;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const p = at(b, x, y);
      const fb = new U.GeoBuilder();
      const m0 = U.surfaceMatrix(p.dir, p.r - 0.02, { spin: r() * 6 });
      const add = (geo, lm, c) => { const m = m0.clone(); m.multiply(lm); fb.add(geo, m, c); };
      const s = 1.25 + r() * 0.4;
      const lean = (r() - 0.5) * 0.25;
      add(G.cyl, L(0, 0, 0, lean, 0, 0, 0.012 * s, 0.32 * s, 0.012 * s), "#4fa868");
      add(G.petal, L(0, 0.1 * s, 0, -0.5, 0.4, 0, 0.09 * s), "#5fc07a");
      add(G.petal, L(0, 0.16 * s, 0, -0.5, 3.2, 0, 0.08 * s), "#5fc07a");
      const cols = petalCols[i % petalCols.length];
      const hy = 0.32 * s, hz = Math.sin(lean) * 0.32 * s;
      const np = 7;
      for (let k = 0; k < np; k++) add(G.petal, L(0, hy, hz, -0.55, (k / np) * Math.PI * 2, 0, 0.1 * s), cols[0]);
      for (let k = 0; k < np; k++) add(G.petal, L(0, hy + 0.01, hz, -0.95, (k / np) * Math.PI * 2 + 0.45, 0, 0.065 * s), cols[1]);
      add(G.sph, L(0, hy + 0.025, hz, 0, 0, 0, 0.032 * s, 0.022 * s, 0.032 * s), "#fff1a8");
      const head = p.dir.clone().multiplyScalar(p.r + hy);
      const fl = makeInteractive(fb, head, p.dir, { biome: "garden", kind: "flower", index: i }, 0.32, ctx);
      // светящаяся сердцевина
      const core = U.glowSprite(new THREE.Color(cols[0]), 0.36, 0.5);
      core.position.copy(p.dir).multiplyScalar(p.r + hy + 0.03);
      fl.add(core);
      fl.userData.core = core;
      flowers.push(fl); root.add(fl);
    }
    // золотой свет и летающие лепестки
    const golden = U.glowSprite(new THREE.Color("#ffd98a"), 7, 0.22);
    golden.position.copy(b.c).multiplyScalar(R + 1.6);
    root.add(golden);
    const petals = floaters(b, { count: ctx.low ? 40 : 90, spread: 14, h0: 0.1, h1: 0.6, colors: ["#ffb3d4", "#ffd6e8", "#e8d4ff", "#ffe6a8"], size: 3.2, mode: 1, seed: 44, map: petalTexture(), normalBlend: true });
    root.add(petals);

    root.add(meshFrom(bd, stdMat(), ctx.shadows));
    root.add(meshFrom(gl, glowMat()));
    ctx.updates.push((t) => {
      drops.material.uniforms.uTime.value = t;
      petals.material.uniforms.uTime.value = t;
      flowers.forEach((f, i) => { f.userData.core.material.opacity = (f.userData.opened ? 0.95 : 0.45) + Math.sin(t * 2 + i) * 0.12; });
    });
    ctx.garden = { flowers };
    return { root, focusDist: 6.0, markerH: 1.5 };
  }

  /* ================= 5. ГОРОД МЕЧТАНИЙ ================= */
  function clockTexture() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, "#fffaf0"); gr.addColorStop(0.85, "#ffeacc"); gr.addColorStop(0.86, "#c9a2ff"); gr.addColorStop(1, "#8a6fd8");
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#5a4a8a";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath(); g.arc(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92, i % 3 === 0 ? 9 : 5, 0, Math.PI * 2); g.fill();
    }
    return new THREE.CanvasTexture(cv);
  }
  function buildCity(ctx) {
    const b = B.city, root = new THREE.Group(), r = U.rng(505);
    const bd = new U.GeoBuilder(), gl = new U.GeoBuilder();
    const th = 28 * U.DEG, riverOff = 3.6;
    const riverDist = (x, y) => Math.abs(-Math.sin(th) * x + Math.cos(th) * y - riverOff);
    const used = [[0, 0]];
    const wallCols = ["#efe3ff", "#ffe3ec", "#fff1dc", "#dfeaff", "#e9dcff", "#ffd9e6"];
    const roofCols = ["#7b5fd0", "#c86f8f", "#5a7fd0", "#d98a6a", "#9a6fd8"];
    let placed = 0;
    for (let i = 0; i < 400 && placed < (ctx.low ? 26 : 40); i++) {
      const a = r() * Math.PI * 2, d = 2.6 + Math.sqrt(r()) * 9.5;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (riverDist(x, y) < 2.4) continue;
      if (!used.every(u => Math.hypot(u[0] - x, u[1] - y) > (u[0] === 0 && u[1] === 0 ? 2.6 : 1.25))) continue;
      const p = at(b, x, y);
      if (p.h < 0.15) continue;
      used.push([x, y]); placed++;
      const w = 0.1 + r() * 0.07, dpt = 0.1 + r() * 0.06, h = 0.13 + r() * r() * 0.36 + (d < 5 ? 0.08 : 0);
      const sp = faceSpin(p.dir, b.c.clone().sub(p.dir));
      const wc = wallCols[placed % wallCols.length];
      put(bd, G.box, b, x, y, L(0, 0, 0, 0, 0, 0, w, h, dpt), wc, { spin: sp });
      const rt = r();
      if (rt < 0.45) put(bd, G.pyr, b, x, y, L(0, h, 0, 0, 0, 0, w * 1.05, 0.08 + r() * 0.06, dpt * 1.05), roofCols[placed % roofCols.length], { spin: sp });
      else if (rt < 0.7) { put(bd, G.sph, b, x, y, L(0, h, 0, 0, 0, 0, w * 0.45, w * 0.5, w * 0.45), roofCols[(placed + 2) % roofCols.length], { spin: sp }); }
      else put(bd, G.box, b, x, y, L(0, h, 0, 0, 0, 0, w * 1.08, 0.015, dpt * 1.08), "#cfc3ea", { spin: sp });
      // светящиеся окна на 4 сторонах
      const rows = Math.max(1, Math.floor((h - 0.03) / 0.055));
      for (let s = 0; s < 4; s++) {
        const face = s * Math.PI / 2;
        const half = (s % 2 === 0 ? dpt : w) / 2 + 0.001, span = (s % 2 === 0 ? w : dpt);
        for (let row = 0; row < rows; row++) for (let c = -1; c <= 1; c += 2) {
          if (r() < 0.22) continue;
          const lx = c * span * 0.22, ly = 0.04 + row * 0.055;
          const m = new THREE.Matrix4().makeRotationY(face).multiply(L(lx, ly, half, 0, 0, 0, 0.022, 0.028, 1));
          put(gl, G.plane, b, x, y, m, r() < 0.8 ? "#ffd27a" : "#ffb3e0", { spin: sp });
        }
      }
    }
    // площадь и мостовые
    put(bd, G.cyl, b, 0, 0, L(0, 0, 0, 0, 0, 0, 0.42, 0.012, 0.42), "#efe7ff", { sink: 0 });
    put(bd, G.torus, b, 0, 0, L(0, 0.012, 0, 0, 0, 0, 0.42, 0.05, 0.42), "#cbbfe8", { sink: 0 });
    // фонари вокруг площади
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, d = 2.65;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      put(bd, G.cyl, b, x, y, L(0, 0, 0, 0, 0, 0, 0.006, 0.09, 0.006), "#4a3f6a");
      put(gl, G.sphLo, b, x, y, L(0, 0.095, 0, 0, 0, 0, 0.014), "#ffe2a0");
    }
    // мосты через реку
    const dirAlong = [Math.cos(th), Math.sin(th)], perp = [-Math.sin(th), Math.cos(th)];
    [-5, 1.5, 7].forEach(sAl => {
      const cx = dirAlong[0] * sAl + perp[0] * riverOff, cy = dirAlong[1] * sAl + perp[1] * riverOff;
      const p = at(b, cx, cy, true);
      const across = U.offsetDir(b.c, cx + perp[0], cy + perp[1]).sub(p.dir);
      const sp = faceSpin(p.dir, across);
      for (let k = -6; k <= 6; k++) {
        const t = k / 6;
        const lift = 0.24 + (1 - t * t) * 0.06;
        put(bd, G.boxC, b, cx, cy, L(0, lift, t * 0.36, -t * 0.45, 0, 0, 0.12, 0.015, 0.065), "#e6dcf8", { spin: sp, water: true, sink: 0 });
      }
      [-1, 1].forEach(sd => put(gl, G.sphLo, b, cx, cy, L(sd * 0.06, 0.36, 0, 0, 0, 0, 0.012), "#ffe2a0", { spin: sp, water: true, sink: 0 }));
    });
    // фонари вдоль реки
    for (let sAl = -9; sAl <= 9; sAl += 2.2) {
      [-1, 1].forEach(sd => {
        const cx = dirAlong[0] * sAl + perp[0] * (riverOff + sd * 2.0), cy = dirAlong[1] * sAl + perp[1] * (riverOff + sd * 2.0);
        if (Math.hypot(cx, cy) > 12) return;
        if (P.heightAt(U.offsetDir(b.c, cx, cy)) < 0.1) return;
        put(bd, G.cyl, b, cx, cy, L(0, 0, 0, 0, 0, 0, 0.005, 0.07, 0.005), "#4a3f6a");
        put(gl, G.sphLo, b, cx, cy, L(0, 0.075, 0, 0, 0, 0, 0.011), "#ffd9a0");
      });
    }

    // башня с часами — интерактивная
    const tb = new U.GeoBuilder();
    const p0 = at(b, 0, 0);
    const tm = (lm) => { const m = U.surfaceMatrix(p0.dir, p0.r - 0.01); m.multiply(lm); return m; };
    tb.add(G.box, tm(L(0, 0, 0, 0, 0, 0, 0.26, 0.12, 0.26)), "#d9cdf5");
    tb.add(G.box, tm(L(0, 0.12, 0, 0, 0, 0, 0.19, 0.62, 0.19)), "#f3ebff");
    for (let k = 0; k < 4; k++) tb.add(G.box, tm(L(0, 0.2 + k * 0.13, 0, 0, 0, 0, 0.2, 0.015, 0.2)), "#cbbce8");
    tb.add(G.box, tm(L(0, 0.74, 0, 0, 0, 0, 0.23, 0.2, 0.23)), "#efe3ff");
    tb.add(G.box, tm(L(0, 0.94, 0, 0, 0, 0, 0.25, 0.025, 0.25)), "#b9a6e8");
    tb.add(G.pyr, tm(L(0, 0.965, 0, 0, 0, 0, 0.24, 0.32, 0.24)), "#7b5fd0");
    tb.add(G.cyl, tm(L(0, 1.28, 0, 0, 0, 0, 0.006, 0.08, 0.006)), "#ffd98a");
    const towerTop = p0.dir.clone().multiplyScalar(p0.r + 0.6);
    const tower = makeInteractive(tb, towerTop, p0.dir, { biome: "city", kind: "tower" }, 0.6, ctx);
    root.add(tower);
    // циферблаты и стрелки (показывают реальное время)
    const faceMat = new THREE.MeshBasicMaterial({ map: clockTexture() });
    const handMat = new THREE.MeshBasicMaterial({ color: "#3b2f66" });
    const faceGeo = new THREE.CircleGeometry(0.085, 32);
    const hands = [];
    const clockFrame = new THREE.Group();
    U.placeOnSurface(clockFrame, p0.dir, p0.r - 0.01);
    for (let k = 0; k < 4; k++) {
      const holder = new THREE.Group();
      holder.rotation.y = k * Math.PI / 2;
      const face = new THREE.Mesh(faceGeo, faceMat);
      face.position.set(0, 0.84, 0.1165);
      holder.add(face);
      const hH = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.045, 0.003).translate(0, 0.02, 0), handMat);
      const hM = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.068, 0.003).translate(0, 0.031, 0), handMat);
      hH.position.set(0, 0.84, 0.119); hM.position.set(0, 0.84, 0.121);
      holder.add(hH, hM);
      hands.push([hH, hM]);
      clockFrame.add(holder);
    }
    const clockGlow = U.glowSprite(new THREE.Color("#ffe2a0"), 0.9, 0.45);
    clockGlow.position.set(0, 0.84, 0); clockFrame.add(clockGlow);
    const spireGlow = U.glowSprite(new THREE.Color("#ffd98a"), 0.5, 0.8);
    spireGlow.position.set(0, 1.37, 0); clockFrame.add(spireGlow);
    root.add(clockFrame);

    // вечернее сияние города
    const cityGlow = U.glowSprite(new THREE.Color("#ff9fd0"), 6, 0.16);
    cityGlow.position.copy(b.c).multiplyScalar(R + 0.8);
    root.add(cityGlow);
    const lights = floaters(b, { count: ctx.low ? 20 : 40, spread: 11, h0: 0.25, h1: 0.9, colors: ["#ffe2a0", "#ffc0e0"], size: 1.6, amp: 0.1, seed: 55 });
    root.add(lights);

    root.add(meshFrom(bd, stdMat(), ctx.shadows));
    root.add(meshFrom(gl, glowMat()));
    ctx.updates.push((t) => {
      const now = new Date();
      const hr = (now.getHours() % 12 + now.getMinutes() / 60) / 12, mn = (now.getMinutes() + now.getSeconds() / 60) / 60;
      hands.forEach(([h, m]) => { h.rotation.z = -hr * Math.PI * 2; m.rotation.z = -mn * Math.PI * 2; });
      lights.material.uniforms.uTime.value = t;
      spireGlow.material.opacity = 0.6 + Math.sin(t * 2.5) * 0.25;
    });
    return { root, focusDist: 5.6, markerH: 2.2 };
  }

  /* ================= НАШ ДОМ ================= */
  function buildHome(ctx) {
    const b = B.home, root = new THREE.Group(), r = U.rng(606);
    const bd = new U.GeoBuilder(), gl = new U.GeoBuilder();
    const hx = -1.3, hy = 0.9;               // где стоит дом
    const lake = [2.2, -1.4];
    const hp = at(b, hx, hy);
    const front = U.offsetDir(b.c, lake[0], lake[1]).sub(hp.dir); // дом смотрит к озеру
    const sp = faceSpin(hp.dir, front);
    const HS = 1.4, HSM = new THREE.Matrix4().makeScale(HS, HS, HS);
    const H = (geo, lm, col, glow) => put(glow ? gl : bd, geo, b, hx, hy, HSM.clone().multiply(lm), col, { spin: sp, sink: 0.03 });
    // фундамент и стены
    H(G.box, L(0, 0, 0, 0, 0, 0, 0.42, 0.05, 0.34), "#cdbfe6");
    H(G.box, L(0, 0.05, 0, 0, 0, 0, 0.38, 0.24, 0.3), "#fff3e6");
    H(G.box, L(0.12, 0.05, -0.02, 0, 0, 0, 0.16, 0.3, 0.2), "#ffe9f1");
    // крыша
    const roof = new THREE.CylinderGeometry(0.0, 0.3, 0.2, 4, 1).rotateY(Math.PI / 4).translate(0, 0.1, 0);
    H(roof, L(0, 0.29, 0, 0, 0, 0, 1.0, 1, 0.82), "#c86f8f");
    H(roof, L(0.12, 0.35, -0.02, 0, 0, 0, 0.55, 0.7, 0.55), "#a95f9a");
    H(G.box, L(-0.1, 0.3, -0.05, 0, 0, 0, 0.05, 0.16, 0.05), "#9b8ab8");
    // окна (светятся тёплым)
    [[-0.11, 0.13], [0.11, 0.13]].forEach(([x, y]) => {
      H(G.plane, L(x, y, 0.152, 0, 0, 0, 0.065, 0.065, 1), "#ffd27a", true);
      H(G.box, L(x, y - 0.04, 0.155, 0, 0, 0, 0.08, 0.008, 0.012), "#ffffff");
    });
    H(G.plane, L(0.191, 0.15, 0.0, 0, Math.PI / 2, 0, 0.06, 0.06, 1), "#ffd27a", true);
    H(G.plane, L(-0.191, 0.15, 0.0, 0, -Math.PI / 2, 0, 0.06, 0.06, 1), "#ffd27a", true);
    // дверной проём (свет внутри)
    H(G.plane, L(0, 0.05 + 0.065, 0.1505, 0, 0, 0, 0.075, 0.13, 1), "#ffcf8a", true);
    H(G.box, L(0, 0.05, 0.152, 0, 0, 0, 0.095, 0.145, 0.012), "#b08ad8");
    // терраса
    H(G.box, L(0, 0.0, 0.26, 0, 0, 0, 0.46, 0.035, 0.2), "#c89a72");
    for (let k = -2; k <= 2; k++) H(G.box, L(k * 0.1, 0.035, 0.355, 0, 0, 0, 0.01, 0.06, 0.01), "#a57a55");
    H(G.box, L(0, 0.09, 0.355, 0, 0, 0, 0.42, 0.01, 0.012), "#a57a55");
    // фонари на террасе
    [-0.2, 0.2].forEach(x => {
      H(G.cyl, L(x, 0.03, 0.34, 0, 0, 0, 0.006, 0.12, 0.006), "#4a3f6a");
      H(G.sphLo, L(x, 0.16, 0.34, 0, 0, 0, 0.018), "#ffd98a", true);
    });
    // дорожка к озеру
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const x = U.lerp(hx, lake[0] - 1.2, t), y = U.lerp(hy, lake[1] + 0.8, t) + Math.sin(t * Math.PI) * 0.4;
      put(bd, G.sphLo, b, x, y, L(0, 0, 0, 0, 0, 0, 0.035, 0.008, 0.03), "#f3e7d3", { sink: 0 });
      if (i % 3 === 0) {
        put(bd, G.cyl, b, x + 0.4, y + 0.25, L(0, 0, 0, 0, 0, 0, 0.005, 0.08, 0.005), "#4a3f6a");
        put(gl, G.sphLo, b, x + 0.4, y + 0.25, L(0, 0.085, 0, 0, 0, 0, 0.013), "#ffe2a0");
      }
    }
    // озеро
    const lp = at(b, lake[0], lake[1]);
    const lakeMesh = new THREE.Mesh(new THREE.CircleGeometry(0.29, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#5fd3e0", roughness: 0.15, metalness: 0.1, emissive: new THREE.Color("#2a8fb0"), emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }));
    U.placeOnSurface(lakeMesh, lp.dir, R + 0.13);
    root.add(lakeMesh);
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28;
      put(bd, G.disc, b, lake[0] + Math.cos(a) * 0.9, lake[1] + Math.sin(a) * 0.9, L(0, 0.0, 0, 0, 0, 0, 0.03), "#5cbf86", { sink: -0.135 + P.heightAt(U.offsetDir(b.c, lake[0] + Math.cos(a) * 0.9, lake[1] + Math.sin(a) * 0.9)) });
    }
    // деревья и цветы
    [[-3.2, 2.6], [-3.6, -0.6], [0.6, 3.6], [-0.4, -3.4], [3.6, 1.6], [-4.4, 1.0], [2.0, 3.8]].forEach(([x, y], i) => {
      if (i % 2) addRoundTree(bd, b, x, y, 1.2, ["#58c08a", "#ffb3d4", "#7cc88a"][i % 3], r); else addPine(bd, b, x, y, 1.1, r);
    });
    const smallCols = ["#ff9ccc", "#c9a6ff", "#ffe08a", "#ffffff"];
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 0.8 + Math.sqrt(r()) * 4.6;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (Math.hypot(x - hx, y - hy) < 1.6 || Math.hypot(x - lake[0], y - lake[1]) < 1.8) continue;
      if (P.heightAt(U.offsetDir(b.c, x, y)) < 0.1) continue;
      addFlowerSmall(bd, b, x, y, 1, smallCols[i % 4]);
    }
    root.add(meshFrom(bd, stdMat(), ctx.shadows));
    root.add(meshFrom(gl, glowMat()));

    // дверь — на петле, интерактивная
    const doorPivot = new THREE.Group();
    U.placeOnSurface(doorPivot, hp.dir, hp.r - 0.03, sp);
    doorPivot.scale.setScalar(HS);
    const hinge = new THREE.Group();
    hinge.position.set(-0.0375, 0.05, 0.159);
    doorPivot.add(hinge);
    const db = new U.GeoBuilder();
    db.add(G.box, L(0.0375, 0, 0, 0, 0, 0, 0.075, 0.13, 0.008), "#8a5a7a");
    db.add(new THREE.ShapeGeometry(U.heartShape(0.012)), L(0.0375, 0.09, 0.0045), "#ffd98a");
    db.add(G.sphLo, L(0.062, 0.06, 0.006, 0, 0, 0, 0.005), "#ffd98a");
    const doorMat = stdMat({ emissive: new THREE.Color("#ffb3d9"), emissiveIntensity: 0 });
    const door = new THREE.Mesh(db.build(), doorMat);
    door.castShadow = ctx.shadows;
    hinge.add(door);
    root.add(doorPivot);
    ctx.glowMats.push(doorMat);
    const doorWorld = new V3(0, 0.12, 0.17);
    doorPivot.updateMatrix();
    doorWorld.applyMatrix4(doorPivot.matrix);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), hitMat);
    hit.position.copy(doorWorld);
    const doorGroup = new THREE.Group();
    doorGroup.add(hit);
    doorGroup.userData.interact = { biome: "home", kind: "door" };
    doorGroup.userData.anchor = doorWorld.clone();
    doorGroup.userData.normal = hp.dir.clone();
    root.add(doorGroup);
    ctx.interactives.push(doorGroup); OP.interactives.push(doorGroup);
    // тёплый свет в дверях (усиливается при открытии)
    const doorLight = U.glowSprite(new THREE.Color("#ffcf8a"), 0.35, 0.0);
    doorLight.position.set(0, 0.11, 0.2); doorPivot.add(doorLight);
    const homeGlow = U.glowSprite(new THREE.Color("#ffd9a8"), 2.4, 0.3);
    homeGlow.position.copy(hp.dir).multiplyScalar(hp.r + 0.35);
    root.add(homeGlow);
    const flies = floaters(b, { count: ctx.low ? 18 : 36, spread: 5, h0: 0.08, h1: 0.5, colors: ["#fff3a0", "#ffd0e8"], size: 2, amp: 0.15, seed: 61 });
    root.add(flies);
    ctx.updates.push((t) => { flies.material.uniforms.uTime.value = t; homeGlow.material.opacity = 0.25 + Math.sin(t * 1.5) * 0.08; });
    ctx.home = { hinge, doorLight, doorWorld, front: front.normalize(), houseDir: hp.dir };
    return { root, focusDist: 3.6, markerH: 1.2, viewDir: front.clone().normalize() };
  }

  /* ================= СЕКРЕТЫ ================= */
  function buildSecrets(ctx, scene) {
    const root = new THREE.Group();
    const secrets = {};
    // маленькое сердце на краю планеты
    const hd = U.dirFromLatLon(-52, 96);
    const hr = P.surfaceRadius(hd, true);
    const heartGeo = new THREE.ExtrudeGeometry(U.heartShape(0.09), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 8 }).center();
    const heart = new THREE.Mesh(heartGeo, new THREE.MeshStandardMaterial({ color: "#ff5f9e", emissive: new THREE.Color("#ff2f7a"), emissiveIntensity: 0.6, roughness: 0.4 }));
    const heartHolder = new THREE.Group();
    U.placeOnSurface(heartHolder, hd, hr + 0.22);
    heartHolder.add(heart);
    const hGlow = U.glowSprite(new THREE.Color("#ff7fb2"), 0.6, 0.6); heartHolder.add(hGlow);
    const hHit = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), hitMat); heartHolder.add(hHit);
    heartHolder.userData.interact = { biome: null, kind: "secret", secret: "heart" };
    heartHolder.userData.anchor = hd.clone().multiplyScalar(hr + 0.22);
    root.add(heartHolder); OP.interactives.push(heartHolder);
    secrets.heart = heartHolder;

    // бутылка с посланием
    const bdir = U.dirFromLatLon(44, 300);
    const bb = new U.GeoBuilder();
    bb.add(G.cyl, L(0, 0, 0, 0, 0, 0, 0.035, 0.1, 0.035), "#8ff0d8");
    bb.add(G.cyl, L(0, 0.1, 0, 0, 0, 0, 0.015, 0.04, 0.015), "#8ff0d8");
    bb.add(G.cyl, L(0, 0.14, 0, 0, 0, 0, 0.017, 0.02, 0.017), "#a57a55");
    bb.add(G.box, L(0, 0.02, 0, 0, 0.3, 0, 0.03, 0.06, 0.004), "#fff6dc");
    const bottle = new THREE.Mesh(bb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, transparent: true, opacity: 0.88, emissive: new THREE.Color("#3fbfa0"), emissiveIntensity: 0.25 }));
    bottle.rotation.z = 1.3;
    const bottleHolder = new THREE.Group();
    const bR = P.surfaceRadius(bdir, true) + 0.03;
    U.placeOnSurface(bottleHolder, bdir, bR);
    bottleHolder.add(bottle);
    const bGlow = U.glowSprite(new THREE.Color("#a8fff0"), 0.35, 0.5); bGlow.position.y = 0.05; bottleHolder.add(bGlow);
    const bHit = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), hitMat); bottleHolder.add(bHit);
    bottleHolder.userData.interact = { biome: null, kind: "secret", secret: "bottle" };
    bottleHolder.userData.anchor = bdir.clone().multiplyScalar(bR);
    bottleHolder.userData.base = bR; bottleHolder.userData.dir = bdir;
    root.add(bottleHolder); OP.interactives.push(bottleHolder);
    secrets.bottle = bottleHolder;

    // маленькая луна на орбите
    const moonOrbit = new THREE.Group();
    moonOrbit.rotation.set(0.5, 0, 0.35);
    const mb = new U.GeoBuilder();
    mb.add(G.sph, L(0, 0, 0, 0, 0, 0, 0.55), "#efe8ff");
    const cr = U.rng(808);
    for (let i = 0; i < 9; i++) {
      const d = new V3(cr() * 2 - 1, cr() * 2 - 1, cr() * 2 - 1).normalize();
      const m = U.surfaceMatrix(d, 0.53, { scale: new V3(0.09 + cr() * 0.08, 0.03, 0.09 + cr() * 0.08) });
      mb.add(G.sphLo, m, "#c9bde8");
    }
    const moon = new THREE.Mesh(mb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: new THREE.Color("#b9a6ff"), emissiveIntensity: 0.15 }));
    moon.position.set(17.5, 0, 0);
    moon.castShadow = false;
    const mHit = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), hitMat); moon.add(mHit);
    const mGlow = U.glowSprite(new THREE.Color("#d9ccff"), 2.6, 0.35); moon.add(mGlow);
    moonOrbit.add(moon);
    moon.userData.interact = { biome: null, kind: "secret", secret: "moon" };
    scene.add(moonOrbit); OP.interactives.push(moon);
    secrets.moon = moon; secrets.moonOrbit = moonOrbit;

    ctx.planetGroup.add(root);
    ctx.updates.push((t, dt) => {
      heart.rotation.y += dt * 1.2;
      heart.position.y = Math.sin(t * 2) * 0.05;
      hGlow.material.opacity = 0.45 + Math.sin(t * 3) * 0.2;
      bottleHolder.position.copy(bdir).multiplyScalar(bottleHolder.userData.base + Math.sin(t * 1.4) * 0.015);
      bottle.rotation.x = Math.sin(t * 1.1) * 0.25;
      moonOrbit.rotation.y += dt * 0.07;
      moon.rotation.y += dt * 0.2;
    });
    return secrets;
  }

  /* ================= МАРКЕРЫ МЕСТ ================= */
  function buildMarker(key, info, ctx) {
    const b = B[key];
    const pos = b.c.clone().multiplyScalar(R + info.markerH + 0.6);
    const g = new THREE.Group();
    const col = { ocean: "#7fe8ff", forest: "#9dffb0", mountains: "#ffffff", garden: "#ff9fd0", city: "#ffd98a", home: "#ffc9a0" }[key];
    const s = U.glowSprite(new THREE.Color(col), 1.1, 0.9);
    const core = U.glowSprite(new THREE.Color("#ffffff"), 0.35, 1);
    g.add(s, core);
    g.position.copy(pos);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), hitMat);
    g.add(hit);
    g.userData.interact = { biome: key, kind: "marker" };
    OP.interactives.push(g);
    ctx.planetGroup.add(g);
    return g;
  }

  /* ================= СБОРКА ================= */
  function create(planetApi, scene, opts) {
    OP.interactives = OP.interactives || [];
    initGeo(opts.quality);
    const ctx = {
      content: opts.content, low: opts.quality === "low", shadows: opts.quality !== "low",
      updates: [], planetGroup: planetApi.planet, interactives: [], glowMats: []
    };
    const builders = { ocean: buildOcean, forest: buildForest, mountains: buildMountains, garden: buildGarden, city: buildCity, home: buildHome };
    const places = {};
    Object.keys(builders).forEach(key => {
      const start = ctx.interactives.length, gStart = ctx.glowMats.length;
      const info = builders[key](ctx);
      planetApi.planet.add(info.root);
      info.key = key;
      info.interactives = ctx.interactives.slice(start);
      info.glowMats = ctx.glowMats.slice(gStart);
      info.marker = buildMarker(key, info, ctx);
      places[key] = info;
    });
    const secrets = buildSecrets(ctx, scene);
    let focused = null, hl = 0;
    return {
      places, secrets, ctx,
      setFocus(key) { focused = key; },
      update(t, dt) {
        ctx.updates.forEach(f => f(t, dt));
        hl = U.lerp(hl, focused ? 1 : 0, Math.min(1, dt * 3));
        Object.keys(places).forEach(k => {
          const p = places[k];
          const on = k === focused ? hl : 0;
          const pulse = 0.25 + 0.22 * Math.sin(t * 3);
          p.glowMats.forEach(m => { m.emissiveIntensity = on * pulse; });
          const mk = p.marker;
          const vis = k !== focused;
          mk.visible = vis;
          const s = 1 + Math.sin(t * 2.4 + k.length) * 0.12;
          mk.children[0].scale.setScalar(1.1 * s);
        });
      }
    };
  }

  OP.locationsLib = { create, faceSpin };
})();
