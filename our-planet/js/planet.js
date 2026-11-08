/* =====================================================================
   OUR PLANET — сама планета: рельеф, океан, атмосфера, облака.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});
  const U = OP.util;
  const V3 = THREE.Vector3;

  const R = 10;              // радиус планеты (уровень моря)
  OP.R = R;

  /* ---------- Где на планете находятся места ---------- */
  const BIOMES = {
    ocean:     { lat: -8,  lon: 0,   radius: 24 },
    forest:    { lat: 22,  lon: 62,  radius: 22 },
    mountains: { lat: 4,   lon: 128, radius: 27 },
    garden:    { lat: -18, lon: 192, radius: 22 },
    city:      { lat: 20,  lon: 252, radius: 20 },
    home:      { lat: -10, lon: 312, radius: 14 }
  };
  Object.keys(BIOMES).forEach(k => {
    const b = BIOMES[k];
    b.key = k;
    b.c = U.dirFromLatLon(b.lat, b.lon);
    const f = U.tangentFrame(b.c);
    b.e = f.east; b.n = f.north;
  });
  OP.BIOMES = BIOMES;

  const DEG = U.DEG;
  /* Локальные координаты точки dir внутри биома (в градусах) */
  function local(b, d) {
    const c = d.x * b.c.x + d.y * b.c.y + d.z * b.c.z;
    if (c <= 0.05) return null;
    const x = Math.atan2(d.x * b.e.x + d.y * b.e.y + d.z * b.e.z, c) / DEG;
    const y = Math.atan2(d.x * b.n.x + d.y * b.n.y + d.z * b.n.z, c) / DEG;
    return { x, y, a: Math.acos(Math.min(1, c)) / DEG };
  }
  const disk = (dist, r, soft) => 1 - U.smooth(r - soft, r, dist);
  const dist2 = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
  const bump = (x, y, cx, cy, s) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));

  /* ---------- Рельеф каждого биома ---------- */
  const shape = {
    ocean(l, d) {
      let h = -0.8 + U.fbm(d.x * 5, d.y * 5, d.z * 5, 3) * 0.15;
      const isl = [[0, 0, 3.2, 0.34], [-6.5, 4.5, 1.9, 0.2], [5.5, -5, 2.3, 0.24], [7.5, 5, 1.5, 0.16], [-4, -7, 1.3, 0.14]];
      for (const s of isl) { const k = disk(dist2(l.x, l.y, s[0], s[1]), s[2] * 1.15, s[2] * 0.5); h = Math.max(h, U.lerp(-0.8, s[3], Math.sqrt(k))); }
      return h;
    },
    forest(l, d) {
      const land = disk(l.a, 17, 6);
      return U.lerp(-0.7, 0.3 + U.fbm(d.x * 9, d.y * 9, d.z * 9, 3) * 0.16, land);
    },
    mountains(l, d) {
      const main = disk(dist2(l.x, l.y, -1, 0), 13.5, 7);
      const ridged = Math.pow(1 - Math.abs(U.noise3(d.x * 9, d.y * 9, d.z * 9)), 3);
      const peaks = bump(l.x, l.y, 0, 0, 4.4) * 1.3 + bump(l.x, l.y, -5.5, 3.6, 3.4) * 1.0 +
                    bump(l.x, l.y, 4.6, -3.6, 3.2) * 0.9 + bump(l.x, l.y, -2.2, -6, 2.8) * 0.6 + bump(l.x, l.y, 3.2, 4.6, 2.6) * 0.55;
      const hm = U.lerp(-0.75, 0.28 + peaks * (0.7 + ridged * 0.4) + ridged * 0.1 * main, main);
      const isl = U.lerp(-0.75, 0.5 + U.fbm(d.x * 9, d.y * 9, d.z * 9, 2) * 0.1, disk(dist2(l.x, l.y, 16.5, -2), 4.5, 2.5));
      return Math.max(hm, isl);
    },
    garden(l, d) {
      return U.lerp(-0.7, 0.2 + U.fbm(d.x * 10, d.y * 10, d.z * 10, 2) * 0.05, disk(l.a, 16, 5));
    },
    city(l) {
      let h = U.lerp(-0.7, 0.26, disk(l.a, 14, 4));
      const th = 28 * DEG;
      const dl = Math.abs(-Math.sin(th) * l.x + Math.cos(th) * l.y - 3.6);
      if (l.a < 14) h -= (1 - U.smooth(0.9, 1.8, dl)) * 0.62 * disk(l.a, 13, 2);
      return h;
    },
    home(l, d) {
      let h = U.lerp(-0.75, 0.3 + U.fbm(d.x * 12, d.y * 12, d.z * 12, 2) * 0.03, disk(l.a, 6.5, 3));
      h = U.lerp(h, 0.04, disk(dist2(l.x, l.y, 2.2, -1.4), 1.5, 0.6));
      return h;
    }
  };

  /* ---------- Высота в любой точке планеты ---------- */
  const _d = new V3();
  function heightInfo(dir) {
    const d = _d.copy(dir).normalize();
    let h = U.fbm(d.x * 1.5 + 3.1, d.y * 1.5, d.z * 1.5, 5) * 1.35 + 0.02;
    h += U.fbm(d.x * 6, d.y * 6, d.z * 6, 3) * 0.12;
    if (h > 0) h = h * 0.6 + Math.pow(Math.max(0, U.noise3(d.x * 4, d.y * 4, d.z * 4)), 2) * h * 1.2;
    let biome = null, w = 0;
    for (const k in BIOMES) {
      const b = BIOMES[k];
      const l = local(b, d);
      if (!l || l.a > b.radius) continue;
      const wk = 1 - U.smooth(b.radius - 7, b.radius, l.a);
      if (wk <= 0) continue;
      h = U.lerp(h, shape[k](l, d), wk);
      if (wk > w) { w = wk; biome = k; }
    }
    return { h, biome, w };
  }
  const heightAt = dir => heightInfo(dir).h;
  /* Радиус поверхности суши (не ниже уровня моря, если onWater) */
  function surfaceRadius(dir, onWater) {
    const h = heightAt(dir);
    return R + (onWater ? Math.max(h, 0.02) : h);
  }

  /* ---------- Цвета поверхности ---------- */
  const C = (h) => new THREE.Color(h);
  const COL = {
    deep: C("#0d3f66"), shallow: C("#38c3b8"), sand: C("#ecd3a6"),
    grassLo: C("#79cf72"), grassHi: C("#3f9e6c"), rock: C("#8f88ad"), snow: C("#f6f3ff"),
    forest: C("#2c8a68"), forest2: C("#1f6f5c"),
    meadow: C("#7fcf78"), pink: C("#f5a3c7"), lilac: C("#c6a2f2"), gold: C("#ffd98a"),
    city: C("#8f86bd"), city2: C("#a996b4"), home: C("#7fd07c")
  };
  const _c = new THREE.Color(), _c2 = new THREE.Color();
  function colorAt(d, info) {
    const h = info.h;
    const n = U.noise3(d.x * 14, d.y * 14, d.z * 14);
    if (h < -0.02) return _c.copy(COL.deep).lerp(COL.shallow, U.smooth(-0.8, 0, h));
    if (h < 0.035) return _c.copy(COL.sand);
    _c.copy(COL.grassLo).lerp(COL.grassHi, U.smooth(0.1, 0.8, h + n * 0.1));
    if (h > 0.75) _c.lerp(COL.rock, U.smooth(0.75, 1.1, h + n * 0.15));
    if (h > 1.25) _c.lerp(COL.snow, U.smooth(1.25, 1.5, h + n * 0.1));
    if (info.biome && info.w > 0) {
      const b = info.biome;
      _c2.copy(_c);
      if (b === "forest") { _c2.copy(COL.forest).lerp(COL.forest2, (n + 1) * 0.5); }
      else if (b === "garden") {
        _c2.copy(COL.meadow);
        const f = U.noise3(d.x * 90, d.y * 90, d.z * 90);
        if (f > 0.45) _c2.lerp(COL.pink, 0.6); else if (f < -0.5) _c2.lerp(COL.lilac, 0.55); else if (f > 0.35) _c2.lerp(COL.gold, 0.4);
      }
      else if (b === "city") { _c2.copy(COL.city).lerp(COL.city2, (n + 1) * 0.5); }
      else if (b === "home") { _c2.copy(COL.home).lerp(COL.grassHi, (n + 1) * 0.3); }
      _c.lerp(_c2, U.smooth(0, 0.6, info.w));
    }
    return _c;
  }

  /* ---------- Сфера с общими вершинами (для гладких нормалей) ---------- */
  function indexedSphere(detail) {
    const src = new THREE.IcosahedronGeometry(1, detail);
    const p = src.attributes.position;
    const map = new Map(), verts = [], idx = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const key = Math.round(x * 1e5) + "_" + Math.round(y * 1e5) + "_" + Math.round(z * 1e5);
      let id = map.get(key);
      if (id === undefined) { id = verts.length / 3; verts.push(x, y, z); map.set(key, id); }
      idx.push(id);
    }
    src.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    return g;
  }

  function buildTerrain(quality) {
    const g = indexedSphere(quality === "low" ? 38 : 62);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const d = new V3();
    for (let i = 0; i < p.count; i++) {
      d.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const info = heightInfo(d);
      const r = R + info.h;
      p.setXYZ(i, d.x * r, d.y * r, d.z * r);
      const c = colorAt(d, info);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true; mesh.castShadow = true;
    mesh.name = "terrain";
    return mesh;
  }

  /* ---------- Океан ---------- */
  function buildOcean(quality) {
    const seg = quality === "low" ? 72 : 128;
    const geo = new THREE.SphereGeometry(R, seg, seg / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uLight: { value: new V3(1, 0.5, 1).normalize() },
        uGlowDir: { value: BIOMES.ocean.c.clone() },
        uHomeDir: { value: BIOMES.home.c.clone() },
        uDeep: { value: new THREE.Color("#0f4c7a") },
        uShallow: { value: new THREE.Color("#3fd0c4") },
        uSky: { value: new THREE.Color("#b9a6ff") },
        uGlowBoost: { value: 0 }
      },
      vertexShader: `
        varying vec3 vN; varying vec3 vW; varying vec3 vObj;
        void main(){
          vObj = normalize(position);
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uLight; uniform vec3 uGlowDir; uniform vec3 uHomeDir;
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform float uGlowBoost;
        varying vec3 vN; varying vec3 vW; varying vec3 vObj;
        void main(){
          vec3 n = normalize(vN);
          vec3 p = normalize(vObj) * 10.0;
          // мелкая рябь
          float w1 = sin(p.x*3.1 + uTime*1.3) * sin(p.z*2.7 - uTime*1.1);
          float w2 = sin(p.y*4.3 - uTime*0.9 + p.x*1.7);
          n = normalize(n + 0.06*vec3(w1, w2, w1*w2));
          vec3 v = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          float diff = max(dot(n, uLight), 0.0) * 0.75 + 0.25;
          vec3 col = mix(uShallow, uDeep, 0.55) * diff;
          col = mix(col, uSky, fres * 0.65);
          vec3 h = normalize(uLight + v);
          col += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 90.0) * 0.9;
          // светящиеся волны у Океана нежности
          vec3 ob = normalize(vObj);
          float a = acos(clamp(dot(ob, uGlowDir), -1.0, 1.0));
          float ring = pow(0.5 + 0.5 * sin(a * 160.0 - uTime * 1.6), 16.0);
          float mask = smoothstep(0.3, 0.05, a);
          col += vec3(0.45, 1.0, 0.95) * ring * mask * (0.32 + uGlowBoost);
          col += vec3(0.25, 0.75, 0.9) * mask * 0.08;
          // мягкое свечение у Нашего дома
          float ah = acos(clamp(dot(ob, uHomeDir), -1.0, 1.0));
          float ringH = pow(0.5 + 0.5 * sin(ah * 200.0 - uTime * 1.2), 14.0) * smoothstep(0.2, 0.1, ah);
          col += vec3(1.0, 0.8, 0.5) * ringH * 0.35;
          float alpha = mix(0.62, 0.95, fres);
          gl_FragColor = vec4(col, alpha);
        }`
    });
    const m = new THREE.Mesh(geo, mat);
    m.name = "ocean";
    m.renderOrder = 1;
    return m;
  }

  /* ---------- Атмосфера ---------- */
  function buildAtmosphere() {
    const g = new THREE.Group();
    const outer = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.2, 64, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColA: { value: new THREE.Color("#7fb6ff") }, uColB: { value: new THREE.Color("#c69cff") }, uPower: { value: 1 } },
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColA; uniform vec3 uColB; uniform float uPower; varying vec3 vN; varying vec3 vV;
          void main(){ float i = pow(clamp(-dot(vN, vV), 0.0, 1.0), 1.7) * 1.25;
            vec3 c = mix(uColA, uColB, clamp(vN.y*0.5+0.5,0.0,1.0));
            gl_FragColor = vec4(c * i * uPower, 1.0); }`
      })
    );
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.035, 64, 32),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uCol: { value: new THREE.Color("#9fc4ff") }, uPower: { value: 1 } },
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uCol; uniform float uPower; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(1.0 - max(dot(vN, vV),0.0), 3.5); gl_FragColor = vec4(uCol * f * 0.75 * uPower, 1.0); }`
      })
    );
    g.add(outer, inner);
    g.userData.mats = [outer.material, inner.material];
    return g;
  }

  /* ---------- Облака ---------- */
  function buildClouds(quality) {
    const r = U.rng(77);
    const b = new U.GeoBuilder();
    const puff = new THREE.IcosahedronGeometry(1, quality === "low" ? 1 : 2);
    const count = quality === "low" ? 14 : 24;
    const tints = ["#ffffff", "#f6f1ff", "#fdf3fb", "#eef4ff"];
    for (let i = 0; i < count; i++) {
      const dir = new V3(r() * 2 - 1, (r() * 2 - 1) * 0.8, r() * 2 - 1).normalize();
      const rad = R + 2.0 + r() * 0.7;
      const n = 4 + Math.floor(r() * 4);
      const size = 0.35 + r() * 0.3;
      const spin = r() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const t = (k / (n - 1) - 0.5) * 2;
        const s = size * (1 - Math.abs(t) * 0.45) * (0.8 + r() * 0.4);
        const lm = U.localMatrix(t * size * 1.5, Math.abs(t) * -0.1 + r() * 0.08, (r() - 0.5) * size * 0.8, 0, 0, 0, s, s * 0.72, s);
        const m = U.surfaceMatrix(dir, rad, { spin });
        m.multiply(lm);
        b.add(puff, m, tints[(i + k) % tints.length]);
      }
    }
    const geo = b.build();
    puff.dispose();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, emissive: new THREE.Color("#a59ce0"), emissiveIntensity: 0.85, transparent: true, opacity: 0.94, flatShading: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = quality !== "low";
    mesh.name = "clouds";
    return mesh;
  }

  /* ---------- Сборка ---------- */
  function create(scene, quality) {
    const pivot = new THREE.Group();          // наклон оси
    pivot.rotation.z = 0.12;
    const planet = new THREE.Group();         // вращение
    pivot.add(planet);
    scene.add(pivot);

    const terrain = buildTerrain(quality);
    const ocean = buildOcean(quality);
    planet.add(terrain, ocean);

    const clouds = buildClouds(quality);
    const cloudPivot = new THREE.Group();
    cloudPivot.add(clouds);
    planet.add(cloudPivot);

    const atmosphere = buildAtmosphere();
    scene.add(atmosphere);

    const api = {
      pivot, planet, terrain, ocean, clouds, cloudPivot, atmosphere,
      autoRotate: true, rotSpeed: 0.028,
      update(dt, t, lightDir) {
        if (api.autoRotate) planet.rotation.y += dt * api.rotSpeed;
        cloudPivot.rotation.y += dt * 0.012;
        cloudPivot.rotation.x = Math.sin(t * 0.05) * 0.05;
        ocean.material.uniforms.uTime.value = t;
        if (lightDir) ocean.material.uniforms.uLight.value.copy(lightDir);
      },
      setCloudOpacity(o) { clouds.material.opacity = o; clouds.visible = o > 0.02; }
    };
    return api;
  }

  OP.planetLib = { create, heightAt, heightInfo, surfaceRadius, local, R };
})();
