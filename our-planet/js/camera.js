/* =====================================================================
   OUR PLANET — камера и управление (мышь, касание, щипок, колесо).
   Два режима:
   • overview — камера облетает планету вокруг центра;
   • focus    — камера смотрит на выбранное место, «вверх» = нормаль
                поверхности, поэтому никогда не уходит под землю.
   Переходы между режимами — кинематографичные дуги вокруг планеты.
   ===================================================================== */
(function () {
  const OP = (window.OP = window.OP || {});
  const U = OP.util;
  const V3 = THREE.Vector3;

  function create(camera, dom) {
    const st = {
      mode: "overview",
      enabled: true,
      sph: { theta: 0.35, phi: 1.38, dist: 30 },
      vel: { theta: 0, phi: 0 },
      frame: { target: new V3(), up: new V3(0, 1, 0), ref: new V3(0, 0, 1), side: new V3(1, 0, 0) },
      limits: { overview: [15, 60], focus: [2.2, 11] },
      tr: null,              // активный переход
      onTap: null, onDragStart: null, onZoomOut: null,
      lastInteract: 0
    };

    /* ---------- Поза камеры из текущих параметров ---------- */
    function pose(frame, sph, mode) {
      const s = Math.sin(sph.phi), c = Math.cos(sph.phi);
      if (mode === "overview") {
        const pos = new V3(s * Math.sin(sph.theta), c, s * Math.cos(sph.theta)).multiplyScalar(sph.dist);
        return { pos, target: new V3(), up: new V3(0, 1, 0) };
      }
      const off = frame.up.clone().multiplyScalar(c)
        .addScaledVector(frame.ref, s * Math.cos(sph.theta))
        .addScaledVector(frame.side, s * Math.sin(sph.theta));
      return { pos: frame.target.clone().addScaledVector(off, sph.dist), target: frame.target.clone(), up: frame.up.clone() };
    }

    function apply(p) {
      camera.position.copy(p.pos);
      camera.up.copy(p.up);
      camera.lookAt(p.target);
    }

    /* ---------- Плавный переход: дуга вокруг центра планеты ---------- */
    function transition(toMode, frame, sph, duration, ease, onDone) {
      const cur = { pos: camera.position.clone(), target: st.currentTarget ? st.currentTarget.clone() : new V3(), up: camera.up.clone() };
      st.mode = toMode;
      if (frame) st.frame = frame;
      st.sph = sph;
      st.vel.theta = st.vel.phi = 0;
      const end = pose(st.frame, st.sph, st.mode);
      const fromR = cur.pos.length(), toR = end.pos.length();
      const fromD = cur.pos.clone().normalize(), toD = end.pos.clone().normalize();
      const ang = Math.acos(U.clamp(fromD.dot(toD), -1, 1));
      const bump = Math.min(10, ang * 6);
      const prog = { t: 0 };
      if (st.tr) st.tr.kill();
      st.tr = gsap.to(prog, {
        t: 1, duration: duration || 2.2, ease: ease || "power2.inOut",
        onUpdate() {
          const e = prog.t;
          const target = pose(st.frame, st.sph, st.mode);   // учитывает возможные изменения
          const d = slerpDir(fromD, toD, e);
          const rr = U.lerp(fromR, toR, e) + Math.sin(e * Math.PI) * bump;
          camera.position.copy(d.multiplyScalar(rr));
          const tg = cur.target.clone().lerp(target.target, e);
          camera.up.copy(cur.up.clone().lerp(target.up, e).normalize());
          camera.lookAt(tg);
          st.currentTarget = tg;
        },
        onComplete() { st.tr = null; if (onDone) onDone(); }
      });
    }
    function slerpDir(a, b, t) {
      const dot = U.clamp(a.dot(b), -1, 1);
      if (dot > 0.9995) return a.clone().lerp(b, t).normalize();
      let om = Math.acos(dot);
      let axisFix = null;
      if (dot < -0.999) { axisFix = new V3(0, 1, 0); }
      if (axisFix) { // почти противоположные направления — через «верх»
        const mid = new V3().crossVectors(a, new V3(1, 0, 0)).normalize();
        return t < 0.5 ? slerpDir(a, mid, t * 2) : slerpDir(mid, b, (t - 0.5) * 2);
      }
      const so = Math.sin(om);
      return a.clone().multiplyScalar(Math.sin((1 - t) * om) / so).add(b.clone().multiplyScalar(Math.sin(t * om) / so)).normalize();
    }

    /* ---------- Публичные режимы ---------- */
    function overview(opts) {
      opts = opts || {};
      // начинаем облёт с того же направления, где камера сейчас
      const d = camera.position.clone().normalize();
      const sph = {
        theta: opts.theta !== undefined ? opts.theta : Math.atan2(d.x, d.z),
        phi: opts.phi !== undefined ? opts.phi : U.clamp(Math.acos(U.clamp(d.y, -1, 1)), 0.5, 2.6),
        dist: opts.dist || defaultDist()
      };
      transition("overview", null, sph, opts.duration || 2.0, opts.ease, opts.onDone);
    }
    /* worldPoint — точка на поверхности, normal — нормаль (мир), viewDir — с какой стороны смотреть */
    function focus(worldPoint, normal, opts) {
      opts = opts || {};
      const up = normal.clone().normalize();
      let ref = opts.viewDir ? opts.viewDir.clone() : new V3(0, -1, 0);   // по умолчанию смотрим «с юга»
      ref.addScaledVector(up, -ref.dot(up));
      if (ref.lengthSq() < 1e-4) ref = new V3(1, 0, 0).addScaledVector(up, -up.x);
      ref.normalize();
      const side = new V3().crossVectors(up, ref).normalize();
      const frame = { target: worldPoint.clone(), up, ref, side };
      const dist = (opts.dist || 5.5) * aspectFactor();
      transition("focus", frame, { theta: 0, phi: opts.phi || 0.95, dist }, opts.duration || 2.4, opts.ease, opts.onDone);
    }
    function aspectFactor() { return camera.aspect < 0.8 ? 1.45 : camera.aspect < 1.1 ? 1.2 : 1; }
    function defaultDist() { return 31 * aspectFactor(); }
    function setInstant(mode, sph) { st.mode = mode; st.sph = sph; apply(pose(st.frame, st.sph, st.mode)); st.currentTarget = new V3(); }

    /* ---------- Ввод ---------- */
    const pointers = new Map();
    let downInfo = null, pinch0 = 0, dist0 = 0;
    dom.style.touchAction = "none";
    dom.addEventListener("pointerdown", (e) => {
      dom.setPointerCapture && dom.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      st.lastInteract = performance.now();
      if (pointers.size === 1) { downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = st.sph.dist;
        if (downInfo) downInfo.moved = 999;
      }
    });
    dom.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!st.enabled || st.tr) return;
      st.lastInteract = performance.now();
      if (pointers.size === 1) {
        if (downInfo) downInfo.moved += Math.abs(dx) + Math.abs(dy);
        if (downInfo && downInfo.moved < 6) return;
        if (downInfo && !downInfo.dragNotified) { downInfo.dragNotified = true; st.onDragStart && st.onDragStart(); }
        const k = st.mode === "overview" ? 0.0055 : 0.006;
        st.vel.theta = -dx * k; st.vel.phi = -dy * k;
        rotate(st.vel.theta, st.vel.phi);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) setDist(dist0 * pinch0 / d);
      }
    });
    function up(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 0 && downInfo) {
        const dt = performance.now() - downInfo.t;
        if (downInfo.moved < 8 && dt < 600 && st.onTap) st.onTap(e.clientX, e.clientY);
        downInfo = null;
      }
      if (pointers.size === 1) { const p = [...pointers.values()][0]; downInfo = { x: p.x, y: p.y, t: performance.now(), moved: 999 }; }
    }
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dom.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!st.enabled || st.tr) return;
      st.lastInteract = performance.now();
      setDist(st.sph.dist * (1 + Math.sign(e.deltaY) * Math.min(0.15, Math.abs(e.deltaY) * 0.0015)));
    }, { passive: false });
    // жесты Safari (gesturestart) — блокируем системный зум страницы
    ["gesturestart", "gesturechange"].forEach(n => document.addEventListener(n, e => e.preventDefault(), { passive: false }));

    function rotate(dt, dp) {
      st.sph.theta += dt;
      if (st.mode === "overview") st.sph.phi = U.clamp(st.sph.phi + dp, 0.3, Math.PI - 0.3);
      else st.sph.phi = U.clamp(st.sph.phi + dp, 0.12, 1.25);
    }
    function setDist(d) {
      const lim = st.limits[st.mode];
      const max = lim[1] * (st.mode === "overview" ? aspectFactor() : aspectFactor());
      if (st.mode === "focus" && d > max * 1.15 && st.onZoomOut) { st.onZoomOut(); return; }
      st.sph.dist = U.clamp(d, lim[0], max);
    }

    function update(dt) {
      if (st.tr) return;
      if (pointers.size === 0) {
        if (Math.abs(st.vel.theta) + Math.abs(st.vel.phi) > 1e-5) {
          rotate(st.vel.theta, st.vel.phi);
          const damp = Math.pow(0.04, dt);
          st.vel.theta *= damp; st.vel.phi *= damp;
        }
      }
      const p = pose(st.frame, st.sph, st.mode);
      apply(p);
      st.currentTarget = p.target;
    }

    return { st, update, overview, focus, setInstant, aspectFactor, defaultDist, get busy() { return !!st.tr; } };
  }

  OP.cameraLib = { create };
})();
