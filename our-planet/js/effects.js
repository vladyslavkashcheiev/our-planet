/* =====================================================================
   OUR PLANET — космос и эффекты: звёзды, туманность, далёкие планеты,
   пыль, рождение планеты, всплески частиц, финальные огни.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});
  const U = OP.util;
  const V3 = THREE.Vector3;

  /* ---------- Звёзды с мерцанием ---------- */
  function buildStars(count) {
    const r = U.rng(11);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), ph = new Float32Array(count);
    const palette = [new THREE.Color("#ffffff"), new THREE.Color("#cfe0ff"), new THREE.Color("#ffe6f3"), new THREE.Color("#e3d6ff"), new THREE.Color("#fff1d0")];
    for (let i = 0; i < count; i++) {
      const d = new V3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(280 + r() * 260);
      pos.set([d.x, d.y, d.z], i * 3);
      const c = palette[Math.floor(r() * palette.length)];
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = Math.pow(r(), 4) * 7 + 1.2;
      ph[i] = r() * 6.28;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uFade: { value: 0 } },
      vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uPR; varying vec3 vC; varying float vTw;
        void main(){ vC = color; vTw = 0.65 + 0.35 * sin(uTime * (0.8 + aPhase*0.3) + aPhase*7.0);
          vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uPR; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uFade; varying vec3 vC; varying float vTw;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p);
          float a = smoothstep(0.5, 0.0, d); a = a*a;
          float cross = max(0.0, 1.0 - abs(p.x)*14.0) * smoothstep(0.5,0.0,abs(p.y)) + max(0.0, 1.0 - abs(p.y)*14.0) * smoothstep(0.5,0.0,abs(p.x));
          gl_FragColor = vec4(vC * (a + cross*0.35) * vTw * uFade, 1.0); }`
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return pts;
  }

  /* ---------- Туманность (генерируется один раз в canvas) ---------- */
  function buildNebula(quality) {
    const W = quality === "low" ? 256 : 512, H = W / 2;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(W, H);
    const base = [6, 8, 26], c1 = [70, 48, 140], c2 = [30, 80, 150], c3 = [150, 70, 130];
    for (let y = 0; y < H; y++) {
      const lat = (0.5 - y / H) * Math.PI;
      for (let x = 0; x < W; x++) {
        const lon = (x / W) * Math.PI * 2;
        const dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
        const n1 = U.fbm(dx * 1.6 + 5, dy * 1.6, dz * 1.6, 4) * 0.5 + 0.5;
        const n2 = U.fbm(dx * 2.4, dy * 2.4 + 9, dz * 2.4, 3) * 0.5 + 0.5;
        const band = Math.exp(-Math.pow((dy - 0.15 * Math.sin(lon * 2)) * 2.2, 2));
        const a1 = Math.pow(Math.max(0, n1 - 0.42) * 2.2, 2) * (0.35 + band);
        const a2 = Math.pow(Math.max(0, n2 - 0.48) * 2.4, 2) * (0.25 + band * 0.6);
        const a3 = Math.pow(Math.max(0, n1 * n2 - 0.3) * 2.6, 3) * band;
        const i = (y * W + x) * 4;
        img.data[i]     = Math.min(255, base[0] + c1[0] * a1 + c2[0] * a2 + c3[0] * a3);
        img.data[i + 1] = Math.min(255, base[1] + c1[1] * a1 + c2[1] * a2 + c3[1] * a3);
        img.data[i + 2] = Math.min(255, base[2] + c1[2] * a1 + c2[2] * a2 + c3[2] * a3);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, transparent: true, opacity: 0 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
    m.renderOrder = -10;
    return m;
  }

  /* ---------- Далёкие планеты ---------- */
  function stripeTexture(cols) {
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 256;
    const g = cv.getContext("2d");
    const r = U.rng(cols.length * 13);
    let y = 0;
    while (y < 256) { const h = 6 + r() * 26; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(0, y, 64, h); y += h; }
    g.filter = "blur(4px)"; g.drawImage(cv, 0, 0);
    const t = new THREE.CanvasTexture(cv); return t;
  }
  function buildDistantPlanets() {
    const g = new THREE.Group();
    const defs = [
      { pos: [-250, 95, -400], r: 20, cols: ["#b79cf0", "#9d84e0", "#d8c4ff", "#8a74cf"], ring: true },
      { pos: [210, -70, -220], r: 11, cols: ["#ffb6d0", "#f59bbd", "#ffd6e4"] },
      { pos: [120, 120, 260], r: 8, cols: ["#8fd3ff", "#6fb6f0", "#c2ecff"] },
      { pos: [-240, -110, 160], r: 14, cols: ["#ffd9a0", "#f3b980", "#ffe9c8"] }
    ];
    defs.forEach(d => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(d.r, 40, 20),
        new THREE.MeshLambertMaterial({ map: stripeTexture(d.cols), emissive: new THREE.Color(d.cols[0]), emissiveIntensity: 0.12 }));
      m.position.set(...d.pos);
      m.rotation.z = 0.3;
      if (d.ring) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(d.r * 1.4, d.r * 2.1, 64),
          new THREE.MeshBasicMaterial({ color: "#e7d9ff", transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = Math.PI / 2.4;
        m.add(ring);
      }
      const halo = U.glowSprite(new THREE.Color(d.cols[0]), d.r * 4, 0.25);
      m.add(halo);
      g.add(m);
    });
    return g;
  }

  /* ---------- Космическая пыль ---------- */
  function buildDust(count) {
    const r = U.rng(5);
    const pos = new Float32Array(count * 3), ph = new Float32Array(count), col = new Float32Array(count * 3);
    const pal = [new THREE.Color("#c8b4ff"), new THREE.Color("#ffc4e1"), new THREE.Color("#a8d8ff"), new THREE.Color("#ffe3a8")];
    for (let i = 0; i < count; i++) {
      const d = new V3(r() * 2 - 1, (r() * 2 - 1) * 0.6, r() * 2 - 1).normalize().multiplyScalar(14 + r() * 26);
      pos.set([d.x, d.y, d.z], i * 3); ph[i] = r() * 6.28;
      const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uFade: { value: 0 } },
      vertexShader: `attribute float aPhase; uniform float uTime; uniform float uPR; varying vec3 vC; varying float vA;
        void main(){ vec3 p = position; p.y += sin(uTime*0.3 + aPhase)*0.6; p.x += cos(uTime*0.2 + aPhase*2.0)*0.5;
          vC = color; vA = 0.5 + 0.5*sin(uTime*0.7 + aPhase*3.0);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = (90.0 / -mv.z) * uPR; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uFade; varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*a*a*(0.35+0.65*vA)*uFade, 1.0); }`
    });
    const p = new THREE.Points(g, m); p.frustumCulled = false;
    return p;
  }

  /* ---------- Рождение планеты: частицы стягиваются в центр ---------- */
  function buildBirth(count) {
    const r = U.rng(3);
    const start = new Float32Array(count * 3), ph = new Float32Array(count), col = new Float32Array(count * 3);
    const pal = [new THREE.Color("#ffffff"), new THREE.Color("#c9b6ff"), new THREE.Color("#ffc6e2"), new THREE.Color("#9fd8ff"), new THREE.Color("#ffe2a0")];
    for (let i = 0; i < count; i++) {
      const d = new V3(r() * 2 - 1, (r() * 2 - 1) * 0.5, r() * 2 - 1).normalize().multiplyScalar(14 + r() * 30);
      start.set([d.x, d.y, d.z], i * 3); ph[i] = r();
      const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(start, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uP: { value: 0 }, uPR: { value: 1 }, uFade: { value: 0 } },
      vertexShader: `attribute float aPhase; uniform float uP; uniform float uPR; varying vec3 vC;
        void main(){
          float t = clamp((uP - aPhase*0.35) / 0.65, 0.0, 1.0); t = t*t*(3.0-2.0*t);
          float ang = t * 4.0 * (0.5 + aPhase);
          float c = cos(ang), s = sin(ang);
          vec3 p = position; p = vec3(p.x*c - p.z*s, p.y*(1.0-t*0.6), p.x*s + p.z*c);
          p *= mix(1.0, 0.18, t);
          vC = color;
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = (120.0/ -mv.z) * uPR * (1.0 + t); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uFade; varying vec3 vC;
        void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*a*a*uFade, 1.0); }`
    });
    const p = new THREE.Points(g, m); p.frustumCulled = false;
    return p;
  }

  /* ---------- Текстура сердечка для частиц ---------- */
  let _heartTex = null;
  function heartTexture() {
    if (_heartTex) return _heartTex;
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    g.translate(32, 34); g.scale(1.6, 1.6);
    g.beginPath();
    g.moveTo(0, 10); g.bezierCurveTo(-2, 8, -14, 2, -14, -5); g.bezierCurveTo(-14, -12, -5, -14, 0, -7);
    g.bezierCurveTo(5, -14, 14, -12, 14, -5); g.bezierCurveTo(14, 2, 2, 8, 0, 10);
    g.fillStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 6; g.fill();
    _heartTex = new THREE.CanvasTexture(cv);
    return _heartTex;
  }

  /* ---------- Всплеск частиц (сердечки или искры) ---------- */
  const bursts = [];
  function burst(scene, worldPos, opts) {
    opts = opts || {};
    const count = opts.count || 40;
    const r = U.rng((Math.random() * 1e9) | 0);
    const vel = new Float32Array(count * 3), col = new Float32Array(count * 3), pos = new Float32Array(count * 3);
    const pal = (opts.colors || ["#ff7eb6", "#ffc0dc", "#c9a6ff", "#ffe08a"]).map(c => new THREE.Color(c));
    const up = opts.up || new V3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const v = new V3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(0.6 + r() * 1.6).addScaledVector(up, 1.2 + r());
      vel.set([v.x, v.y, v.z], i * 3);
      const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aVel", new THREE.BufferAttribute(vel, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uT: { value: 0 }, uPR: { value: OP.pixelRatio || 1 }, uMap: { value: opts.hearts ? heartTexture() : U.glowTexture() }, uScale: { value: opts.scale || 1 }, uGrav: { value: up.clone().multiplyScalar(-1.4) } },
      vertexShader: `attribute vec3 aVel; uniform float uT; uniform float uPR; uniform float uScale; uniform vec3 uGrav; varying vec3 vC; varying float vA;
        void main(){ vec3 p = aVel * uT * uScale + uGrav * uT * uT * uScale * 0.5; vC = color; vA = 1.0 - smoothstep(0.6, 1.6, uT);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = (160.0 / -mv.z) * uPR * uScale; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * t.a * vA, 1.0); }`
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.position.copy(worldPos);
    scene.add(p);
    bursts.push({ p, t: 0, scene });
  }
  function updateBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      b.p.material.uniforms.uT.value = b.t;
      if (b.t > 1.7) { b.scene.remove(b.p); b.p.geometry.dispose(); b.p.material.dispose(); bursts.splice(i, 1); }
    }
  }

  /* ---------- Секретная звезда ---------- */
  function buildSecretStar() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.15, "rgba(255,230,180,0.9)"); gr.addColorStop(0.5, "rgba(255,180,220,0.18)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "rgba(255,240,210,0.9)";
    g.beginPath(); g.moveTo(64, 0); g.lineTo(68, 60); g.lineTo(128, 64); g.lineTo(68, 68); g.lineTo(64, 128); g.lineTo(60, 68); g.lineTo(0, 64); g.lineTo(60, 60); g.closePath(); g.fill();
    const tex = new THREE.CanvasTexture(cv);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(9);
    s.position.set(-95, 62, -150);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(9, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(s.position);
    return { sprite: s, hit };
  }

  /* ---------- Финальные огни пяти мест ---------- */
  function buildFinaleBeacons(planetGroup, keys) {
    const g = new THREE.Group();
    const pts = [];
    keys.forEach((k, i) => {
      const b = OP.BIOMES[k];
      const p = b.c.clone().multiplyScalar(OP.R + 2.6);
      const s = U.glowSprite(new THREE.Color(["#7fe8ff", "#9dffb0", "#ffffff", "#ff9fd0", "#ffd98a"][i % 5]), 3.2, 0);
      s.position.copy(p);
      g.add(s);
      pts.push(p);
    });
    // дуги между огнями
    const lines = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const mid = a.clone().add(b).normalize().multiplyScalar(OP.R + 4.2);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
      const mat = new THREE.LineBasicMaterial({ color: "#ffd9a8", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const l = new THREE.Line(geo, mat);
      geo.setDrawRange(0, 0);
      g.add(l); lines.push(l);
    }
    g.visible = false;
    planetGroup.add(g);
    return { group: g, sprites: g.children.filter(c => c.isSprite), lines };
  }

  OP.effects = { buildStars, buildNebula, buildDistantPlanets, buildDust, buildBirth, burst, updateBursts, buildSecretStar, buildFinaleBeacons, heartTexture };
})();
