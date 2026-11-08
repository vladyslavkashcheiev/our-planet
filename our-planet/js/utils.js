/* =====================================================================
   OUR PLANET — общие утилиты: шум, случайность, сборка геометрии,
   размещение объектов на поверхности сферы.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});
  const V3 = THREE.Vector3;

  /* ---------- Сид-генератор случайных чисел (mulberry32) ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 3D Simplex noise ---------- */
  const grad3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
  const perm = new Uint8Array(512);
  (function () {
    const r = rng(20260808);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const F3 = 1 / 3, G3 = 1 / 6;
  function noise3(x, y, z) {
    let n0, n1, n2, n3;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
      else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
      else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
    } else {
      if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
      else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
      else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2*G3, y2 = y0 - j2 + 2*G3, z2 = z0 - k2 + 2*G3;
    const x3 = x0 - 1 + 3*G3, y3 = y0 - 1 + 3*G3, z3 = z0 - 1 + 3*G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 < 0) n0 = 0; else { const g = (perm[ii+perm[jj+perm[kk]]] % 12) * 3; t0 *= t0; n0 = t0*t0*(grad3[g]*x0+grad3[g+1]*y0+grad3[g+2]*z0); }
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 < 0) n1 = 0; else { const g = (perm[ii+i1+perm[jj+j1+perm[kk+k1]]] % 12) * 3; t1 *= t1; n1 = t1*t1*(grad3[g]*x1+grad3[g+1]*y1+grad3[g+2]*z1); }
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 < 0) n2 = 0; else { const g = (perm[ii+i2+perm[jj+j2+perm[kk+k2]]] % 12) * 3; t2 *= t2; n2 = t2*t2*(grad3[g]*x2+grad3[g+1]*y2+grad3[g+2]*z2); }
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 < 0) n3 = 0; else { const g = (perm[ii+1+perm[jj+1+perm[kk+1]]] % 12) * 3; t3 *= t3; n3 = t3*t3*(grad3[g]*x3+grad3[g+1]*y3+grad3[g+2]*z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }
  function fbm(x, y, z, oct) {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * noise3(x*f, y*f, z*f); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  }

  /* ---------- Математика ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const DEG = Math.PI / 180;

  function dirFromLatLon(latDeg, lonDeg) {
    const la = latDeg * DEG, lo = lonDeg * DEG;
    return new V3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)).normalize();
  }
  /* Локальная касательная система в точке dir: east, north */
  function tangentFrame(dir) {
    const up = Math.abs(dir.y) > 0.98 ? new V3(1, 0, 0) : new V3(0, 1, 0);
    const east = new V3().crossVectors(up, dir).normalize();
    const north = new V3().crossVectors(dir, east).normalize();
    return { east, north };
  }
  /* Сдвиг направления на (dx, dy) градусов по касательной */
  function offsetDir(dir, dxDeg, dyDeg) {
    const { east, north } = tangentFrame(dir);
    return dir.clone()
      .addScaledVector(east, Math.tan(dxDeg * DEG))
      .addScaledVector(north, Math.tan(dyDeg * DEG))
      .normalize();
  }
  const angleBetween = (a, b) => Math.acos(clamp(a.dot(b), -1, 1)) / DEG;

  /* ---------- Сборщик геометрии: много примитивов → один меш ----------
     Каждая часть получает свой цвет (vertex color) и матрицу.
     Итог — один BufferGeometry = один draw call.                      */
  class GeoBuilder {
    constructor() { this.parts = []; }
    add(geo, matrix, color) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(matrix);
      const c = new THREE.Color(color);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b; }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      if (!g.attributes.normal) g.computeVertexNormals();
      this.parts.push(g);
      return this;
    }
    build() {
      if (!this.parts.length) return null;
      let total = 0;
      this.parts.forEach(g => total += g.attributes.position.count);
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
      let o = 0;
      this.parts.forEach(g => {
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        col.set(g.attributes.color.array, o * 3);
        o += g.attributes.position.count;
        g.dispose();
      });
      const out = new THREE.BufferGeometry();
      out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      out.setAttribute("color", new THREE.BufferAttribute(col, 3));
      out.computeBoundingSphere();
      this.parts = [];
      return out;
    }
  }

  /* Матрица: позиция на поверхности, ось Y = нормаль сферы */
  const _q = new THREE.Quaternion(), _up = new V3(0, 1, 0), _qs = new THREE.Quaternion();
  function surfaceMatrix(dir, radius, opts) {
    opts = opts || {};
    const m = new THREE.Matrix4();
    _q.setFromUnitVectors(_up, dir);
    if (opts.spin) { _qs.setFromAxisAngle(_up, opts.spin); _q.multiply(_qs); }
    const s = opts.scale === undefined ? 1 : opts.scale;
    const sc = typeof s === "number" ? new V3(s, s, s) : s;
    const p = dir.clone().multiplyScalar(radius);
    if (opts.local) p.add(opts.local.clone().applyQuaternion(_q));
    m.compose(p, _q.clone(), sc);
    return m;
  }
  /* Локальная матрица: смещение/поворот/масштаб внутри объекта */
  function localMatrix(x, y, z, rx, ry, rz, sx, sy, sz) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
    m.compose(new V3(x || 0, y || 0, z || 0), q, new V3(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz));
    return m;
  }
  /* Ставит Object3D на поверхность планеты */
  function placeOnSurface(obj, dir, radius, spin) {
    obj.position.copy(dir).multiplyScalar(radius);
    obj.quaternion.setFromUnitVectors(_up, dir);
    if (spin) obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(_up, spin));
  }

  /* Мягкий круглый спрайт для частиц */
  let _glowTex = null;
  function glowTexture() {
    if (_glowTex) return _glowTex;
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.75)");
    gr.addColorStop(0.6, "rgba(255,255,255,0.15)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    _glowTex = new THREE.CanvasTexture(c);
    return _glowTex;
  }
  function glowSprite(color, size, opacity) {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: opacity === undefined ? 1 : opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m); s.scale.setScalar(size);
    return s;
  }

  /* Форма сердца */
  function heartShape(s) {
    s = s || 1;
    const h = new THREE.Shape();
    h.moveTo(0, -0.9 * s);
    h.bezierCurveTo(-0.15 * s, -0.7 * s, -1 * s, -0.25 * s, -1 * s, 0.25 * s);
    h.bezierCurveTo(-1 * s, 0.75 * s, -0.45 * s, 0.95 * s, 0, 0.55 * s);
    h.bezierCurveTo(0.45 * s, 0.95 * s, 1 * s, 0.75 * s, 1 * s, 0.25 * s);
    h.bezierCurveTo(1 * s, -0.25 * s, 0.15 * s, -0.7 * s, 0, -0.9 * s);
    return h;
  }

  /* Освобождение ресурсов */
  function disposeObject(root) {
    root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { for (const k in m) { if (m[k] && m[k].isTexture) m[k].dispose(); } m.dispose(); });
      }
    });
  }

  /* Безопасный localStorage */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ourplanet:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ourplanet:" + k, JSON.stringify(v)); } catch (e) {} },
    clear() { try { Object.keys(localStorage).filter(k => k.indexOf("ourplanet:") === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {} }
  };

  OP.util = { rng, noise3, fbm, clamp, lerp, smooth, DEG, dirFromLatLon, tangentFrame, offsetDir, angleBetween,
    GeoBuilder, surfaceMatrix, localMatrix, placeOnSurface, glowTexture, glowSprite, heartShape, disposeObject, store };
})();
