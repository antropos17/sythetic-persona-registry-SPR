import { rng } from './print-model.mjs';
import { TEX } from './pages.mjs';
import { REDUCED } from '../preferences.mjs';

import { PASSPORT_SPREADS, passportCurve } from './geometry.mjs';

function createViewer(el, onChange = () => {}, onContextLost = () => {}) {
  const T = window.THREE;
  if (!T) throw new Error('3D library unavailable');
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'default',
  });
  const dom = renderer.domElement,
    textures = new Set(),
    geometries = new Set(),
    materials = new Set(),
    cleanup = [];
  let environment = null,
    env = null,
    pm = null,
    disposed = false;
  const release = (t) => {
    if (!t || !textures.has(t)) return;
    t.dispose();
    if (t.image instanceof HTMLCanvasElement) {
      t.image.width = 1;
      t.image.height = 1;
    }
    textures.delete(t);
  };
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanup.push(() => target.removeEventListener(type, handler, options));
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const fn of cleanup.reverse()) fn();
    for (const t of [...textures]) release(t);
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    if (env)
      env.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    pm?.dispose();
    environment?.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    dom.remove();
  };
  try {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    dom.setAttribute('aria-hidden', 'true');
    el.appendChild(dom);
    const geometry = (g) => {
      geometries.add(g);
      return g;
    };
    const material = (m) => {
      materials.add(m);
      return m;
    };
    const texture = (canvas, srgb = true) => {
      const t = new T.CanvasTexture(canvas);
      if (srgb) t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures.add(t);
      return t;
    };
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(30, 1, 0.1, 50);
    env = new T.Scene();
    pm = new T.PMREMGenerator(renderer);
    env.add(
      new T.Mesh(
        new T.BoxGeometry(12, 12, 12),
        new T.MeshBasicMaterial({ color: 0xb1b5bd, side: T.BackSide }),
      ),
    );
    for (const [w, h, pos, rotation, color] of [
      [6, 3, [0, 5, 2], [Math.PI / 2, 0, 0], 0xffffff],
      [3, 4, [-5, 1, 3], [0, Math.PI / 2, 0], 0xffedce],
      [3, 4, [5, 0, 3], [0, -Math.PI / 2, 0], 0xc8dbff],
    ]) {
      const panel = new T.Mesh(
        new T.PlaneGeometry(w, h),
        new T.MeshBasicMaterial({ color, side: T.DoubleSide }),
      );
      panel.position.set(...pos);
      panel.rotation.set(...rotation);
      env.add(panel);
    }
    environment = pm.fromScene(env, 0.025);
    scene.environment = environment.texture;
    pm.dispose();
    pm = null;
    env.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    env = null;
    scene.add(new T.HemisphereLight(0xffffff, 0x6c7383, 0.6));
    const key = new T.DirectionalLight(0xfff8ec, 1.5);
    key.position.set(-2, 3, 5);
    scene.add(key);
    const fill = new T.DirectionalLight(0xd8e7ff, 0.45);
    fill.position.set(3, -1, 4);
    scene.add(fill);
    const root = new T.Group(),
      book = new T.Group();
    root.add(book);
    scene.add(root);
    const navy = material(new T.MeshStandardMaterial({ color: 0x10264f, roughness: 0.72 }));
    const ivory = material(new T.MeshStandardMaterial({ color: 0xe5e1d4, roughness: 0.95 }));
    const paperMaterial = (options) =>
      material(
        new T.MeshPhysicalMaterial({
          roughness: 1,
          metalness: 0,
          specularIntensity: 0.08,
          envMapIntensity: 0.2,
          ...options,
        }),
      );
    const leftMat = paperMaterial({}),
      rightMat = paperMaterial({});
    function shape(w, h, r) {
      const s = new T.Shape(),
        x = -w / 2,
        y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r);
      s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h);
      s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }
    function face(w, h, r, mat, z, parent, back = false) {
      const g = geometry(new T.ShapeGeometry(shape(w, h, r), 10)),
        pos = g.attributes.position,
        uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
      const mesh = new T.Mesh(g, mat);
      mesh.position.set(w / 2, 0, z);
      if (back) mesh.rotation.y = Math.PI;
      parent.add(mesh);
      return mesh;
    }
    function slab(w, h, depth, r, mat, parent, z) {
      const g = geometry(
        new T.ExtrudeGeometry(shape(w, h, r), {
          depth,
          bevelEnabled: true,
          bevelSize: 0.003,
          bevelThickness: 0.003,
          bevelSegments: 3,
          steps: 1,
          curveSegments: 10,
        }),
      );
      const mesh = new T.Mesh(g, mat);
      mesh.position.set(w / 2, 0, z);
      parent.add(mesh);
      return mesh;
    }
    // Rounded covers, a real spine, stitched gutter and individually visible paper edges.
    slab(1.034, 1.458, 0.022, 0.036, navy, book, -0.094);
    slab(0.995, 1.414, 0.069, 0.024, ivory, book, -0.07);
    for (let i = 0; i < 14; i++) {
      const line = new T.LineLoop(
        geometry(new T.BufferGeometry().setFromPoints(shape(0.994, 1.413, 0.024).getPoints(12))),
        material(new T.LineBasicMaterial({ color: i % 3 === 0 ? 0xc9c3af : 0xf7f3e8 })),
      );
      line.position.set(0.497, 0, -0.066 + i * 0.0048);
      book.add(line);
    }
    face(0.988, 1.408, 0.024, rightMat, 0.004, book);
    const coverPivot = new T.Group();
    book.add(coverPivot);
    const grain = document.createElement('canvas');
    grain.width = grain.height = 256;
    const gx = grain.getContext('2d'),
      random = rng(74);
    gx.fillStyle = '#888';
    gx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 18000; i++) {
      gx.fillStyle = random() > 0.5 ? '#a4a4a4' : '#6d6d6d';
      gx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
    }
    const leather = texture(grain, false);
    leather.wrapS = leather.wrapT = T.RepeatWrapping;
    leather.repeat.set(3, 4);
    const coverMat = material(
      new T.MeshStandardMaterial({
        map: texture(TEX.cover()),
        metalnessMap: texture(TEX.coverMask(true), false),
        roughnessMap: texture(TEX.coverMask(false), false),
        bumpMap: leather,
        bumpScale: 0.0014,
        metalness: 0.82,
        roughness: 0.88,
        envMapIntensity: 0.45,
      }),
    );
    slab(1.034, 1.458, 0.022, 0.036, navy, coverPivot, 0);
    face(1.034, 1.458, 0.036, coverMat, 0.026, coverPivot);
    slab(0.995, 1.414, 0.018, 0.024, ivory, coverPivot, -0.023);
    face(0.988, 1.408, 0.024, leftMat, -0.027, coverPivot, true);
    for (let i = 0; i < 5; i++) {
      const line = new T.LineLoop(
        geometry(new T.BufferGeometry().setFromPoints(shape(0.994, 1.413, 0.024).getPoints(12))),
        material(new T.LineBasicMaterial({ color: 0xd1cab7 })),
      );
      line.position.set(0.497, 0, -0.021 + i * 0.003);
      coverPivot.add(line);
    }
    const spine = new T.Mesh(geometry(new T.CylinderGeometry(0.033, 0.033, 1.43, 20)), navy);
    spine.position.set(0.006, 0, -0.045);
    book.add(spine);
    const thread = material(new T.MeshStandardMaterial({ color: 0xb9ad89, roughness: 1 }));
    for (const y of [-0.54, -0.28, 0, 0.28, 0.54]) {
      const stitch = new T.Mesh(geometry(new T.CylinderGeometry(0.002, 0.002, 0.037, 6)), thread);
      stitch.rotation.z = Math.PI / 2;
      stitch.position.set(0.012, y, 0.006);
      book.add(stitch);
    }
    const holoMat = material(
      new T.ShaderMaterial({
        uniforms: {
          mask: { value: texture(TEX.holoMask(), false) },
          tilt: { value: new T.Vector2() },
        },
        vertexShader:
          'varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
        fragmentShader:
          'uniform sampler2D mask;uniform vec2 tilt;varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){float f=clamp(dot(normalize(vN),normalize(vV)),0.,1.);float t=vUv.x*1.3+vUv.y*.7+(1.-f)*3.2+tilt.x*2.2;vec3 col=.5+.5*cos(6.28318*(t+vec3(0.,.33,.67)));float a=texture2D(mask,vUv).r*(.025+.2*(1.-f));gl_FragColor=vec4(col,a);}',
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    const holo = face(0.976, 1.398, 0.022, holoMat, 0.005, book);
    const shade = document.createElement('canvas');
    shade.width = 128;
    shade.height = 4;
    const sh = shade.getContext('2d'),
      gradient = sh.createLinearGradient(0, 0, 128, 0);
    gradient.addColorStop(0, 'rgba(35,25,14,.24)');
    gradient.addColorStop(1, 'rgba(35,25,14,0)');
    sh.fillStyle = gradient;
    sh.fillRect(0, 0, 128, 4);
    const gutterMat = material(
      new T.MeshBasicMaterial({ map: texture(shade), transparent: true, depthWrite: false }),
    );
    const gutter = new T.Mesh(geometry(new T.PlaneGeometry(0.14, 1.4)), gutterMat);
    gutter.position.set(0.07, 0, 0.006);
    book.add(gutter);
    const PN = 64,
      ROWS = 8,
      frontGeo = geometry(new T.PlaneGeometry(1, 1.408, PN, ROWS)),
      backGeo = geometry(frontGeo.clone());
    for (let i = 0; i < backGeo.attributes.uv.count; i++)
      backGeo.attributes.uv.setX(i, 1 - backGeo.attributes.uv.getX(i));
    const flipFront = paperMaterial({ side: T.FrontSide }),
      flipBack = paperMaterial({ side: T.BackSide });
    const flip = new T.Group();
    flip.add(new T.Mesh(frontGeo, flipFront), new T.Mesh(backGeo, flipBack));
    flip.visible = false;
    book.add(flip);
    function bend(p) {
      const points = passportCurve(p, PN),
        lift = 0.006 + Math.sin(p * Math.PI) * 0.009;
      for (const g of [frontGeo, backGeo]) {
        const pos = g.attributes.position;
        for (let row = 0; row <= ROWS; row++)
          for (let col = 0; col <= PN; col++) {
            const i = row * (PN + 1) + col,
              v = row / ROWS - 0.5,
              twist = (Math.sin(p * Math.PI) * v * 0.018 * col) / PN;
            pos.setXYZ(i, points[col].x, (0.5 - row / ROWS) * 1.408, points[col].z + lift + twist);
          }
        pos.needsUpdate = true;
        g.computeVertexNormals();
      }
    }
    let alive = true,
      visible = true,
      raf = 0,
      last = performance.now(),
      zoom = 1,
      spread = 0,
      wantOpen = true,
      openP = 1,
      current = null,
      busy = false,
      turn = null,
      opening = null;
    let pair = [],
      targetPair = [],
      framing = 'spread',
      pan = { x: 0, y: 0 },
      mode = 'rotate',
      inspection = false;
    const angle = { x: -0.16, y: -0.12 },
      rotation = { ...angle },
      velocity = { x: 0, y: 0 };
    let cameraDistance = 0,
      cameraTarget = 4;
    const emit = () =>
      onChange({ zoom: Math.round(zoom * 100), spread, open: wantOpen, busy, framing, mode });
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    cleanup.push(() => {
      alive = false;
      stop();
    });
    function invalidate() {
      if (alive && visible && !document.hidden && !raf) raf = requestAnimationFrame(frame);
    }
    const ease = (t) => t * t * (3 - 2 * t);
    function applyOpen() {
      const p = ease(openP);
      coverPivot.rotation.y = -Math.PI * p;
      coverPivot.position.z = 0.034 - 0.056 * p;
      book.position.x = -0.5 * (1 - p);
      holo.visible = spread === 0 && openP > 0.8;
    }
    function fit() {
      const w = el.clientWidth || 600,
        h = el.clientHeight || 450;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const vertical = (camera.fov * Math.PI) / 180,
        horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect),
        width = framing === 'spread' ? 1.18 + openP : 1.13;
      cameraTarget =
        Math.max(width / 2 / Math.tan(horizontal / 2), 0.84 / Math.tan(vertical / 2)) + 0.16;
      if (!cameraDistance) cameraDistance = cameraTarget / zoom;
      invalidate();
    }
    const mapsFor = (p, index) =>
      index === 0
        ? [texture(TEX.endorsements(p)), texture(TEX.dataPage(p))]
        : [0, 1].map((side) =>
            texture(TEX.recordPage(p, index === 1 ? 'claims' : 'history', side)),
          );
    function showPair(next) {
      leftMat.map = next[0];
      rightMat.map = next[1];
      leftMat.needsUpdate = rightMat.needsUpdate = true;
    }
    function finishTurn() {
      if (!turn) return;
      showPair(targetPair);
      for (const map of pair) release(map);
      pair = targetPair;
      targetPair = [];
      turn = null;
      flip.visible = false;
      flipFront.map = flipBack.map = null;
      busy = false;
      emit();
    }
    function setOpen(value, instant = false) {
      finishTurn();
      wantOpen = !!value;
      velocity.x = velocity.y = 0;
      if (!wantOpen) {
        framing = 'spread';
        zoom = 1;
        pan = { x: 0, y: 0 };
      }
      if (instant || REDUCED) {
        openP = wantOpen ? 1 : 0;
        opening = null;
        applyOpen();
        fit();
      } else
        opening = {
          start: performance.now(),
          from: openP,
          to: wantOpen ? 1 : 0,
          duration: 800 * Math.max(0.12, Math.abs((wantOpen ? 1 : 0) - openP)),
        };
      emit();
      invalidate();
    }
    function setSpread(index) {
      index = Math.max(0, Math.min(PASSPORT_SPREADS.length - 1, Math.round(index)));
      if (index === spread || busy || !current) return;
      const next = mapsFor(current, index),
        forward = index > spread;
      spread = index;
      if (REDUCED || openP < 0.99 || opening) {
        for (const map of pair) release(map);
        pair = next;
        showPair(pair);
        setOpen(true, true);
        emit();
        invalidate();
        return;
      }
      targetPair = next;
      busy = true;
      if (forward) {
        flipFront.map = pair[1];
        flipBack.map = next[0];
        rightMat.map = next[1];
        rightMat.needsUpdate = true;
      } else {
        flipFront.map = next[1];
        flipBack.map = pair[0];
        leftMat.map = next[0];
        leftMat.needsUpdate = true;
      }
      flipFront.needsUpdate = flipBack.needsUpdate = true;
      flip.visible = true;
      turn = { start: performance.now(), forward };
      bend(forward ? 0 : 1);
      holo.visible = false;
      emit();
      invalidate();
    }
    function setPersona(p) {
      if (current === p) return;
      finishTurn();
      for (const map of pair) release(map);
      current = p;
      spread = 0;
      pair = mapsFor(p, 0);
      showPair(pair);
      applyOpen();
      emit();
      invalidate();
    }
    function setZoom(value) {
      zoom = Math.max(1, Math.min(2.5, value / 100));
      emit();
      invalidate();
    }
    function reset() {
      angle.x = -0.16;
      angle.y = -0.12;
      velocity.x = velocity.y = 0;
      pan = { x: 0, y: 0 };
      zoom = 1;
      framing = 'spread';
      mode = 'rotate';
      emit();
      fit();
    }
    function setFraming(value) {
      framing = ['left', 'right'].includes(value) ? value : 'spread';
      pan = { x: 0, y: 0 };
      zoom = 1;
      angle.x = angle.y = 0;
      velocity.x = velocity.y = 0;
      if (framing !== 'spread') setOpen(true, true);
      emit();
      fit();
    }
    const pointers = new Map();
    let gesture = null;
    const clampPan = () => {
      pan.x = Math.max(-1.5, Math.min(1.5, pan.x));
      pan.y = Math.max(-1.1, Math.min(1.1, pan.y));
    };
    function snapshot() {
      const points = [...pointers.values()];
      if (points.length >= 2) {
        const [a, b] = points;
        return {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          distance: Math.hypot(a.x - b.x, a.y - b.y),
        };
      }
      return points[0];
    }
    function onDown(e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      velocity.x = velocity.y = 0;
      const point = snapshot();
      gesture = { ...point, time: performance.now(), mode: e.shiftKey ? 'pan' : mode };
      try {
        dom.setPointerCapture(e.pointerId);
      } catch (_) {}
      invalidate();
    }
    function onMove(e) {
      if (!pointers.has(e.pointerId) || !gesture) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const point = snapshot(),
        r = dom.getBoundingClientRect(),
        now = performance.now(),
        dt = Math.max(0.008, (now - gesture.time) / 1000),
        dx = point.x - gesture.x,
        dy = point.y - gesture.y;
      if (pointers.size >= 2 && !inspection) {
        velocity.x = velocity.y = 0;
        gesture = { ...point, time: now, mode: gesture.mode };
        return;
      }
      if (pointers.size >= 2 && inspection) {
        if (gesture.distance > 0) setZoom((zoom * 100 * point.distance) / gesture.distance);
        pan.x += ((dx / r.width) * 2) / zoom;
        pan.y -= ((dy / r.height) * 1.7) / zoom;
        clampPan();
      } else if (gesture.mode === 'pan') {
        pan.x += ((dx / r.width) * 2) / zoom;
        pan.y -= ((dy / r.height) * 1.7) / zoom;
        clampPan();
      } else {
        const yaw = (dx / r.width) * Math.PI * 2,
          pitch = (dy / r.height) * 2;
        angle.y += yaw;
        angle.x = Math.max(-1.25, Math.min(1.25, angle.x + pitch));
        velocity.y = Math.max(-4, Math.min(4, yaw / dt));
        velocity.x = Math.max(-2, Math.min(2, pitch / dt));
      }
      gesture = { ...point, time: now, mode: gesture.mode };
      invalidate();
    }
    function onUp(e) {
      const elapsed = gesture ? performance.now() - gesture.time : Infinity;
      pointers.delete(e.pointerId);
      if (pointers.size) {
        gesture = { ...snapshot(), time: performance.now(), mode };
        velocity.x = velocity.y = 0;
      } else {
        gesture = null;
        if (REDUCED || elapsed > 80) velocity.x = velocity.y = 0;
      }
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch (_) {}
      invalidate();
    }
    const onCancel = (e) => {
      if (!pointers.has(e.pointerId)) return;
      velocity.x = velocity.y = 0;
      onUp(e);
    };
    const onWheel = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      setZoom(zoom * 100 - e.deltaY * 0.08);
    };
    listen(dom, 'pointerdown', onDown);
    listen(dom, 'pointermove', onMove);
    listen(dom, 'pointerup', onUp);
    listen(dom, 'pointercancel', onCancel);
    listen(dom, 'lostpointercapture', onCancel);
    listen(dom, 'dblclick', reset);
    listen(dom, 'wheel', onWheel, { passive: false });
    listen(dom, 'webglcontextlost', (e) => {
      e.preventDefault();
      stop();
      onContextLost();
    });
    function frame(now) {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      if (opening) {
        const t = Math.min(1, (now - opening.start) / opening.duration);
        openP = opening.from + (opening.to - opening.from) * ease(t);
        applyOpen();
        fit();
        if (t === 1) opening = null;
      }
      if (turn) {
        const t = Math.min(1, (now - turn.start) / 850);
        bend(turn.forward ? ease(t) : 1 - ease(t));
        if (t === 1) {
          finishTurn();
          applyOpen();
        }
      }
      if (!gesture) {
        angle.y += velocity.y * dt;
        angle.x = Math.max(-1.25, Math.min(1.25, angle.x + velocity.x * dt));
        velocity.x *= Math.exp(-9 * dt);
        velocity.y *= Math.exp(-9 * dt);
      }
      const k = REDUCED ? 1 : 1 - Math.exp(-18 * dt);
      rotation.x += (angle.x - rotation.x) * k;
      rotation.y += (angle.y - rotation.y) * k;
      root.rotation.set(rotation.x, rotation.y, 0);
      root.position.set(
        pan.x + (framing === 'left' ? 0.5 : framing === 'right' ? -0.5 : 0) * openP,
        pan.y,
        0,
      );
      const tangent = Math.tan((camera.fov * Math.PI) / 360),
        halfWidth = (framing === 'spread' ? 1.18 + openP : 1.13) / 2,
        center = framing === 'left' ? -0.5 * openP : framing === 'right' ? 0.5 * openP : 0;
      let distance = 0;
      // Fit the rotated inspection region; intentional user panning and zoom remain independent.
      const corner = new T.Vector3();
      for (const x of [-halfWidth, halfWidth])
        for (const y of [-0.84, 0.84])
          for (const z of [-0.1, 0.06]) {
            corner.set(center + x, y, z).applyEuler(root.rotation);
            corner.x -= center;
            distance = Math.max(
              distance,
              Math.abs(corner.x) / (tangent * camera.aspect) + corner.z,
              Math.abs(corner.y) / tangent + corner.z,
            );
          }
      const target = (distance + 0.12) / zoom;
      cameraDistance += (target - cameraDistance) * (REDUCED ? 1 : 1 - Math.exp(-16 * dt));
      camera.position.set(0, 0, cameraDistance);
      camera.lookAt(0, 0, 0);
      holoMat.uniforms.tilt.value.set(rotation.y, rotation.x);
      renderer.render(scene, camera);
      if (
        opening ||
        turn ||
        Math.abs(velocity.x) + Math.abs(velocity.y) > 0.001 ||
        Math.abs(rotation.x - angle.x) + Math.abs(rotation.y - angle.y) > 0.0001 ||
        Math.abs(cameraDistance - target) > 0.0001
      )
        invalidate();
    }
    const ro = new ResizeObserver(fit);
    cleanup.push(() => ro.disconnect());
    ro.observe(el);
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) {
        last = performance.now();
        invalidate();
      } else stop();
    });
    cleanup.push(() => io.disconnect());
    io.observe(el);
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        last = performance.now();
        invalidate();
      }
    };
    listen(document, 'visibilitychange', onVisibility);
    applyOpen();
    fit();
    return {
      setPersona,
      setOpen,
      setSpread,
      setZoom,
      setFraming,
      reset,
      setInspection: (value) => {
        inspection = value;
        fit();
      },
      setMode: (value) => {
        mode = value === 'pan' ? 'pan' : 'rotate';
        emit();
      },
      nudge: (dx, dy) => {
        velocity.x = velocity.y = 0;
        angle.y += dx;
        angle.x = Math.max(-1.25, Math.min(1.25, angle.x + dy));
        invalidate();
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export { PASSPORT_SPREADS, passportCurve, createViewer };
