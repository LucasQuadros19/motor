// Vista 3D (three.js r128): motor em corte de ilustração técnica — bloco, cabeçote e cárter em alumínio
// fundido cortados ao meio (faces de corte hachuradas, galerias de água e óleo à mostra), cinemática real
// (em linha, V, boxer, 2 tempos, Wankel), mapa de calor das peças vindo da rede térmica, sistema de
// arrefecimento (radiador, ventoinha, bomba, termostática, mangueiras) ou aletas, sistema de óleo
// (cárter com nível, pescador, bomba, galerias, jatos, bronzinas coloridas pelo regime de lubrificação),
// admissão com tomada de ar e filtro, escape em tubo dobrado com coletor em cone, componentes em corte
// e pulsos/ondas de cada cilindro se encontrando. Câmbios em trans3d.js; peças auxiliares em parts3d.js.
const View3D = !window.THREE ? null : (() => {
  const U = 100, DEG = Math.PI / 180, TAU = 2 * Math.PI, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const inWin = (t, a, b, C) => ((t - a) % C + C) % C <= ((b - a) % C + C) % C;
  const cFresh = new THREE.Color(0x3b82f6), cMid = new THREE.Color(0xff6a1a), cHot = new THREE.Color(0xffe08a), cCold = new THREE.Color(0x5a4034);
  const HEAT = [[-20, 0x1d4fd1], [40, 0x3b82f6], [85, 0x2fc98a], [130, 0xb6e04a], [180, 0xffd34d], [250, 0xff8a2a], [350, 0xff2d2d], [700, 0xffe2e2]].map(([t, c]) => [t, new THREE.Color(c)]);
  function heatColor(T, out) { // cor do mapa de calor (°C)
    if (T <= HEAT[0][0]) return out.copy(HEAT[0][1]);
    for (let i = 1; i < HEAT.length; i++) if (T <= HEAT[i][0]) return out.copy(HEAT[i - 1][1]).lerp(HEAT[i][1], (T - HEAT[i - 1][0]) / (HEAT[i][0] - HEAT[i - 1][0]));
    return out.copy(HEAT[HEAT.length - 1][1]);
  }
  const PAL = [0xff6b5b, 0xffc04d, 0x6fe08a, 0x5bc0ff, 0xc48bff, 0xff8fd0, 0x9cf0e6, 0xf0e68c, 0xff9a3c, 0x8fb8ff, 0xb5ff6b, 0xffd1a1].map(c => new THREE.Color(c));
  let R, scene, cam, key, plight, root, g, M, K, crank, cyls = [], rotors = [], gb = null, chg = null, plThr = null, fx = null, focusName = null;
  let pick = [], onPick = null, onHover = null, size = [0, 0], trRef = null, miMax = 1, meMax = 1, exG = null, exCtx = null, exhKey = 'stock', coolKey = 'liquid';
  let tbG = null, ghosted = [], finGs = [], panK = 0, banks = [], coolG = null, oilG = null, hdrG = null, bearings = [], oilBox = null, fan = null, labels = {}, hide = {};
  const orb = { r: 80, yaw: 0.75, pitch: 0.32, t: V() }, home = {}, views = {}, tween = { k: 1 }, curves = {};

  // ---------- texturas ----------
  function canvasTex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t;
  }
  const glowTex = () => canvasTex(64, 64, (x) => {
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,230,150,0.7)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  });
  const honeyTex = () => canvasTex(128, 128, (x) => { // colmeia do catalisador
    x.fillStyle = '#e8e0cc'; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#8a7f6a'; x.lineWidth = 1.2;
    for (let i = 0; i <= 128; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  });
  const perfTex = () => canvasTex(32, 32, (x) => { x.fillStyle = '#9aa3ad'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#1a1d21'; for (const [u, v] of [[8, 8], [24, 24]]) { x.beginPath(); x.arc(u, v, 4, 0, 7); x.fill(); } }, [10, 3]);
  const hatchTex = () => canvasTex(64, 64, (x) => { // hachura de corte (ilustração técnica)
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#8a8a8a'; x.lineWidth = 3;
    for (let i = -64; i < 128; i += 16) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.stroke(); }
  }, [1, 1]);
  const finTex = () => canvasTex(64, 64, (x) => { x.fillStyle = '#4a525b'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#2a2f35'; for (let i = 0; i < 64; i += 4) x.fillRect(i, 0, 1.5, 64); x.fillStyle = '#5c656f'; for (let j = 0; j < 64; j += 16) x.fillRect(0, j, 64, 2); }, [8, 4]);
  const pleatTex = () => canvasTex(64, 64, (x) => { for (let i = 0; i < 64; i += 8) { const g2 = x.createLinearGradient(i, 0, i + 8, 0); g2.addColorStop(0, '#d9c27e'); g2.addColorStop(0.5, '#f4e6b4'); g2.addColorStop(1, '#bfa660'); x.fillStyle = g2; x.fillRect(i, 0, 8, 64); } }, [6, 1]);
  const textSprite = (t, h, color) => P3.text(t, h, color);
  const tintTex = () => canvasTex(256, 4, (x) => { const gr = x.createLinearGradient(0, 0, 256, 0);
    [[0, '#4d5f96'], [0.1, '#6e4f86'], [0.22, '#a77d48'], [0.38, '#b9a172'], [0.6, '#9a938a'], [1, '#86817c']].forEach(([o, c]) => gr.addColorStop(o, c)); x.fillStyle = gr; x.fillRect(0, 0, 256, 4); });
  function mats() {
    const S = (c, m, r, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, metalness: m, roughness: r, envMapIntensity: 0.6 }, o));
    const T = { transparent: true, depthWrite: false, side: THREE.DoubleSide };
    M = {
      steel: S(0x8d96a1, 1, 0.32), forged: S(0x5f666f, 1, 0.42), alu: S(0xaeb6bf, 0.75, 0.36), dark: S(0x2a3037, 0.6, 0.5),
      black: S(0x14171b, 0.2, 0.75), gear: S(0x9099a4, 1, 0.34), brass: S(0xb08a52, 1, 0.34), copper: S(0xa8642b, 1, 0.38),
      ceramic: S(0xe8e8e4, 0, 0.35), hdrTint: S(0xffffff, 0.9, 0.34, { map: tintTex(), emissive: 0x000000 }), silicone: S(0x2c5fa8, 0, 0.6), rubber: S(0x16181b, 0, 0.85), header: S(0x6f5c4b, 0.9, 0.38, { emissive: 0x000000, side: THREE.DoubleSide }), pipe: S(0x7c7066, 0.9, 0.36, { emissive: 0x000000 }),
      shell: S(0x9bb6d4, 0.1, 0.15, Object.assign({ opacity: 0.06 }, T)), glass: S(0x8ab8f0, 0.1, 0.08, Object.assign({ opacity: 0.12 }, T)),
      headCut: S(0xb9c2cc, 0.6, 0.35, Object.assign({ opacity: 0.13 }, T)),
      cut: S(0x9aa3ad, 0.8, 0.3, Object.assign({ opacity: 0.26 }, T)), fiber: S(0xe8d27a, 0, 0.9, Object.assign({ opacity: 0.22 }, T)),
      aluCut: S(0xaeb6bf, 0.7, 0.36, Object.assign({ opacity: 0.38 }, T)), hotCut: S(0x5c534b, 0.9, 0.45, Object.assign({ opacity: 0.5, emissive: 0x000000 }, T)),
      pan: S(0x23272c, 0.55, 0.42), chain: S(0x5a6068, 1, 0.38), perf: S(0x9aa3ad, 0.9, 0.4, { map: perfTex() }), comb: S(0xe8e0cc, 0, 0.8, { map: honeyTex() }),
      portEx: S(0xff7a2a, 0.2, 0.5, { emissive: 0x401000 }), portTr: S(0x4ea1ff, 0.2, 0.5, { emissive: 0x08204a }),
      // fundidos, pintura, corte
      castAlu: S(0xa3aab1, 0.6, 0.55), castBlk: S(0x7f878f, 0.55, 0.6),
      cover: new THREE.MeshPhysicalMaterial({ color: 0x6e1212, metalness: 0.3, roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.35, envMapIntensity: 0.55 }),
      sect: S(0xc9553a, 0.05, 0.85, { map: hatchTex(), side: THREE.DoubleSide }),
      jacket: S(0x2f7de0, 0, 0.35, { emissive: 0x0a2a55, side: THREE.DoubleSide }),
      oil: S(0xd9921c, 0.05, 0.2, { transparent: true, opacity: 0.78, emissive: 0x2a1500 }),
      pis: S(0xaeb6bf, 0.75, 0.36), exv: S(0x8d96a1, 1, 0.32, { emissive: 0x000000 }), liner: S(0x8ab8f0, 0.1, 0.08, Object.assign({ opacity: 0.12 }, T)),
      radCore: S(0x4a525b, 0.8, 0.5, { map: finTex() }), plastic: S(0x1c2025, 0.05, 0.6), hose: S(0x17191c, 0.05, 0.75),
      hoseHot: S(0x17191c, 0.05, 0.75), hoseCold: S(0x17191c, 0.05, 0.75), filter: S(0xe9d9a6, 0, 0.9, { map: pleatTex() }),
      lid: S(0x9fb7cf, 0.1, 0.1, Object.assign({ opacity: 0.18 }, T)),
      brgMain: S(0x3ecf8e, 0.6, 0.4, { emissive: 0x000000 }), brgRod: S(0x3ecf8e, 0.6, 0.4, { emissive: 0x000000 }),
      ghost: new THREE.MeshBasicMaterial({ color: 0x9fb7d4, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide }),
      ghostL: new THREE.LineBasicMaterial({ color: 0x7d9bbd, transparent: true, opacity: 0.12 }),
      edge: new THREE.LineBasicMaterial({ color: 0x7d9bbd, transparent: true, opacity: 0.28 }),
      flame: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      glow: new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff0b0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      spray: new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    };
    M.base = { castAlu: M.castAlu.color.clone(), castBlk: M.castBlk.color.clone(), pis: M.pis.color.clone(), liner: M.liner.color.clone(), cover: M.cover.color.clone(), pan: M.pan.color.clone() };
  }

  function init(canvas) {
    R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    R.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 0.95;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.localClippingEnabled = true;
    scene = new THREE.Scene();
    if (THREE.RoomEnvironment) scene.environment = new THREE.PMREMGenerator(R).fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    cam = new THREE.PerspectiveCamera(35, 1, 1, 4000);
    scene.add(new THREE.HemisphereLight(0xc6d8ff, 0x1c2026, 0.5));
    key = new THREE.DirectionalLight(0xfff1e0, 1.55); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(0x7fb2ff, 0.7); rim.position.set(-160, 80, -200);
    const fill = new THREE.DirectionalLight(0xffe2c4, 0.35); fill.position.set(-120, 40, 160);
    plight = new THREE.PointLight(0xffb060, 0, 80, 2);
    scene.add(key, key.target, rim, fill, plight);
    mats();
    M.ground = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.ShadowMaterial({ opacity: 0.38 }));
    M.ground.rotation.x = -Math.PI / 2; M.ground.receiveShadow = true;
    M.grid = new THREE.PolarGridHelper(500, 16, 14, 64, 0x2a3644, 0x19212a); M.grid.material.transparent = true; M.grid.material.opacity = 0.4;
    scene.add(M.ground, M.grid);
    let drag = null, moved = 0, t0 = 0;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; drag.pan = e.button === 2 || e.shiftKey; moved = 0; t0 = performance.now(); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; moved += Math.abs(dx) + Math.abs(dy);
      if (drag.pan) { // arrastar com botão direito / Shift: desliza a câmera (pan) na escala da distância
        const k = orb.r * 2 * Math.tan(cam.fov * DEG / 2) / Math.max(1, size[1]), rt = V(1, 0, 0).applyQuaternion(cam.quaternion), up = V(0, 1, 0).applyQuaternion(cam.quaternion);
        orb.t.addScaledVector(rt, -dx * k).addScaledVector(up, dy * k);
      } else { orb.yaw -= dx * 0.006; orb.pitch = clamp(orb.pitch + dy * 0.006, -0.35, 1.45); }
      const pan = drag.pan; drag = [e.clientX, e.clientY]; drag.pan = pan; tween.k = 1;
    });
    let hovT = 0, hovK = null;
    canvas.addEventListener('pointermove', e => {
      if (drag || !onHover || !root) return;
      const now = performance.now(); if (now - hovT < 90) return; hovT = now;
      const k = partAt(e); if (k !== hovK) { hovK = k; onHover(k, e.clientX, e.clientY); } else if (k) onHover(k, e.clientX, e.clientY, true);
    });
    canvas.addEventListener('pointerleave', () => { hovK = null; if (onHover) onHover(null); });
    canvas.addEventListener('pointerup', e => { if (drag && moved < 6 && performance.now() - t0 < 450) pickAt(e); drag = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); orb.r = clamp(orb.r * (e.deltaY > 0 ? 1.1 : 0.9), 6, 1500); tween.k = 1; }, { passive: false });
  }
  const hovRay = new THREE.Raycaster();
  function partAt(e) { // primeira peça visível sob o mouse que tem explicação
    const rc = R.domElement.getBoundingClientRect(), m = new THREE.Vector2((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1);
    hovRay.setFromCamera(m, cam);
    for (const h of hovRay.intersectObject(root, true)) {
      const o = h.object; if (!o.isMesh || o.isInstancedMesh || o.userData.pick || o.material === M.ghost || o.material.visible === false) continue;
      if (o.material.clippingPlanes && o.material.clippingPlanes.some(p => p.distanceToPoint(h.point) < 0)) continue;   // parte cortada (não aparece)
      let p = o, vis = true, k = null; while (p) { if (!p.visible) { vis = false; break; } if (!k && p.userData.part) k = p.userData.part; p = p.parent; }
      if (!vis) continue;
      return k;
    }
    return null;
  }
  function pickAt(e) {
    const rc = R.domElement.getBoundingClientRect(), m = new THREE.Vector2((e.clientX - rc.left) / rc.width * 2 - 1, -(e.clientY - rc.top) / rc.height * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, cam);
    const hit = ray.intersectObjects(pick.filter(p => p.parent && p.parent.visible), false)[0];
    if (onPick) onPick(hit ? hit.object.userData.pick : null);
  }
  function proxy(name, parent, box, tag) { // caixa invisível que recebe o clique
    const s = box.getSize(V()), m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.copy(box.getCenter(V())); m.userData.pick = name; if (tag) m.userData.tag = tag; parent.add(m); pick.push(m);
  }
  function viewOf(obj, k, yaw = 0.75, pitch = 0.3) {
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj), s = b.getSize(V());
    return { t: b.getCenter(V()), r: Math.max(s.x, s.y, s.z) * k, yaw, pitch, box: b, m: 1 };
  }
  function fitR(box, m = 1) { // distância para a caixa caber na tela (usa o campo de visão vertical e horizontal)
    const rs = box.getSize(V()).length() / 2, fv = cam.fov * DEG, fh = 2 * Math.atan(Math.tan(fv / 2) * cam.aspect);
    return rs / Math.sin(Math.min(fv, fh * (1 - panK)) / 2) * 0.82 * m;
  }
  // foco de um sistema: o resto do motor vira um "fantasma" translúcido (contexto sem atrapalhar)
  function ghost(keep) {
    for (const [o, mat, cs, vis] of ghosted) { o.material = mat; o.castShadow = cs; o.visible = vis; }
    ghosted = [];
    if (!keep) return;
    const kept = new Set(keep.filter(Boolean)), small = 0.7 * K.B;
    for (const ch of root.children) {
      if (kept.has(ch)) continue;
      ch.traverse(o => {
        if (o.userData.pick || o.isSprite || o.isPoints || !o.material) return;
        if (!(o.isMesh || o.isLineSegments || o.isLine)) return;
        ghosted.push([o, o.material, o.castShadow, o.visible]); o.castShadow = false;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.isMesh && o.geometry.boundingSphere.radius < small) o.visible = false;    // peças pequenas somem; só as carcaças ficam como silhueta
        else o.material = o.isMesh ? M.ghost : M.ghostL;
      });
    }
  }
  const tube = (pts, r, mat, seg = 48) => { const c = new THREE.CatmullRomCurve3(pts); const m = new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, 12, false), mat); m.castShadow = true; return { m, c }; };
  const pipe = (curve, r, mat, seg) => { const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg || Math.max(24, Math.round(curve.getLength() / (0.3 * K.B))), r, 14, false), mat); m.castShadow = true; return m; };
  const edges = (mesh) => { const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), M.edge); l.position.copy(mesh.position); l.rotation.copy(mesh.rotation); l.scale.copy(mesh.scale); return l; };
  const along = (mesh, p, dir) => { mesh.position.copy(p); mesh.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()); return mesh; };
  const ringGeo = (r, w) => { const gg = new THREE.TorusGeometry(r, w, 8, 28); gg.rotateX(Math.PI / 2); return gg; };    // eixo do anel = y (para usar com along)
  const ringAt = (par, cv, u, r, mat, w = 0.045 * K.B) => { const m = along(new THREE.Mesh(ringGeo(r, w), mat), cv.getPointAt(u), cv.getTangentAt(u)); par.add(m); return m; };
  function flange(par, cv, r) { // flange do coletor no cabeçote: placa com dois prisioneiros e porcas
    const B = K.B, p = cv.getPointAt(0.03), t = cv.getTangentAt(0.03), G = new THREE.Group(); along(G, p, t); par.add(G);
    G.add(new THREE.Mesh(new THREE.BoxGeometry(r * 4.2, 0.07 * B, r * 2.4), M.forged));
    for (const sx of [-1, 1]) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * B, 0.07 * B, 0.12 * B, 6), M.steel); n.position.set(sx * r * 1.6, 0.08 * B, 0); G.add(n); }
  }
  function coupler(par, cv, u, r) { // luva de silicone com duas abraçadeiras (tubos do turbo/intercooler)
    const B = K.B, L = cv.getLength(), du = 0.3 * B / L;
    par.add(tagP(along(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.14, r * 1.14, 0.75 * B, 22, 1, true), M.silicone), cv.getPointAt(u), cv.getTangentAt(u)), 'coupler'));
    for (const k of [-1, 1]) ringAt(par, cv, clamp(u + k * du, 0, 1), r * 1.2, M.steel, 0.035 * B);
  }
  const tagP = (o, k) => { o.userData.part = k; return o; };                  // peça com explicação ao passar o mouse (help.js: p_<k>)
  const clipMat = (base, plane) => { const m = base.clone(); m.clippingPlanes = [plane]; m.clipShadows = true; m.side = THREE.DoubleSide; return m; };
  function sweep(curve, rf, n, m, mat) { // tubo de raio variável ao longo da curva (cones da câmara de expansão)
    const F = curve.computeFrenetFrames(n, false), pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPointAt(u), N = F.normals[i], Bn = F.binormals[i], r = rf(u);
      for (let j = 0; j <= m; j++) { const a = j / m * TAU, c = Math.cos(a), s = Math.sin(a); pos.push(p.x + r * (c * N.x + s * Bn.x), p.y + r * (c * N.y + s * Bn.y), p.z + r * (c * N.z + s * Bn.z)); }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; return mesh;
  }
  function bent(pts, r) { // tubo dobrado de verdade: trechos retos + curvas de raio r nos cantos
    const path = new THREE.CurvePath(); let prev = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], d1 = b.clone().sub(a), d2 = c.clone().sub(b), l1 = d1.length(), l2 = d2.length();
      if (l1 < 1e-6 || l2 < 1e-6) continue;
      const rr = Math.min(r, l1 * 0.48, l2 * 0.48), p1 = b.clone().addScaledVector(d1.normalize(), -rr), p2 = b.clone().addScaledVector(d2.normalize(), rr);
      if (prev.distanceTo(p1) > 1e-3) path.add(new THREE.LineCurve3(prev.clone(), p1));
      path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2)); prev = p2;
    }
    path.add(new THREE.LineCurve3(prev.clone(), pts[pts.length - 1].clone()));
    return path;
  }
  function hull(pts) { // envoltória convexa 2D (cadeia monótona) — contorno da corrente de comando
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const rectShape = (x0, y0, x1, y1) => { const s = new THREE.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath(); return s; };
  const rectPath = (x0, y0, x1, y1) => { const s = new THREE.Path(); s.moveTo(x0, y0); s.lineTo(x0, y1); s.lineTo(x1, y1); s.lineTo(x1, y0); s.closePath(); return s; };
  function addLabel(set, t, p, h) { const s = textSprite(t, h || 0.3 * K.B); s.position.copy(p); s.visible = false; root.add(s); (labels[set] = labels[set] || []).push(s); return s; }

  // ---------- perfis ----------
  const v2 = pts => pts.map(([x, y]) => new THREE.Vector2(x, y));
  function pistonProfile(B) {
    return v2([[0, 0.03], [0.22, 0.035], [0.42, 0.02], [0.485, 0], [0.485, -0.06], [0.465, -0.065], [0.465, -0.085], [0.485, -0.09], [0.485, -0.115],
      [0.465, -0.12], [0.465, -0.14], [0.485, -0.145], [0.485, -0.45], [0.47, -0.55], [0.38, -0.55]].map(([x, y]) => [x * B, y * B]));
  }
  function valveProfile(d, len) { return v2([[0, 0], [0.5, 0], [0.5, 0.05], [0.32, 0.12], [0.12, 0.26], [0.08, 0.42], [0.08, len], [0, len]].map(([x, y]) => [x * d, y * d])); }
  function rodShape(B, L) {
    const s = new THREE.Shape(), rB = 0.3 * B, rS = 0.17 * B;
    s.moveTo(rB, 0); s.absarc(0, 0, rB, 0, Math.PI, true); s.lineTo(-rS * 0.8, L); s.absarc(0, L, rS, Math.PI, 0, true); s.lineTo(rB, 0);
    const h1 = new THREE.Path(); h1.absarc(0, 0, 0.17 * B, 0, 2 * Math.PI, true);
    const h2 = new THREE.Path(); h2.absarc(0, L, 0.09 * B, 0, 2 * Math.PI, true);
    s.holes.push(h1, h2);
    return s;
  }
  function webShape(a, B) { // braço com contrapeso
    const s = new THREE.Shape(), Rc = a + 0.35 * B, rb = 0.3 * B;
    s.moveTo(Rc * Math.cos(200 * DEG), Rc * Math.sin(200 * DEG));
    s.absarc(0, 0, Rc, 200 * DEG, 340 * DEG, false); s.lineTo(rb, a); s.absarc(0, a, rb, 0, Math.PI, false); s.closePath();
    return s;
  }
  function camShape(tab, o, c, rb, C, f = l => l) { // perfil polar do came a partir do levante simulado (f: relação do balancim / conjugado)
    const s = new THREE.Shape(), pk = (o + c) / 2;
    for (let i = 0; i <= 120; i++) {
      const psi = i / 120 * 360 - 180, th = (((pk - 180 - 2 * psi) % C) + C) % C, r = rb + f(tab[(th * 2) | 0] * U);
      const x = r * Math.cos(psi * DEG), y = r * Math.sin(psi * DEG);
      if (i) s.lineTo(x, y); else s.moveTo(x, y);
    }
    return s;
  }
  class Helix extends THREE.Curve {
    constructor(r, h, n) { super(); this.r = r; this.h = h; this.n = n; }
    getPoint(t, out = new THREE.Vector3()) { const a = t * this.n * 2 * Math.PI; return out.set(this.r * Math.cos(a), t * this.h, this.r * Math.sin(a)); }
  }
  const camDir = V(0, 0.35, 1).normalize();                                      // lado de onde a câmera costuma olhar: é dele que se tira a metade

  // ---------- motor de pistões (4 e 2 tempos) ----------
  function buildPiston() {
    const E = g.E, B = g.B * U, a = g.a * U, L = g.L * U, ch = 0.45 * B, hc = g.vc / g.Ap * U, roof = a + L + ch + hc;
    const radial = E.fam === 'radial', prop = !!g.veh.prop;
    K = { B, a, L, ch, roof, hl: 2 * a + 1.25 * B + hc, radial, Rcc: a + 0.6 * B };
    M.sect.map.repeat.set(1 / (0.25 * B), 1 / (0.25 * B));
    const G0 = { piston: new THREE.LatheGeometry(pistonProfile(B), 40), rod: P3.extrudeX(rodShape(B, L), 0.12 * B, 0.01 * B), web: P3.extrudeX(webShape(a, B), 0.13 * B, 0.01 * B) };
    if (!g.two) {
      const di = g.ivd * U, de = g.evd * U;
      Object.assign(G0, { vIn: new THREE.LatheGeometry(valveProfile(di, 1.4), 24), vEx: new THREE.LatheGeometry(valveProfile(de, 1.4 * di / de), 24),
        spring: new THREE.TubeGeometry(new Helix(0.3 * di, 0.62 * di, 6), 140, 0.022 * B, 6),
        camIn: [], camEx: [] });
      const Lm = Math.max(...g.Li, ...g.Le) * U, w = E.desmo ? 0.1 * B : 0.15 * B;
      for (const [k, tab, o, c] of [['camIn', g.Li, g.ivo, g.ivc], ['camEx', g.Le, g.evo, g.evc]]) {
        G0[k].push(P3.extrudeX(camShape(tab, o, c, 0.16 * B, g.cyc, E.desmo ? l => l * 0.3 / 0.62 : l => l), w));          // came de abertura
        if (E.desmo) G0[k].push(P3.extrudeX(camShape(tab, o, c, 0.16 * B, g.cyc, l => Lm - l), w));                     // came de fechamento (conjugado)
      }
    }
    crank = tagP(new THREE.Group(), 'crank'); root.add(crank);
    const xs = g.lay.map(l => l.x * B), xmin = Math.min(...xs) - 0.8 * B, xmax = Math.max(...xs) + 0.8 * B;
    K.xr = xmin - 0.7 * B;                                                         // radial: difusor do compressor atrás dos cilindros
    const xe = prop ? 1.3 * B : 0, main = P3.cylX(0.19 * B, xmax - xmin + 0.4 * B + xe, M.forged); main.position.x = (xmin + xmax + xe) / 2; main.castShadow = true; crank.add(main);
    const fly = P3.cylX(1.25 * B, 0.22 * B, M.dark, 48); fly.position.x = xmax + 0.2 * B; fly.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25 * B, 0.06 * B, 8, 64), M.steel); ring.rotation.y = Math.PI / 2; ring.position.x = xmax + 0.2 * B;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.26 * B, 0.9 * B, 0.14 * B), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x401800 })); mark.position.set(xmax + 0.2 * B, 0.7 * B, 0);
    if (!prop) crank.add(fly, ring, mark);                                     // avião: a hélice faz o papel de volante
    const throws = [];
    for (const l of g.lay) {
      const phi = ((l.bank - l.off) % 360 + 360) % 360, x = l.x * B, t = throws.find(t => Math.abs(t.phi - phi) < 1 && Math.abs(t.xs[0] - x) < 0.6 * B);
      if (t) t.xs.push(x); else throws.push({ phi, xs: [x] });
    }
    bearings = [];
    for (const t of throws) {
      const lo = Math.min(...t.xs), hi = Math.max(...t.xs), half = (hi - lo) / 2 + 0.22 * B, tg = new THREE.Group();
      t.lo = lo; t.hi = hi;
      tg.position.x = (lo + hi) / 2; tg.rotation.x = t.phi * DEG; crank.add(tg);
      const pin = P3.cylX(0.16 * B, 2 * half, M.steel); pin.position.y = a; tg.add(pin);
      for (const s of [-1, 1]) { const w = new THREE.Mesh(G0.web, M.forged); w.position.x = s * (half + 0.065 * B); w.castShadow = true; tg.add(w); }
      for (const x of t.xs) { const b = tagP(new THREE.Mesh(new THREE.TorusGeometry(0.18 * B, 0.035 * B, 8, 28), M.brgRod), 'brgRod'); b.rotation.y = Math.PI / 2; b.position.set(x - tg.position.x, a, 0); tg.add(b); }  // bronzina de biela
    }
    cyls = g.lay.map((l, i) => buildCylinder(l, i, G0));
    // bancadas: bloco, cabeçote e tampa em alumínio fundido, cortados no plano dos cilindros (lado da câmera)
    const byBank = {}, spread = {};
    g.lay.forEach(l => { const k = l.blk ?? l.bank; (byBank[k] = byBank[k] || []).push(l.x * B); spread[k] = Math.max(spread[k] || 0, Math.abs(Math.sin((l.bank - k) * DEG))); });
    const blockBot = radial ? K.Rcc : roof - K.hl, liquid = coolKey === 'liquid' || coolKey === 'none', finned = coolKey === 'air' || coolKey === 'oilair';
    banks = [];
    for (const [bk, bx] of Object.entries(byBank)) {
      const G = new THREE.Group(); G.rotation.x = +bk * DEG; root.add(G);
      const nW = V(0, 0, 1).applyAxisAngle(V(1, 0, 0), +bk * DEG), s = nW.dot(camDir) >= 0 ? 1 : -1; nW.multiplyScalar(s);
      const plane = new THREE.Plane(nW.clone().negate(), 0);
      const mB = clipMat(M.castBlk, plane), mH = clipMat(M.castAlu, plane), mC = clipMat(M.cover, plane), mS = M.sect.clone(), mJ = M.jacket.clone();
      bx.sort((p, q) => p - q);
      const x0 = bx[0] - 0.62 * B, x1 = bx[bx.length - 1] + 0.62 * B, len = x1 - x0, xc = (x0 + x1) / 2, zc = -s * 0.004 * B, wv = 2 * roof * spread[bk];   // wv: largura extra do bloco VR (duas fileiras)
      const box = (h, d, y, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, d + wv), mat); m.position.set(xc, y, 0); m.castShadow = true; m.receiveShadow = true; G.add(m, edges(m)); return m; };
      const cap = (shape, mat, dz = 0) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat); m.position.z = zc - s * dz; G.add(m); return m; };
      const hH = g.two ? 0.42 * B : 0.62 * B;
      if (radial) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * B, 0.62 * B, roof - blockBot, 36), mB); br.position.y = (roof + blockBot) / 2; br.castShadow = true; G.add(br); }  // cilindro avulso do radial
      else box(K.hl, 1.25 * B, roof - K.hl / 2, mB);
      box(hH, g.two ? 1.3 * B : 1.65 * B, roof + hH / 2, mH);
      if (!g.two) box(0.66 * B, 1.45 * B, roof + 0.95 * B, mC);
      // face de corte do bloco: paredes entre os cilindros (os cilindros ficam vazados) + galerias de água
      const walls = [[x0, bx[0] - B / 2]]; for (let i = 0; i < bx.length - 1; i++) walls.push([bx[i] + B / 2, bx[i + 1] - B / 2]); walls.push([bx[bx.length - 1] + B / 2, x1]);
      const jackets = [];
      for (const [wa, wb] of walls) {
        if (wb - wa < 0.01 * B) continue;
        cap(rectShape(wa, blockBot, wb, roof), mS);
        const w = wb - wa - 0.16 * B;
        if (liquid && w > 0.05 * B) jackets.push(cap(rectShape(wa + 0.08 * B, roof - 0.72 * K.hl, wb - 0.08 * B, roof - 0.08 * B), mJ, 0.002 * B));
      }
      // face de corte do cabeçote: câmaras (pent-roof) recortadas na base + galeria de água acima de cada câmara
      const hs = new THREE.Shape(); hs.moveTo(x0, roof);
      if (!wv) for (const xi of bx) { hs.lineTo(xi - B / 2, roof); hs.lineTo(xi - 0.25 * B, roof + 0.14 * B); hs.lineTo(xi + 0.25 * B, roof + 0.14 * B); hs.lineTo(xi + B / 2, roof); }
      hs.lineTo(x1, roof); hs.lineTo(x1, roof + hH); hs.lineTo(x0, roof + hH); hs.closePath();
      cap(hs, mS);
      if (liquid) for (const xi of bx) jackets.push(cap(rectShape(xi - 0.32 * B, roof + 0.24 * B, xi + 0.32 * B, roof + Math.min(0.48, hH / B - 0.08) * B), mJ, 0.002 * B));
      // aletas (motor a ar): placas finas em volta do cilindro e do cabeçote
      const fg = new THREE.Group(); G.add(fg); finGs.push(fg);
      if (finned) for (let y = blockBot + 0.25 * B; y < roof + hH; y += 0.13 * B) {
        const f = radial && y < roof ? new THREE.Mesh(new THREE.CylinderGeometry(0.98 * B, 0.98 * B, 0.03 * B, 36), mH) : new THREE.Mesh(new THREE.BoxGeometry(len + 0.35 * B, 0.03 * B, (y > roof ? 1.65 : 1.25) * B + 0.9 * B + wv), mH);
        f.position.set(xc, y, 0); f.castShadow = true; fg.add(f);
      }
      G.children.forEach(o => { if (o.isMesh && !o.userData.part) tagP(o, o.material === mB ? (radial ? 'barrel' : 'block') : o.material === mH ? 'head' : o.material === mC ? 'cover' : o.material === mJ ? 'jacket' : 'section'); });
      tagP(fg, 'fins');
      banks.push({ G, plane, s, mB, mH, mC, mS, mJ, x0, x1, bx });
    }
    // cárter (cortado) com o óleo dentro; cárter de óleo
    const boxer = !radial && g.lay.some(l => Math.abs(l.bank) > 80), vee = !radial && !boxer && g.lay.some(l => l.bank !== 0);
    const y0 = radial ? -K.Rcc : -(a + 0.55 * B), y1 = radial ? K.Rcc : boxer ? a + 0.55 * B : Math.max(0.3 * B, Math.min(blockBot, 0.8 * B)), zh = radial ? K.Rcc : g.two ? 0.7 * B : boxer ? Math.max(0.65 * B, blockBot) : vee ? 1.0 * B : 0.72 * B;
    const nC = boxer ? V(0, 1, 0) : V(0, 0, 1), planeC = new THREE.Plane(nC.clone().negate(), 0), mCC = clipMat(M.castBlk, planeC), mP = clipMat(M.pan, planeC), mO = clipMat(M.oil, planeC);
    const cc = tagP(radial ? P3.cylX(K.Rcc, xmax - xmin, mCC, 64) : new THREE.Mesh(new THREE.BoxGeometry(xmax - xmin, y1 - y0, 2 * zh), mCC), 'crankcase'); cc.position.set((xmin + xmax) / 2, (y0 + y1) / 2, 0); cc.castShadow = true; root.add(cc, edges(cc));
    const panH = radial ? 0.3 * B : 0.75 * B;
    if (!radial) {
      const pan = tagP(new THREE.Mesh(new THREE.BoxGeometry(xmax - xmin - 0.2 * B, panH, 2 * zh * 0.85), mP), 'pan'); pan.position.set((xmin + xmax) / 2, y0 - panH / 2, 0); pan.castShadow = true; root.add(pan);
      oilBox = tagP(new THREE.Mesh(new THREE.BoxGeometry(xmax - xmin - 0.35 * B, 1, 2 * zh * 0.8), mO), 'oilsump'); oilBox.position.set((xmin + xmax) / 2, y0 - panH, 0); root.add(oilBox);
      oilBox.userData = { y: y0 - panH + 0.04 * B, h: panH * 0.85 };
    } else oilBox = null;                                                        // radial: cárter seco, óleo num tanque à parte
    { // face de corte do cárter: paredes (mancais) entre os vãos das manivelas
      const v0 = boxer ? -zh : y0, v1 = boxer ? zh : y1, sh = rectShape(xmin, v0, xmax, v1), hr = Math.min(a + 0.42 * B, v1 - 0.06 * B), holes = [];
      for (const t of throws.slice().sort((p, q) => p.lo - q.lo)) { const h0 = t.lo - 0.42 * B, h1 = t.hi + 0.42 * B, last = holes[holes.length - 1]; if (last && h0 < last[1] + 0.12 * B) last[1] = Math.max(last[1], h1); else holes.push([h0, h1]); }
      for (const [h0, h1] of holes) sh.holes.push(rectPath(Math.max(xmin + 0.12 * B, h0), -hr, Math.min(xmax - 0.12 * B, h1), hr));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.sect); if (boxer) { m.rotation.x = Math.PI / 2; m.position.y = -0.004 * B; } else m.position.z = -0.004 * B; root.add(m);
      const mainX = [xmin + 0.25 * B]; holes.forEach(([, h1], i) => { if (i < holes.length - 1) mainX.push((h1 + holes[i + 1][0]) / 2); }); mainX.push(xmax - 0.25 * B);
      K.mainX = mainX;
      for (const x of mainX) { const b = tagP(new THREE.Mesh(new THREE.TorusGeometry(0.22 * B, 0.04 * B, 8, 28), M.brgMain), 'brgMain'); b.rotation.y = Math.PI / 2; b.position.x = x; root.add(b); bearings.push(b); }
    }
    K.y0 = y0; K.panBot = y0 - panH; K.zh = zh; K.vee = vee; K.boxer = boxer; K.blockBot = blockBot; K.xmin = xmin; K.xmax = xmax;
    K.yL = y0 - 0.45 * B; K.zL = Math.max(2.3 * B, zh + 1.3 * B);
    // corrente de comando: engrenagem no virabrequim (18 dentes) e nos comandos (36 dentes = meia rotação)
    if (!g.two && !E.ohv) {
      const xc = Math.min(...xs) - 0.62 * B - 0.14 * B, sp = [[0, 0, 0.21 * B]];
      const ck = new THREE.Mesh(P3.extrudeX(P3.gearShape(18, 0.42 * B / 18, 0.1 * B), 0.08 * B), M.steel); ck.position.x = xc; crank.add(ck);
      const firstOf = {}; cyls.forEach((c, i) => { const l = g.lay[i], k = l.blk ?? l.bank; if (!firstOf[k] || l.x < firstOf[k].l.x) firstOf[k] = { c, l }; });
      root.updateMatrixWorld(true);
      for (const { c, l } of Object.values(firstOf)) for (const cg of [c.ci, c.ce]) {
        const s = new THREE.Mesh(P3.extrudeX(P3.gearShape(36, 0.74 * B / 36, 0.08 * B), 0.08 * B), M.steel); s.position.x = xc - l.x * B; cg.add(s);
        const w = cg.localToWorld(V(xc - l.x * B, 0, 0)); sp.push([w.y, w.z, 0.39 * B]);
      }
      const pts = []; for (const [y, z, r] of sp) for (let k = 0; k < 28; k++) pts.push([y + (r + 0.03 * B) * Math.cos(k / 28 * TAU), z + (r + 0.03 * B) * Math.sin(k / 28 * TAU)]);
      const hl = hull(pts).map(([y, z]) => V(xc, y, z));
      root.add(tagP(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hl, true), 160, 0.035 * B, 6, true), M.chain), 'chain'));
      K.chainX = xc;
    }
    root.updateMatrixWorld(true);
    if (radial) { // difusor: o compressor joga a mistura num anel que alimenta todos os tubos
      const dif = P3.cylX(K.Rcc + 0.5 * B, 0.9 * B, M.glass, 48); dif.position.x = K.xr - 0.45 * B; root.add(dif, edges(dif));
      curves.intakeIn = V(K.xr - 1.2 * B, 0, 0); K.plenum = dif.position.clone();
      addLabel('intake', 'DIFUSOR DO COMPRESSOR', dif.position.clone().add(V(0, K.Rcc + 1.0 * B, 0)));
    }
    // admissão: plenum com borboleta única (carros) ou borboletas individuais (motos)
    if (g.plen) {
      const b = new THREE.Box3(); cyls.forEach(c => b.expandByPoint(c.bell));
      b.expandByScalar(0.45 * B);
      const s = b.getSize(V()), pl = tagP(new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), M.glass), 'plenum'); pl.position.copy(b.getCenter(V())); root.add(pl, edges(pl));
      const tb = new THREE.Group(); tb.position.set(b.min.x - 0.45 * B, pl.position.y, pl.position.z); root.add(tb);
      tb.add(P3.cylX(0.42 * B, 0.7 * B, M.alu, 28));
      plThr = P3.cylX(0.38 * B, 0.03 * B, M.brass, 28); tb.add(plThr);
      curves.intakeIn = tb.position.clone(); K.plenum = pl.position.clone();
    }
    // coletores: os headers de cada bancada descem e entram num cone (N-em-1) com flange na saída do cabeçote
    const groups = [], rH = 0.24 * E.hdr / 0.5 * B;
    hdrG = tagP(new THREE.Group(), 'header'); root.add(hdrG);
    cyls.forEach(c => { (groups[c.grp] = groups[c.grp] || []).push(c); });
    if (radial || prop && E.fam === 'v') { // avião: radial → anel coletor atrás dos cilindros; V12 → tubos curtos individuais (ejetores)
      const Rr = roof * 0.82, xr = xmin - 0.6 * B;
      cyls.forEach(c => {
        const h0 = c.hp[0], h1 = c.hp[1], out = h1.clone().sub(h0).normalize(), f = Math.atan2(h1.z, h1.y);
        const pts = radial ? [h0, h1, V(h1.x - 0.5 * B, h1.y * 0.94, h1.z * 0.94), V(xr, Rr * Math.cos(f), Rr * Math.sin(f))]
          : [h0, h1, h1.clone().addScaledVector(out, 0.5 * B), h1.clone().addScaledVector(out, 0.8 * B).add(V(-1.0 * B, 0, 0))];
        const t = tube(pts, rH, M.hdrTint, 48); hdrG.add(t.m); c.hdrCurve = t.c; flange(hdrG, t.c, rH);
        if (!radial) { const tip = along(new THREE.Mesh(new THREE.CylinderGeometry(rH * 1.5, rH, 0.4 * B, 20, 1, true), M.header), t.c.getPointAt(1), t.c.getTangentAt(1)); tip.scale.z = 0.5; hdrG.add(tip); }  // boca achatada: o jato dá empuxo
      });
      curves.exhaust = cyls[0].hdrCurve;
      if (!radial) return { cols: [], xmin, xmax, B, top: roof + 2 * B };
      const ring = tagP(new THREE.Mesh(new THREE.TorusGeometry(Rr, rH * 1.6, 12, 96), M.header), 'ring'); ring.rotation.y = Math.PI / 2; ring.position.x = xr; ring.castShadow = true; hdrG.add(ring);
      K.exLab = addLabel('exhaust', 'ANEL COLETOR', V(xr, Rr + 0.8 * B, 0));
      K.yL = -Rr - 0.9 * B;
      return { cols: [V(xr, -Rr, 0)], xmin, xmax, B, top: roof + 2 * B };
    }
    const cols = groups.filter(Boolean).map(gr => {
      const m = gr.length, p = V(); gr.forEach(c => p.add(c.hp[3])); p.divideScalar(m);
      p.y = Math.min(...gr.map(c => c.hp[3].y)) - 1.5 * B;
      if (g.two && !g.fi) return p;                                              // 2 tempos: cada cilindro tem sua câmara de expansão
      const q = p.clone().add(V(0, 1.1 * B, 0)), rIn = rH * (m > 1 ? 1.15 + 0.62 * Math.sqrt(m) : 1.15), rOut = rH * 1.3;
      gr.forEach((c, i) => {
        const ang = i / m * TAU, off = m > 1 ? V(Math.cos(ang) * (rIn - rH) * 0.9, 0, Math.sin(ang) * (rIn - rH) * 0.9) : V();
        const end = q.clone().add(off), t = tube([...c.hp, end.clone().add(V(0, 0.7 * B, 0)), end], rH, M.hdrTint, 72); hdrG.add(t.m); c.hdrCurve = t.c; flange(hdrG, t.c, rH);
      });
      const prof = [new THREE.Vector2(rIn, 0.25 * B), new THREE.Vector2(rIn, 0), new THREE.Vector2(rOut, -(q.y - p.y))];
      const cone = tagP(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), M.header), 'collector'); cone.position.copy(q); cone.castShadow = true; hdrG.add(cone);  // cone de junção (merge)
      return p;
    });
    curves.exhaust = cyls[0].hdrCurve;
    return { cols, xmin, xmax, B, top: roof + 2 * B };
  }

  function buildCylinder(l, i, G0) {
    const { B, a, L, ch, roof, hl } = K, E = g.E, sg = l.bank < 0 ? -1 : 1, zi = -sg * 0.23 * B, ze = sg * 0.23 * B;
    const G = new THREE.Group(); G.position.x = l.x * B; G.rotation.x = l.bank * DEG; root.add(G);
    const c = { G, i, off: l.off, sg, grp: l.grp, vi: [], ve: [] };
    c.rod = new THREE.Mesh(G0.rod, M.alu); c.pis = new THREE.Mesh(G0.piston, M.pis); c.rod.castShadow = c.pis.castShadow = true;
    const wp = P3.cylX(0.1 * B, 0.8 * B, M.steel, 12); wp.position.y = -ch + 0.03 * B; c.pis.add(wp);
    c.gasMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.3, metalness: 0 });
    c.gas = new THREE.Mesh(new THREE.CylinderGeometry(0.47 * B, 0.47 * B, 1, 32), c.gasMat);
    c.flame = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M.flame.clone()); c.flame.position.set(0, roof - 0.08 * B, 0);
    c.spark = new THREE.Sprite(M.glow); c.spark.scale.set(0.6 * B, 0.6 * B, 1); c.spark.position.set(0, roof - 0.05 * B, 0);
    tagP(c.rod, 'rod'); tagP(c.pis, 'piston');
    G.add(c.rod, c.pis, c.gas, c.flame, c.spark);
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * B, 0.5 * B, hl, 40, 1, true), M.liner);
    liner.position.y = roof - hl / 2; G.add(tagP(liner, 'liner'));
    for (const y of [roof, roof - hl]) G.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 48 }, (_, k) => V(0.5 * B * Math.cos(k / 48 * 6.283), y, 0.5 * B * Math.sin(k / 48 * 6.283)))), M.edge));
    // vela (motores de avião: duas por cilindro, magnetos independentes — duas frentes de chama)
    c.sparks = [c.spark];
    (E.plugs === 2 ? [-0.34 * B, 0.34 * B] : [0]).forEach((px, k) => {
      const plug = tagP(new THREE.Group(), E.plugs === 2 ? 'plug2' : 'plug'); plug.position.set(px, roof, 0); plug.rotation.z = -px / B * 0.9; G.add(plug);
      const part = (r0, r1, h, y, mat, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.y = y; plug.add(m); };
      part(0.07 * B, 0.07 * B, 0.25 * B, 0.1 * B, M.steel, 12); part(0.11 * B, 0.11 * B, 0.15 * B, 0.3 * B, M.steel, 6);
      part(0.06 * B, 0.075 * B, 0.9 * B, 0.8 * B, M.ceramic); part(0.035 * B, 0.035 * B, 0.12 * B, 1.3 * B, M.copper, 8);
      if (px) { const sk = k ? c.spark.clone() : c.spark; sk.position.set(px * 0.8, roof - 0.05 * B, 0); if (k) { G.add(sk); c.sparks.push(sk); } }
    });
    // jato de óleo sob o pistão
    const jet = tagP(new THREE.Mesh(new THREE.CylinderGeometry(0.03 * B, 0.05 * B, 0.25 * B, 8), M.brass), 'oiljet'); jet.position.set(0, roof - hl - 0.05 * B, -sg * 0.32 * B); jet.rotation.x = sg * 0.35; G.add(jet);
    c.jet = V(0, roof - hl, -sg * 0.3 * B);
    if (g.two) return twoStroke(c, G, l, i);
    const di = g.ivd * U, ys = 1.4 * di, vt = E.desmo ? 'desmo' : E.pneumatic ? 'pneu' : E.ohv ? 'ohv' : 'dohc';
    // válvulas inclinadas (pent-roof). Acionamento conforme o motor:
    //  dohc  — came direto sobre o tucho (copo), mola helicoidal fecha;
    //  pneu  — idem, mas a "mola" é um cilindro com nitrogênio sob pressão (F1);
    //  desmo — sem mola: balancim de abertura sob o came e garfo de fechamento puxado por um segundo came (conjugado);
    //  ohv   — comando no bloco: tucho → vareta → balancim no cabeçote → válvula (motores de avião).
    const xv = E.nv === 2 ? [-0.21 * B, 0.21 * B] : [0];
    const lever = (par, P, ends, w, mat) => { // balancim: braços do pivô até cada ponta (no referencial da válvula)
      const L = new THREE.Group(); L.position.set(P[0], P[1], P[2]); par.add(L);
      L.add(P3.cylX(0.045 * B, w + 0.06 * B, M.forged, 10));
      for (const [y, z] of ends) { const dy = y - P[1], dz = z - P[2], l = Math.hypot(dy, dz), arm = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06 * B, l), mat); arm.position.set(0, dy / 2, dz / 2); arm.rotation.x = Math.atan2(-dy, dz); arm.castShadow = true; L.add(arm); }
      return L;
    };
    const mkValve = (x, z, geo, mat, tilt, o) => { // o: lado de fora (para onde vão comando e balancins)
      const v = new THREE.Group(); v.position.set(x, roof, z); v.rotation.x = tilt; G.add(v);
      const body = tagP(new THREE.Mesh(geo, mat), geo === G0.vIn ? 'vIn' : 'vEx'); body.castShadow = true; v.add(body);
      const r = { body, d: di, o };
      if (vt === 'dohc' || vt === 'pneu') { const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * di, 0.3 * di, 0.32 * di, 20), M.forged); bk.position.y = ys - 0.16 * di; body.add(bk); }  // tucho de copo
      if (vt === 'dohc' || vt === 'ohv') { r.sp = new THREE.Mesh(G0.spring, M.steel); r.sp.position.y = 0.55 * di; v.add(r.sp); }
      if (vt === 'pneu') { // câmara de N₂ fixa + pistão preso à haste
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.36 * di, 0.36 * di, 0.62 * di, 24, 1, true), M.headCut); can.position.y = 0.86 * di; v.add(can);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.37 * di, 0.37 * di, 0.04 * di, 24), M.forged); lid.position.y = 0.55 * di; v.add(lid);
        const pk = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * di, 0.34 * di, 0.08 * di, 24), M.copper); pk.position.y = 1.12 * di; body.add(pk);
        r.n2 = new THREE.Mesh(new THREE.CylinderGeometry(0.33 * di, 0.33 * di, 1, 20), new THREE.MeshBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.35, depthWrite: false })); v.add(r.n2);
      }
      if (vt === 'desmo') {
        const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * di, 0.24 * di, 0.06 * B, 16), M.steel); ck.position.y = 0.95 * di; body.add(ck);  // colar bipartido na haste
        const zc = o * 0.32 * B, F = [0.95 * di - 0.05 * B, 0], Cc = [ys + 0.25 * B - 0.16 * B - K.Lmax, zc], P2 = [0.04 * B + (F[0] + Cc[0]) / 2, zc / 2];
        r.op = lever(v, [0, ys + 0.06 * B, o * 0.62 * B], [[ys + 0.03 * B, 0]], 0.12 * B, M.steel); r.opZ = -o * 0.62 * B;   // balancim de abertura (sob o came)
        r.cl = lever(v, [0.07 * B, P2[0], P2[1]], [F, Cc], 0.2 * B, M.copper); r.clZ = F[1] - P2[1];                             // garfo de fechamento (vai até o came conjugado ao lado)
      }
      if (vt === 'ohv') { // balancim no cabeçote; a vareta desce até o tucho no bloco
        r.op = lever(v, [0, ys + 0.14 * B, o * 0.35 * B], [[ys + 0.03 * B, 0], [ys + 0.03 * B, o * 0.78 * B]], 0.12 * B, M.forged); r.opZ = -o * 0.35 * B;
        G.updateMatrixWorld(true); v.updateMatrixWorld(true);
        const top = G.worldToLocal(v.localToWorld(V(0, ys, o * 0.78 * B))), bot = V(top.x, roof - K.hl + 0.2 * B, top.z + o * 0.12 * B), len = top.distanceTo(bot);
        const pr = along(new THREE.Mesh(new THREE.CylinderGeometry(0.035 * B, 0.035 * B, len, 8), M.steel), bot.clone().lerp(top, 0.5), top.clone().sub(bot)); G.add(pr);
        G.add(along(new THREE.Mesh(new THREE.CylinderGeometry(0.075 * B, 0.075 * B, len * 0.7, 12, 1, true), M.headCut), bot.clone().lerp(top, 0.45), top.clone().sub(bot)));  // tubo da vareta
        const tp = along(new THREE.Mesh(new THREE.CylinderGeometry(0.08 * B, 0.08 * B, 0.2 * B, 12), M.forged), bot, top.clone().sub(bot)); G.add(tp);
        r.pr = [pr, tp]; r.prDir = top.clone().sub(bot).normalize(); r.pr0 = [pr.position.clone(), tp.position.clone()]; r.prK = 0.43 / 0.35;
      }
      if (r.sp) tagP(r.sp, 'spring'); if (r.n2) tagP(r.n2, 'pneu'); v.children.forEach(o => { if (o.isMesh && o.material === M.headCut) tagP(o, 'pneu'); });
      if (r.op) tagP(r.op, vt === 'desmo' ? 'desmoOpen' : 'rocker'); if (r.cl) tagP(r.cl, 'desmoClose'); if (r.pr) r.pr.forEach(m => tagP(m, 'pushrod'));
      r.set = li => {
        body.position.y = -li;
        if (r.sp) r.sp.scale.y = 1 - li / (0.9 * di);
        if (r.n2 && r.n2.material !== M.ghost) { const h = 0.56 * di - li; r.n2.scale.y = Math.max(0.01, h); r.n2.position.y = 0.58 * di + h / 2 + 0.02 * di; r.n2.material.opacity = 0.25 + 0.5 * li / (0.35 * di); }  // gás comprimido mais "denso"
        if (r.op) r.op.rotation.x = li / r.opZ;
        if (r.cl) r.cl.rotation.x = li / r.clZ;
        if (r.pr) r.pr.forEach((m, k) => m.position.copy(r.pr0[k]).addScaledVector(r.prDir, li * r.prK));
      };
      return r;
    };
    K.Lmax = Math.max(...g.Li, ...g.Le) * U;
    xv.forEach(x => { c.vi.push(mkValve(x, zi, G0.vIn, M.brass, -sg * 0.2, -sg)); c.ve.push(mkValve(x, ze, G0.vEx, M.exv, sg * 0.2, sg)); });
    const camG = (geos, z, t, o) => { // eixo de comando: no desmo fica de lado (sobre o balancim), com o came de fechamento ao lado
      const zc = vt === 'desmo' ? o * 0.32 * B : 0, h = vt === 'desmo' ? ys + 0.25 * B : ys + 0.17 * B, grp = new THREE.Group();
      grp.position.set(0, roof + h * Math.cos(t) - zc * Math.sin(t), z + h * Math.sin(t) + zc * Math.cos(t)); G.add(grp);
      xv.forEach(x => geos.forEach((geo, k) => { const lobe = new THREE.Mesh(geo, k ? M.copper : M.steel); lobe.position.x = x + k * 0.14 * B; lobe.castShadow = true; grp.add(lobe); }));
      grp.add(P3.cylX(0.06 * B, 1.15 * B, M.forged, 12));
      return tagP(grp, vt === 'desmo' ? 'camDesmo' : 'cam');
    };
    if (vt !== 'ohv') { c.ci = camG(G0.camIn, zi, -sg * 0.2, -sg); c.ce = camG(G0.camEx, ze, sg * 0.2, sg); }
    // admissão: pórtico + duto (+ borboleta individual), bico injetor e jato
    const rr = 0.5 * E.tb * B, runPts = K.radial ? [V(0, roof + 0.02 * B, zi), V(0, roof + 0.35 * B, -sg * 0.45 * B), V(-0.7 * B, roof - 0.15 * B, -sg * 0.75 * B), V(K.xr - l.x * B, K.Rcc + 0.35 * B, -sg * 0.2 * B)]  // radial: tubo vindo do difusor traseiro
      : [V(0, roof + 0.02 * B, zi), V(0, roof + 0.3 * B, -sg * 0.5 * B), V(0, roof + 1.0 * B, -sg * 1.15 * B), V(0, roof + (g.plen ? 2.3 : 1.85) * B, -sg * (g.plen ? 2.3 : 1.85) * B)];
    const run = tube(runPts, rr, M.glass, 40); run.m.castShadow = false; G.add(tagP(run.m, 'runner'));
    G.add(along(new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.5, rr * 1.5, 0.07 * B, 20), M.alu), run.c.getPointAt(0.3), run.c.getTangentAt(0.3)));  // flange do coletor de admissão
    c.runCurve = run.c;
    if (!g.plen && !K.radial) {
      const tg = new THREE.Group(); tg.position.copy(run.c.getPointAt(0.72)); tg.quaternion.setFromUnitVectors(V(0, 1, 0), run.c.getTangentAt(0.72)); G.add(tg);
      c.thr = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.95, rr * 0.95, 0.03 * B, 24), M.brass); tg.add(tagP(c.thr, 'throttle'));
      tg.add(new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.15, rr * 1.15, 0.5 * B, 24, 1, true), M.alu));
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.6, rr * 1.05, 0.35 * B, 24, 1, true), M.alu); bell.position.copy(runPts[3]); bell.quaternion.setFromUnitVectors(V(0, 1, 0), run.c.getTangentAt(1)); G.add(bell); // corneta
    }
    const pI = run.c.getPointAt(0.4).add(V(0, 0.42 * B, -sg * 0.18 * B)), tip = run.c.getPointAt(0.42);
    const inj = tagP(new THREE.Mesh(new THREE.CylinderGeometry(0.06 * B, 0.08 * B, 0.55 * B, 12), M.dark), 'injector'); inj.position.copy(pI).add(V(0, 0.2 * B, 0)); G.add(inj);
    const dir = new THREE.Vector3().subVectors(run.c.getPointAt(0.06), tip), len = dir.length();
    c.spray = new THREE.Mesh(new THREE.ConeGeometry(0.18 * B, len, 16, 1, true), M.spray); c.spray.position.copy(tip).addScaledVector(dir, 0.5);
    c.spray.quaternion.setFromUnitVectors(V(0, -1, 0), dir.normalize()); G.add(c.spray);
    // escape: início do header (no referencial do cilindro) → mundo
    G.updateMatrixWorld(true);
    c.hp = [V(0, roof + 0.02 * B, ze), V(0, roof - 0.12 * B, sg * 0.62 * B), V(0, roof - 0.7 * B, sg * 1.55 * B), V(0, roof - 1.9 * B, sg * 1.75 * B)].map(p => G.localToWorld(p));
    c.bell = G.localToWorld(runPts[3].clone());
    c.runWorld = run.c.getPoints(24).map(p => G.localToWorld(p.clone()));
    if (i === 0) { // áreas clicáveis (cilindro 1) e rótulos do foco da câmara
      proxy('chamber', G, new THREE.Box3(V(-0.6 * B, roof - 1.2 * B, -0.6 * B), V(0.6 * B, roof + 0.7 * B, 0.6 * B)));
      G.updateMatrixWorld(true);
      const W = o => o.getWorldPosition(V()), L = (t, p) => addLabel('chamber', t, p, 0.22 * B), v0 = c.vi[0], e0 = c.ve[0];
      L('VÁLVULA DE ADMISSÃO', G.localToWorld(V(0, roof + 0.25 * B, zi - sg * 0.75 * B))); L('VÁLVULA DE ESCAPE', G.localToWorld(V(0, roof + 0.25 * B, ze + sg * 0.75 * B)));
      L(E.plugs === 2 ? 'DUAS VELAS' : 'VELA', G.localToWorld(V(0, roof + 1.45 * B, 0))); L('PISTÃO', G.localToWorld(V(0, roof - 0.9 * B, 0.75 * B)));
      if (vt === 'desmo') { L('CAME DE FECHAMENTO (cobre)', W(c.ci).add(V(0, 0.45 * B, 0))); L('BALANCIM DE ABERTURA', W(v0.op).add(V(0, 0.3 * B, 0))); L('GARFO DE FECHAMENTO', W(v0.cl).add(V(0, -0.25 * B, 0))); }
      else if (vt === 'pneu') { L('MOLA PNEUMÁTICA (N₂)', W(v0.n2).add(V(0, 0.2 * B, 0))); L('COMANDO', W(c.ci).add(V(0, 0.4 * B, 0))); }
      else if (vt === 'ohv') { L('BALANCIM', W(v0.op).add(V(0, 0.3 * B, 0))); L('VARETA (vem do comando no bloco)', W(v0.pr[0])); L('MOLA', W(e0.sp).add(V(0, 0.2 * B, 0))); }
      else { L('COMANDO', W(c.ci).add(V(0, 0.4 * B, 0))); L('MOLA', W(v0.sp).add(V(0, 0.15 * B, 0))); }
      proxy('intake', G, new THREE.Box3().setFromPoints(runPts).expandByScalar(0.3 * B));
    }
    return c;
  }

  // 2 tempos: janelas na parede do cilindro (escape na frente, transferências dos lados), canais de
  // transferência saindo do cárter, palheta (reed) e carburador atrás; o escape vira câmara de expansão.
  function twoStroke(c, G, l, i) {
    const { B, a, L, ch, roof } = K, E = g.E;
    const yc = th => { const t = th * DEG, s = Math.sin(t); return a * Math.cos(t) + Math.sqrt(L * L - a * a * s * s) + ch; }; // altura da coroa
    const yE = yc(E.epo), yT = yc(E.tpo), yB = yc(180) - 0.05 * B, ym = (yB + yE) / 2;
    const win = (w, y0, y1, x, z, ry, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, 0.05 * B), mat); m.position.set(x, (y0 + y1) / 2, z); m.rotation.y = ry; G.add(m); };
    win(0.55 * B, yB, yE, 0, 0.51 * B, 0, M.portEx);
    for (const s of [-1, 1]) {
      win(0.42 * B, yB, yT, s * 0.51 * B, -0.05 * B, Math.PI / 2, M.portTr);
      G.add(tube([V(s * 0.3 * B, 0.15 * a, -0.35 * B), V(s * 0.72 * B, yB * 0.55, -0.2 * B), V(s * 0.62 * B, (yB + yT) / 2, -0.05 * B)], 0.13 * B, M.glass, 24).m);
    }
    const cc = P3.cylX(a + 0.5 * B, 0.95 * B, M.shell, 40); G.add(cc, edges(cc));        // cárter individual
    const rz = -(a + 0.6 * B), reed = new THREE.Group(); reed.position.set(0, 0.15 * B, rz); G.add(reed);
    reed.add(new THREE.Mesh(new THREE.BoxGeometry(0.6 * B, 0.5 * B, 0.12 * B), M.dark));
    c.reed = [-1, 1].map(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5 * B, 0.36 * B, 0.015 * B), M.copper); p.geometry.translate(0, -0.18 * B, 0); p.position.set(0, s * 0.2 * B, 0.08 * B); p.userData.s = s; reed.add(p); return p; });
    const runPts = [V(0, 0.15 * B, rz - 0.05 * B), V(0, 0.3 * B, rz - 0.6 * B), V(0, 0.75 * B, rz - 1.3 * B), V(0, 1.1 * B, rz - 1.8 * B)];
    const run = tube(runPts, 0.3 * B, M.glass, 32); G.add(run.m); c.runCurve = run.c;
    const tg = new THREE.Group(); tg.position.copy(run.c.getPointAt(0.6)); tg.quaternion.setFromUnitVectors(V(0, 1, 0), run.c.getTangentAt(0.6)); G.add(tg);
    tg.add(new THREE.Mesh(new THREE.BoxGeometry(0.85 * B, 0.5 * B, 0.85 * B), M.cut));        // corpo do carburador
    c.thr = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * B, 0.28 * B, 0.03 * B, 24), M.brass); tg.add(c.thr);
    G.updateMatrixWorld(true);
    c.hp = [V(0, ym, 0.48 * B), V(0, ym - 0.05 * B, 0.95 * B), V(0, ym - 0.5 * B, 1.45 * B), V(0, ym - 1.2 * B, 1.7 * B)].map(p => G.localToWorld(p));
    c.bell = G.localToWorld(runPts[3].clone());
    c.runWorld = run.c.getPoints(24).map(p => G.localToWorld(p.clone()));
    c.inPath = [V(0.3 * B, 0.15 * a, -0.35 * B), V(0.72 * B, yB * 0.55, -0.2 * B), V(0.45 * B, (yB + yT) / 2, -0.05 * B)];
    c.exPath = [V(0, ym, 0.3 * B), V(0, ym - 0.05 * B, 0.95 * B), V(0, ym - 0.5 * B, 1.45 * B)];
    if (i === 0) {
      proxy('chamber', G, new THREE.Box3(V(-0.6 * B, yB - 0.2 * B, -0.6 * B), V(0.6 * B, roof + 0.7 * B, 0.6 * B)));
      proxy('intake', G, new THREE.Box3().setFromPoints(runPts).expandByScalar(0.3 * B));
    }
    return c;
  }

  // ---------- motor rotativo (Wankel) ----------
  const troch = (e, Rr, a) => [e * Math.cos(3 * a) + Rr * Math.cos(a), e * Math.sin(3 * a) + Rr * Math.sin(a)]; // (u, v)
  const wld = (x, u, v) => V(x, v, -u);                                                                      // plano do rotor → mundo
  function buildRotary() {
    const n = g.n, e = g.e * U, Rr = g.Rg * U, w = g.w * U, B = 0.55 * Rr, gap = 1.7 * w;
    K = { B, roof: Rr, yL: -1.45 * Rr, zL: 1.6 * Rr };
    M.sect.map.repeat.set(1 / (0.25 * B), 1 / (0.25 * B));
    const hole = new THREE.Path(), sh = new THREE.Shape();
    for (let i = 0; i <= 120; i++) { const [u, v] = troch(e, Rr + 0.15, i / 120 * 2 * Math.PI); if (i) hole.lineTo(u, v); else hole.moveTo(u, v); }
    sh.absellipse(0, 0, Rr + e + 2.6, Rr - e + 3.6, 0, 2 * Math.PI, false); sh.holes.push(hole);
    const hGeo = P3.extrudeX(sh, w), rs = new THREE.Shape(), A = k => (k * 120) * DEG;
    rs.moveTo(0.985 * Rr * Math.cos(A(0)), 0.985 * Rr * Math.sin(A(0)));
    for (let k = 0; k < 3; k++) { const m = A(k) + 60 * DEG; rs.quadraticCurveTo(0.74 * Rr * Math.cos(m), 0.74 * Rr * Math.sin(m), 0.985 * Rr * Math.cos(A(k + 1)), 0.985 * Rr * Math.sin(A(k + 1))); }
    const gear = new THREE.Path(); gear.absarc(0, 0, 0.32 * Rr, 0, 2 * Math.PI, true); rs.holes.push(gear);
    const rGeo = P3.extrudeX(rs, 0.92 * w, 0.2);
    crank = new THREE.Group(); root.add(crank);
    const xs = Array.from({ length: n }, (_, r) => (r - (n - 1) / 2) * gap), xmin = xs[0] - w, xmax = xs[n - 1] + w;
    const sh2 = P3.cylX(0.16 * Rr, xmax - xmin + 1.2 * w, M.forged); sh2.position.x = (xmin + xmax) / 2; crank.add(sh2);
    const fly = P3.cylX(1.25 * Rr, 0.2 * w, M.dark, 48); fly.position.x = xmax + 0.4 * w; crank.add(fly);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.2 * w, 0.8 * Rr, 0.1 * Rr), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x401800 })); mark.position.set(xmax + 0.4 * w, 0.7 * Rr, 0); crank.add(mark);
    M.housing = M.shell.clone(); M.housing.opacity = 0.16;
    for (let r = 0; r <= n; r++) { const pl = P3.cylX((Rr + e) * 1.3, 0.25 * w, M.headCut, 48); pl.position.x = xs[0] - gap / 2 + r * gap; root.add(pl); } // placas laterais/intermediárias
    const panH = 0.5 * Rr, pan = new THREE.Mesh(new THREE.BoxGeometry(xmax - xmin, panH, 1.3 * Rr), M.pan); pan.position.set((xmin + xmax) / 2, -(Rr - e) * 1.55 - 0.3 * Rr, 0); root.add(pan);
    oilBox = null;
    rotors = xs.map((x, r) => {
      const hous = new THREE.Mesh(hGeo, M.housing); hous.position.x = x; root.add(hous, edges(hous));
      const rot = new THREE.Mesh(rGeo, M.pis); rot.castShadow = true; rot.position.x = x; root.add(rot);
      const lobe = P3.cylX(0.36 * Rr, w * 0.9, M.steel, 24); lobe.position.x = x; root.add(lobe);
      const gas = [0, 1, 2].map(() => {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(38 * 3 * 3), 3));
        const mat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, roughness: 0.4 });
        const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; root.add(m); return m;
      });
      const plugs = [80, 100].map(al => {
        const [u, v] = troch(e, Rr, al * DEG), s = new THREE.Sprite(M.glow); s.scale.set(0.35 * Rr, 0.35 * Rr, 1); s.position.copy(wld(x, u * 0.99, v * 0.99)); root.add(s);
        const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * Rr, 0.06 * Rr, 0.5 * Rr, 12), M.ceramic); pl.position.copy(wld(x, u * 1.12, v * 1.12)); root.add(pl);
        return s;
      });
      const [ui, vi] = troch(e, Rr, 300 * DEG), runPts = [wld(x - 0.35 * w, ui * 0.8, vi * 0.8), wld(x - 1.0 * w, ui * 1.2, vi * 1.2), wld(x - 1.2 * w, ui * 1.5, vi * 1.8 + 0.4 * Rr)];
      const run = tube(runPts, 0.22 * Rr * (g.ports === 'peri' ? 1.3 : 1), M.glass, 24); root.add(run.m);
      const [ue, ve] = troch(e, Rr, 228 * DEG), hp = [wld(x, ue * 1.02, ve * 1.02), wld(x, ue * 1.3, ve * 1.3), wld(x, ue * 1.6, ve * 1.7), wld(x + 0.3 * w, ue * 1.7, ve * 2.3)];
      return { x, r, rot, lobe, gas, plugs, hp, runCurve: run.c, runWorld: run.c.getPoints(24), phi0: 30 - (r * 360 / n) / 3, bell: runPts[2] };
    });
    const col = V((xmin + xmax) / 2, Math.min(...rotors.map(t => t.hp[3].y)) - 0.6 * Rr, rotors[0].hp[3].z), rH = 0.22 * Rr * (g.ports === 'std' ? 1 : 1.2);
    hdrG = new THREE.Group(); root.add(hdrG);
    rotors.forEach(t => { const tb = tube([...t.hp, col.clone().add(V((t.x - col.x) * 0.15, 0.25 * Rr, 0)), col], rH, M.header, 48); hdrG.add(tb.m); t.hdrCurve = tb.c; hdrG.add(along(new THREE.Mesh(new THREE.CylinderGeometry(rH * 1.7, rH * 1.7, 0.1 * w, 20), M.forged), tb.c.getPointAt(0.05), tb.c.getTangentAt(0.05))); });
    const j = new THREE.Mesh(new THREE.SphereGeometry(rH * 1.45, 20, 14), M.header); j.position.copy(col); hdrG.add(j);
    curves.exhaust = rotors[0].hdrCurve;
    proxy('chamber', root, new THREE.Box3(V(xs[0] - w / 2, -Rr, -Rr - e), V(xs[0] + w / 2, Rr, Rr + e)));
    proxy('intake', root, new THREE.Box3().setFromPoints(rotors[0].runCurve.getPoints(10)).expandByScalar(0.2 * Rr));
    Object.assign(K, { xmin, xmax, y0: -(Rr - e) * 1.55, panBot: -(Rr - e) * 1.55 - 0.3 * Rr - panH / 2, zh: 0.65 * Rr, mainX: [], rot: true });
    bearings = [];
    return { cols: [col], xmin, xmax, B, top: Rr * 2 };
  }

  // ---------- escape completo ----------
  // linha: coletor (ou saída da turbina) → tubo dobrado → [catalisador] → [ressonador] → [abafador] → ponteira
  function component(kind, x0, len, y, z, rp, X, B) {
    const G = tagP(new THREE.Group(), kind); G.position.set(x0 + len / 2, y, z);
    const can = (r, l, mat, oval = 0.72, seg = 40) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg, 1, true), mat); m.rotation.z = Math.PI / 2; m.scale.z = oval; G.add(m); return m; };
    const cap = (r0, r1, l, xo, mat, oval = 0.72) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, l, 40, 1, true), mat); m.rotation.z = -Math.PI / 2 * Math.sign(xo); m.position.x = xo; m.scale.z = oval; G.add(m); };
    const disc = (r, xo, mat, oval = 0.72) => { const d = P3.cylX(r, 0.03 * B, mat, 32); d.position.x = xo; d.scale.z = oval; G.add(d); };
    let R0 = 0.5 * B, lab = '';
    if (kind === 'cat') {
      R0 = 0.52 * B; can(R0, len, M.cut); lab = 'CATALISADOR';
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 1.25, R0 * 1.25, len * 1.05, 32, 1, true, -Math.PI / 2, Math.PI), M.perf); sh.rotation.z = Math.PI / 2; sh.scale.z = 0.72; G.add(sh);   // escudo térmico
      const mono = new THREE.Mesh(new THREE.CylinderGeometry(0.46 * B, 0.46 * B, len * 0.62, 32), [M.ceramic, M.comb, M.comb]); mono.rotation.z = Math.PI / 2; mono.scale.z = 0.72; G.add(mono);
    } else if (kind === 'res') {
      R0 = 0.38 * B; can(R0, len, M.cut, 1); lab = 'RESSONADOR';
      can(rp * 1.08, len, M.perf, 1, 20); can(0.34 * B, len * 0.96, M.fiber, 1);
    } else {
      R0 = 0.82 * B; can(R0, len, M.cut, 0.66); lab = X.muff > 1 ? 'ABAFADOR (2 CÂMARAS)' : 'ABAFADOR RETO';
      if (X.muff > 1) { // câmaras com chicanas: o gás vira, expande e perde energia
        for (const xo of [-len / 6, len / 6]) disc(0.78 * B, xo, M.forged, 0.66);
        for (const [xo, zo] of [[-len / 3, 0.35], [0, -0.35], [len / 3, 0.35]]) { const t = P3.cylX(rp * 0.85, len / 3, M.perf, 16); t.position.set(xo, 0, zo * B); G.add(t); }
      } else { can(rp * 1.08, len, M.perf, 1, 20); can(0.72 * B, len * 0.96, M.fiber, 0.66); }
    }
    cap(rp, R0, 0.3 * B, len / 2 + 0.15 * B, M.cut, kind === 'res' ? 1 : 0.72); cap(rp, R0, 0.3 * B, -len / 2 - 0.15 * B, M.cut, kind === 'res' ? 1 : 0.72);
    const t = textSprite(lab, 0.32 * B); t.position.set(0, R0 + 0.5 * B, 0); t.visible = false; G.add(t); (labels.exhaust = labels.exhaust || []).push(t);
    proxy('exhaust', G, new THREE.Box3(V(-len / 2, -R0, -R0), V(len / 2, R0, R0)), 'ex');
    return G;
  }
  function line(p, side, X, rp) {
    const { B, xA, yL, zL } = exCtx, z = side * zL, comps = [];
    let x = xA + 0.8 * B;
    if (X.cat) { comps.push(['cat', x, 1.9 * B]); x += 2.8 * B; }
    if (X.res) { comps.push(['res', x, 1.5 * B]); x += 2.3 * B; }
    if (X.muff) { const ml = X.muff > 1 ? 3.4 * B : 2.7 * B; comps.push(['muff', x, ml]); x += ml + 0.5 * B; }
    if (g.veh.prop) { // avião: tubo curto descendo e apontando para trás — o vento da hélice leva o gás
      const e = V(p.x - 2.4 * B, yL - 0.4 * B, p.z), cv = bent([p.clone(), V(p.x, yL, p.z), e], 0.6 * B);
      exG.add(tagP(pipe(cv, rp, M.pipe), 'stack'));
      const lt = textSprite('SAÍDA (TUBO CURTO)', 0.3 * B); lt.position.copy(e).add(V(0, 0.7 * B, 0)); lt.visible = false; exG.add(lt); labels.exhaust.push(lt);
      return { curve: cv, tipEnd: e };
    }
    const xEnd = Math.max(x + 1.0 * B, xA + 4 * B);
    const pts = [p.clone(), V(p.x, yL, p.z), V(p.x, yL, z), V(xEnd, yL, z)];      // desce, vai para o lado, segue para trás
    if (Math.abs(p.z - z) < 0.3 * B) pts.splice(2, 1);
    const cv = bent(pts, 0.75 * B);
    exG.add(tagP(pipe(cv, rp, M.pipe), 'expipe'));
    for (const [k, x0, len] of comps) {
      exG.add(component(k, x0, len, yL, z, rp, X, B));
      for (const xx of [x0 - 0.35 * B, x0 + len + 0.35 * B]) { const r = new THREE.Mesh(ringGeo(rp * 1.18, 0.05 * B), M.steel); r.rotation.z = Math.PI / 2; r.position.set(xx, yL, z); exG.add(r); }   // abraçadeiras
    }
    ringAt(exG, cv, 0.015, rp * 1.25, M.steel, 0.07 * B);                       // abraçadeira em V (V-band) na saída do coletor/turbina
    for (let xx = xA + 0.4 * B; xx < xEnd - 0.5 * B; xx += 3.2 * B) {           // coxins de borracha: o escape "flutua" preso à carroceria
      if (comps.some(([, x0, len]) => xx > x0 - 0.5 * B && xx < x0 + len + 0.5 * B)) continue;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * B, 0.03 * B, 0.7 * B, 8), M.steel); rod.position.set(xx, yL + rp + 0.35 * B, z); exG.add(rod);
      const iso = tagP(P3.cylX(0.16 * B, 0.12 * B, M.rubber, 14), 'hanger'); iso.position.set(xx, yL + rp + 0.75 * B, z); exG.add(iso);
    }
    const tip = tagP(new THREE.Mesh(new THREE.CylinderGeometry(rp * 1.5, rp * 1.25, 0.9 * B, 24, 1, true), M.steel), 'tailpipe'); tip.rotation.z = Math.PI / 2; tip.position.set(xEnd + 0.4 * B, yL, z); exG.add(tip);
    const lt = textSprite(X.muff ? 'PONTEIRA' : 'SAÍDA DIRETA', 0.3 * B); lt.position.set(xEnd + 0.4 * B, yL + 0.7 * B, z); lt.visible = false; exG.add(lt); labels.exhaust.push(lt);
    return { curve: cv, tipEnd: V(xEnd + 0.85 * B, yL, z) };
  }
  function expansion(c, k) { // 2 tempos: header → cone divergente → barriga → cone convergente → ponteira fina → silencioso
    const { B, xA, yL, zL } = exCtx, pp = g.E.pipe, z = zL + k * 1.8 * B, r0 = 0.3 * B;
    const head = [...c.hp, V(c.hp[3].x + 0.5 * B, yL, z), V(xA, yL, z)], L1 = new THREE.CatmullRomCurve3(head).getLength();
    const Lt = (pp.lb + 0.25) * U, Ls = Math.max(3 * B, Lt - L1), pts = head.slice();
    for (let q = 1.5 * B; q < Ls; q += 1.5 * B) pts.push(V(xA + q, yL, z));
    pts.push(V(xA + Ls, yL, z));
    const cv = new THREE.CatmullRomCurve3(pts), Lc = cv.getLength(), s1 = 0.35 * pp.ld * U, s2 = pp.ld * U, s4 = pp.lb * U, s3 = s4 - 0.35 * (s4 - s2), rb = 2.4 * r0, rs = 0.48 * r0;
    const rf = u => { const s = u * Lc; return s < s1 ? r0 * (1 + 0.15 * s / s1) : s < s2 ? r0 * 1.15 + (rb - r0 * 1.15) * (s - s1) / (s2 - s1) : s < s3 ? rb : s < s4 ? rb + (rs - rb) * (s - s3) / (s4 - s3) : rs; };
    exG.add(tagP(sweep(cv, rf, 220, 20, M.header), 'expansion'));
    const end = pts[pts.length - 1], sil = P3.cylX(0.5 * B, 2.2 * B, M.dark, 28); sil.position.set(end.x + 1.1 * B, yL, z); exG.add(sil);
    const tip = P3.cylX(0.18 * B, 0.6 * B, M.steel, 16); tip.position.set(end.x + 2.5 * B, yL, z); exG.add(tip);
    const marks = [[s2 * 0.6, 'CONE DIVERGENTE'], [(s2 + s3) / 2, 'BARRIGA'], [(s3 + s4) / 2, 'CONE CONVERGENTE'], [s4 + 0.1 * U, 'PONTEIRA']];
    if (k === 0) for (const [s, t] of marks) { const sp = textSprite(t, 0.4 * B), q = cv.getPointAt(clamp(s / Lc, 0, 1)); sp.position.copy(q).add(V(0, rb + 0.5 * B, 0)); sp.visible = false; exG.add(sp); labels.exhaust.push(sp); }
    proxy('exhaust', exG, new THREE.Box3().setFromPoints(cv.getPoints(40)).expandByScalar(rb), 'ex');
    c.expCurve = new THREE.CatmullRomCurve3(pts.concat([V(end.x + 2.9 * B, yL, z)])); c.expS = { d: s2 / Lc, b: s4 / Lc };
    return c.expCurve;
  }
  function buildExhaust() {
    if (exG) { root.remove(exG); exG.traverse(o => { if (o.geometry) o.geometry.dispose(); }); pick = pick.filter(p => p.userData.tag !== 'ex'); }
    exG = new THREE.Group(); root.add(exG); labels.exhaust = K.exLab ? [K.exLab] : [];
    const X = EngineLib.EXH[exhKey] || EngineLib.EXH.stock, { outs, B } = exCtx, rp = (g.rot ? 0.26 : 0.3 * g.E.hdr / 0.5) * B;
    curves.exMain = [];
    if (g.two && !g.fi) { cyls.forEach((c, k) => expansion(c, k)); curves.exhaustSys = cyls[0].expCurve; }
    else {
      const ls = outs.map(p => line(p, outs.length > 1 ? (p.z >= 0 ? 1 : -1) : 1, X, rp));
      // caminho principal (coletor → turbina → linha → ponteira), amostrado para as partículas
      ls.forEach((l, k) => {
        const pre = exCtx.via.length ? [exCtx.cols[0], ...exCtx.via] : [exCtx.cols[Math.min(k, exCtx.cols.length - 1)]];
        const pts = pre.slice(0, -1).concat(l.curve.getSpacedPoints(60), [l.tipEnd, l.tipEnd.clone().addScaledVector(l.curve.getTangentAt(1), 1.5 * B).add(V(0, 0.3 * B, 0))]);
        const dd = []; pts.forEach(p => { if (!dd.length || dd[dd.length - 1].distanceTo(p) > 0.05 * B) dd.push(p); });
        curves.exMain.push(new THREE.CatmullRomCurve3(dd));
      });
      const h = g.rot ? rotors[0].hdrCurve : cyls[0].hdrCurve;
      curves.exhaustSys = new THREE.CatmullRomCurve3(h.getSpacedPoints(30).concat(curves.exMain[0] ? curves.exMain[0].getSpacedPoints(80) : []));
    }
    const b = new THREE.Box3(); (g.rot ? rotors : cyls).forEach(c => { const cv = c.hdrCurve || c.expCurve; if (cv) cv.getPoints(30).forEach(p => b.expandByPoint(p)); });
    (curves.exMain || []).forEach(cv => cv.getPoints(40).slice(0, 12).forEach(p => b.expandByPoint(p))); b.expandByScalar(0.8 * B);
    if (curves.exMain) curves.exMain.forEach(cv => cv.getPoints(40).forEach(p => b.expandByPoint(p)));                       // a linha inteira até a ponteira
    views.exhaust = { t: b.getCenter(V()), r: b.getSize(V()).length() * 1.15, yaw: 0.45, pitch: 0.42, box: b, m: 0.95, make: exhaustFX };
    const hb = new THREE.Box3().setFromPoints(curves.exhaust ? curves.exhaust.getPoints(30) : cyls[0].hp).expandByScalar(0.35 * B);
    proxy('exhaust', exG, hb, 'ex');
  }
  function setExhaust(k) {
    if (k === exhKey && exG) return;
    exhKey = k;
    if (!g) return;
    const was = focusName; if (was === 'exhaust') focus(null);
    buildExhaust();
    if (was === 'exhaust') focus('exhaust');
  }

  // ---------- admissão: tomada de ar → filtro → (compressor → intercooler) → borboleta → coletor → dutos ----------
  function airbox() { // caixa de ar sobre as cornetas (borboletas individuais / carburadores) com filtro e tomada de ar
    const B = K.B, b = new THREE.Box3(); (g.rot ? rotors.map(t => t.runCurve.getPoint(1)) : cyls.map(c => c.bell)).forEach(p => b.expandByPoint(p));
    b.expandByScalar(0.5 * B); const s = b.getSize(V()), m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), M.glass);
    m.position.copy(b.getCenter(V())); root.add(m, edges(m));
    const filt = new THREE.Mesh(new THREE.BoxGeometry(s.x * 0.8, 0.12 * B, s.z * 0.8), M.filter); filt.position.copy(m.position).add(V(0, s.y * 0.25, 0)); root.add(filt);
    const mouth = V(b.min.x - 1.0 * B, m.position.y + s.y * 0.3, m.position.z);
    const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * K.B, 0.3 * K.B, 1.1 * B, 24, 1, true), M.plastic); sn.rotation.z = Math.PI / 2; sn.position.copy(mouth).add(V(0.5 * B, 0, 0)); root.add(sn); // tomada de ar (aberta)
    K.airbox = { c: m.position.clone(), mouth, filt: filt.position.clone(), min: b.min.clone() };
    addLabel('intake', 'TOMADA DE AR', mouth.clone().add(V(0, 0.6 * B, 0))); addLabel('intake', 'FILTRO DE AR', filt.position.clone().add(V(0, 0.5 * B, 0))); addLabel('intake', 'CAIXA DE AR', m.position.clone().add(V(0, s.y * 0.6, 0)));
    return V(b.min.x, m.position.y, m.position.z);
  }
  function filterBox(dst) { // carros: caixa do filtro com tomada de ar, duto até a borboleta
    const B = K.B, c = V(K.xmin - 1.2 * B, dst.y + 0.9 * B, dst.z - 1.6 * B);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.9 * B, 0.9 * B, 1.5 * B), M.lid); box.position.copy(c); root.add(box, edges(box));
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9 * B, 0.35 * B, 1.5 * B), M.plastic); base.position.copy(c).add(V(0, -0.45 * B, 0)); root.add(base);
    const filt = new THREE.Mesh(new THREE.BoxGeometry(1.6 * B, 0.18 * B, 1.25 * B), M.filter); filt.position.copy(c).add(V(0, -0.15 * B, 0)); root.add(filt);
    const mouth = c.clone().add(V(-1.6 * B, -0.2 * B, 0));
    const sn = new THREE.Mesh(new THREE.CylinderGeometry(0.38 * B, 0.28 * B, 0.9 * B, 24, 1, true), M.plastic); sn.rotation.z = Math.PI / 2; sn.position.copy(mouth).add(V(0.4 * B, 0, 0)); root.add(sn);
    const out = c.clone().add(V(0.95 * B, 0, 0)), duct = bent([out, V(dst.x - 0.9 * B, out.y, out.z), V(dst.x - 0.9 * B, dst.y, dst.z), V(dst.x - 0.3 * B, dst.y, dst.z)], 0.5 * B);
    root.add(pipe(duct, 0.36 * B, M.plastic));
    addLabel('intake', 'TOMADA DE AR', mouth.clone().add(V(0, 0.6 * B, 0))); addLabel('intake', 'FILTRO DE AR', c.clone().add(V(0, 0.8 * B, 0))); addLabel('intake', 'BORBOLETA', dst.clone().add(V(0, 0.8 * B, 0)));
    return { mouth, c, duct };
  }

  // ---------- arrefecimento ----------
  function buildCooling() {
    if (coolG) { root.remove(coolG); coolG.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    coolG = tagP(new THREE.Group(), coolKey === 'liquid' || coolKey === 'none' ? 'coolsys' : 'aircool'); root.add(coolG); labels.cooling = []; curves.cool = null; fan = null;
    const B = K.B, kind = coolKey, add = o => { coolG.add(o); return o; };
    const lab = (t, p) => { const s = textSprite(t, 0.3 * B); s.position.copy(p); s.visible = false; coolG.add(s); labels.cooling.push(s); };
    const yTop = K.rot ? K.roof * 1.3 : K.roof + 1.2 * B, yBot = K.y0, Hr = clamp(yTop - yBot, 2 * B, 3.2 * B), Wr = g.veh.car ? Math.max(3 * B, 2 * K.zh + 1.4 * B) : 2.3 * B;
    const xr = K.xmin - (g.veh.car ? 2.8 : 2.2) * B, yc = (yTop + yBot) / 2, tr = 0.32 * B;
    if (kind === 'liquid' || kind === 'none') {
      const core = add(new THREE.Mesh(new THREE.BoxGeometry(tr, Hr, Wr), M.radCore)); core.position.set(xr, yc, 0); core.castShadow = true;
      for (const s of [-1, 1]) { const t = add(new THREE.Mesh(new THREE.BoxGeometry(tr * 1.5, 0.24 * B, Wr * 1.02), M.plastic)); t.position.set(xr, yc + s * (Hr / 2 + 0.12 * B), 0); }
      const capR = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12 * B, 0.12 * B, 0.12 * B, 16), M.steel)); capR.position.set(xr, yc + Hr / 2 + 0.3 * B, Wr * 0.3);
      // ventoinha entre o radiador e o motor
      const fr = 0.42 * Math.min(Hr, Wr), sh = add(new THREE.Mesh(new THREE.TorusGeometry(fr * 1.05, 0.04 * B, 8, 40), M.plastic)); sh.rotation.y = Math.PI / 2; sh.position.set(xr + 0.45 * B, yc, 0);
      fan = tagP(new THREE.Group(), 'fan'); fan.position.set(xr + 0.45 * B, yc, 0); add(fan);
      fan.add(P3.cylX(0.18 * B, 0.2 * B, M.dark, 20));
      for (let k = 0; k < 7; k++) { const piv = new THREE.Group(); piv.rotation.x = k / 7 * TAU; const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.03 * B, fr * 0.9, 0.3 * B), M.plastic); b2.position.y = fr * 0.5; b2.rotation.y = 0.45; piv.add(b2); fan.add(piv); }
      // bomba d'água (frente do bloco, embaixo) e válvula termostática (frente do cabeçote, em cima)
      const P = V(K.xmin - 0.25 * B, K.rot ? -0.2 * K.roof : 0.25 * K.roof, 0), Tm = K.rot ? V(K.xmin - 0.2 * B, K.roof * 0.9, 0) : banks[0].G.localToWorld(V(banks[0].x0 - 0.15 * B, K.roof + 0.35 * B, 0));
      const pump = add(P3.cylX(0.32 * B, 0.3 * B, M.castAlu, 24)); pump.position.copy(P);
      const pul = add(P3.cylX(0.36 * B, 0.08 * B, M.dark, 24)); pul.position.copy(P).add(V(-0.25 * B, 0, 0));
      const thb = add(new THREE.Mesh(new THREE.BoxGeometry(0.35 * B, 0.3 * B, 0.35 * B), M.castAlu)); thb.position.copy(Tm);
      // correia: virabrequim → bomba
      { const cp = V(K.xmin - 0.5 * B, 0, 0), pp = P.clone().add(V(-0.25 * B, 0, 0)), belt = [];
        for (let k = 0; k < 40; k++) { const a = k / 40 * TAU, c = k < 20 ? pp : cp, r = k < 20 ? 0.38 * B : 0.42 * B; belt.push(V(K.xmin - 0.5 * B, c.y + r * Math.sin(a), c.z + r * Math.cos(a))); }
        add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(belt, true), 80, 0.05 * B, 6, true), M.black));
        const cpul = P3.cylX(0.42 * B, 0.1 * B, M.dark, 28); cpul.position.copy(cp); crank.add(cpul); }
      // mangueiras: superior (termostática → radiador em cima), inferior (radiador embaixo → bomba), desvio (bypass)
      const up = bent([Tm, V(Tm.x - 0.6 * B, Tm.y, Tm.z), V(xr + 0.7 * B, yc + Hr / 2 - 0.1 * B, Wr * 0.32), V(xr + 0.12 * B, yc + Hr / 2 - 0.1 * B, Wr * 0.32)], 0.5 * B);
      const lo = bent([V(xr + 0.12 * B, yc - Hr / 2 + 0.1 * B, -Wr * 0.32), V(xr + 0.8 * B, yc - Hr / 2 + 0.1 * B, -Wr * 0.32), V(P.x - 0.1 * B, P.y, -0.5 * B), P], 0.5 * B);
      const by = bent([Tm, V(Tm.x + 0.25 * B, Tm.y - 0.4 * B, 0.35 * B), V(P.x + 0.2 * B, P.y + 0.3 * B, 0.35 * B), P], 0.3 * B);
      add(pipe(up, 0.17 * B, M.hoseHot)); add(pipe(lo, 0.17 * B, M.hoseCold)); add(pipe(by, 0.08 * B, M.hose));
      // caminhos do líquido para as partículas
      const eng = K.rot ? [P, V(K.xmin + 0.3 * B, -0.3 * K.roof, -0.5 * B), V(K.xmax - 0.3 * B, -0.3 * K.roof, -0.5 * B), V(K.xmax - 0.3 * B, 0.7 * K.roof, -0.5 * B), V(K.xmin + 0.3 * B, 0.7 * K.roof, -0.5 * B), Tm]
        : [P].concat([[banks[0].x0 + 0.3 * B, K.roof - 0.55 * K.hl], [banks[0].x1 - 0.3 * B, K.roof - 0.55 * K.hl], [banks[0].x1 - 0.3 * B, K.roof + 0.36 * B], [banks[0].x0 + 0.3 * B, K.roof + 0.36 * B]].map(([x, y]) => banks[0].G.localToWorld(V(x, y, -banks[0].s * 0.45 * B))), [Tm]);
      const zig = [V(xr, yc + Hr / 2 - 0.2 * B, Wr * 0.32)]; for (let k = 1; k <= 5; k++) zig.push(V(xr, yc + Hr / 2 - 0.2 * B - k / 5 * (Hr - 0.4 * B), (k % 2 ? -1 : 1) * Wr * 0.32));
      curves.cool = { eng: new THREE.CatmullRomCurve3(eng), up, rad: new THREE.CatmullRomCurve3(zig), lo, by };
      lab('RADIADOR', V(xr, yc + Hr / 2 + 0.7 * B, 0)); lab('VENTOINHA', V(xr + 0.45 * B, yc - fr - 0.4 * B, 0)); lab("BOMBA D'ÁGUA", P.clone().add(V(-0.3 * B, -0.7 * B, 0)));
      lab('VÁLVULA TERMOSTÁTICA', Tm.clone().add(V(0, 0.65 * B, 0))); lab('MANGUEIRA SUPERIOR (QUENTE)', up.getPointAt(0.5).add(V(0, 0.5 * B, 0))); lab('MANGUEIRA INFERIOR (FRIA)', lo.getPointAt(0.5).add(V(0, -0.5 * B, 0)));
      if (!K.rot) lab('GALERIAS DE ÁGUA (CORTE)', banks[0].G.localToWorld(V((banks[0].x0 + banks[0].x1) / 2, K.roof + 0.9 * B, 0)));
      proxy('cooling', coolG, new THREE.Box3().setFromObject(core).expandByScalar(0.3 * B), 'cool');
    } else if (kind === 'oilair') { // radiador de óleo na frente, embaixo
      const core = add(new THREE.Mesh(new THREE.BoxGeometry(tr, 0.9 * B, 1.8 * B), M.radCore)); core.position.set(xr + 0.6 * B, K.y0 + 0.2 * B, 0);
      add(pipe(bent([V(xr + 0.7 * B, K.y0 + 0.5 * B, 0.6 * B), V(K.xmin, K.y0 + 0.5 * B, 0.6 * B), V(K.xmin + 0.3 * B, K.y0 - 0.3 * B, 0.6 * B)], 0.3 * B), 0.07 * B, M.hose));
      add(pipe(bent([V(xr + 0.7 * B, K.y0 - 0.1 * B, -0.6 * B), V(K.xmin, K.y0 - 0.1 * B, -0.6 * B), V(K.xmin + 0.3 * B, K.y0 - 0.5 * B, -0.6 * B)], 0.3 * B), 0.07 * B, M.hose));
      lab('RADIADOR DE ÓLEO', core.position.clone().add(V(0, 0.8 * B, 0)));
      proxy('cooling', coolG, new THREE.Box3().setFromObject(core).expandByScalar(0.3 * B), 'cool');
    }
    if (kind === 'air' || kind === 'oilair') lab('ALETAS (O VENTO LEVA O CALOR)', V((K.xmin + K.xmax) / 2, K.roof + 1.5 * B, 0));
    if (!K.rot) proxy('cooling', coolG, new THREE.Box3(V(K.xmin, K.roof - 0.4 * K.hl, -0.7 * B), V(K.xmax, K.roof + 0.6 * B, 0.7 * B)), 'cool');
    const bx = new THREE.Box3().setFromObject(coolG); if (!K.rot) bx.expandByPoint(V(K.xmax, K.roof + 1.3 * B, 0));
    if (!bx.isEmpty()) views.cooling = { t: bx.getCenter(V()), r: bx.getSize(V()).length() * 1.75, yaw: -0.8, pitch: 0.3, make: coolFX };
  }
  function setCooling(k) { if (k !== coolKey) { coolKey = k; if (g) build(g); } }

  // ---------- lubrificação ----------
  function buildOil() {
    if (oilG) { root.remove(oilG); oilG.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    oilG = tagP(new THREE.Group(), 'oilsys'); root.add(oilG); labels.oil = []; curves.oil = null;
    const B = K.B, add = o => { oilG.add(o); return o; }, lab = (t, p) => { const s = textSprite(t, 0.28 * B); s.position.copy(p); s.visible = false; oilG.add(s); labels.oil.push(s); };
    if (g.two) { lab('2 TEMPOS: ÓLEO MISTURADO NA GASOLINA', V((K.xmin + K.xmax) / 2, K.y0 - 0.6 * B, 0)); views.oil = viewOf(root, 0.9, 0.75, 0.15); views.oil.make = oilFX; return; }
    const xm = (K.xmin + K.xmax) / 2, pb = V(xm, K.panBot + 0.12 * B, 0), pump = V(K.xmin + 0.25 * B, -(K.a || 0.3 * B) - 0.25 * B, 0);
    const pick1 = bent([pb, V(xm, K.panBot + 0.12 * B, 0), V(pump.x + 0.3 * B, K.panBot + 0.12 * B, 0), V(pump.x + 0.3 * B, pump.y, 0), pump], 0.3 * B);
    add(pipe(pick1, 0.07 * B, M.steel));
    const strainer = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3 * B, 0.3 * B, 0.08 * B, 20), M.perf)); strainer.position.copy(pb);
    const pm = add(P3.cylX(0.28 * B, 0.22 * B, M.castAlu, 20)); pm.position.copy(pump);
    const yG = K.rot ? 0.2 * K.roof : K.vee ? 1.0 * B : K.boxer ? 0.6 * B : 0.42 * B, zG = K.vee || K.boxer || K.rot ? 0 : -0.62 * B;
    const gal = [pump, V(pump.x, yG, zG), V(K.xmax - 0.25 * B, yG, zG)], galC = bent(gal, 0.3 * B);
    add(pipe(galC, 0.06 * B, M.brass));
    const feeds = (K.mainX || []).map(x => { const f = bent([V(x, yG, zG), V(x, yG * 0.5, zG * 0.5), V(x, 0.05 * B, 0)], 0.15 * B); add(pipe(f, 0.035 * B, M.brass)); return f; });
    let riser = null, headG = null, drain = null;
    if (!K.rot && banks.length) {
      const bk = banks[0], H0 = bk.G.localToWorld(V(bk.x1 - 0.25 * B, K.roof + 0.78 * B, 0)), H1 = bk.G.localToWorld(V(bk.x0 + 0.25 * B, K.roof + 0.78 * B, 0));
      riser = bent([V(K.xmax - 0.25 * B, yG, zG), V(K.xmax - 0.25 * B, H0.y, zG), H0], 0.3 * B); add(pipe(riser, 0.05 * B, M.brass));
      headG = new THREE.CatmullRomCurve3([H0, H1]); add(pipe(headG, 0.04 * B, M.brass, 12));
      drain = new THREE.CatmullRomCurve3([H1, V(H1.x, (H1.y + K.y0) / 2, H1.z * 0.4), V(H1.x + 0.3 * B, K.panBot + 0.4 * B, 0)]);
      lab('GALERIA DO CABEÇOTE (COMANDO)', H0.clone().lerp(H1, 0.5).add(V(0, 0.6 * B, 0)));
    }
    let turbo = null;
    if (chg && g.fi && g.fi.type === 'turbo') { const tp = chg.group.position.clone(); turbo = bent([V(K.xmax - 0.6 * B, yG, zG), V(K.xmax - 0.6 * B, tp.y, zG), tp], 0.3 * B); add(pipe(turbo, 0.035 * B, M.brass)); }
    curves.oil = { pick: pick1, gal: galC, feeds, riser, headG, drain, turbo };
    lab('CÁRTER (NÍVEL DE ÓLEO)', V(xm, K.panBot - 0.5 * B, K.zh)); lab('PESCADOR', pb.clone().add(V(0.6 * B, 0.5 * B, 0))); lab('BOMBA DE ÓLEO', pump.clone().add(V(-0.3 * B, -0.6 * B, 0)));
    lab('GALERIA PRINCIPAL', V(xm, yG + 0.45 * B, zG)); if ((K.mainX || []).length) lab('BRONZINAS DE MANCAL', V(K.mainX[1] || K.mainX[0], -0.55 * B, 0.3 * B));
    if (!K.rot) lab('JATOS SOB OS PISTÕES', cyls[0].G.localToWorld(cyls[0].jet.clone()).add(V(0, -0.5 * B, 0)));
    proxy('oil', oilG, new THREE.Box3(V(K.xmin, K.panBot, -K.zh), V(K.xmax, K.y0 + 0.2 * B, K.zh)), 'oil');
    const bx = new THREE.Box3(V(K.xmin - 0.5 * B, K.panBot - 0.3 * B, -K.zh), V(K.xmax + 0.3 * B, K.rot ? K.roof : K.roof + 1.2 * B, K.zh));
    views.oil = { t: bx.getCenter(V()), r: bx.getSize(V()).length() * 1.7, yaw: 0.5, pitch: 0.12, make: oilFX };
  }

  // ---------- montagem ----------
  function build(geo, opt = {}) {
    g = geo; if (opt.exh) exhKey = opt.exh; if (opt.cool) coolKey = opt.cool; focus(null);
    if (root) { scene.remove(root); root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    ghost(null); root = new THREE.Group(); scene.add(root); exG = coolG = oilG = tbG = null; labels = {}; hide = {};
    pick = []; finGs = []; cyls = []; rotors = []; banks = []; plThr = null; chg = null; trRef = null; for (const k in views) delete views[k]; for (const k in curves) delete curves[k];
    const ex = g.rot ? buildRotary() : buildPiston(), B = ex.B;
    // sobrealimentação: coletor(es) → turbina → linha de escape; compressor → intercooler → admissão
    const F = g.fi, c0 = ex.cols[0];
    let outs = ex.cols, via = [], intake = [];
    if (F) {
      const s = F.rc * U, Mc = Object.assign({}, M, { alu: M.aluCut, hot: M.hotCut });
      chg = P3.charger(F.type, s, Mc); root.add(tagP(chg.group, F.type === 'turbo' ? 'turbo' : 'sc')); tbG = new THREE.Group(); root.add(tbG);
      if (F.type === 'turbo') {
        chg.group.position.set((ex.xmin + ex.xmax) / 2, c0.y + 2.2 * s, c0.z + 3.2 * s);
        root.updateMatrixWorld(true);
        const tin = chg.group.localToWorld(chg.anch.tin.clone());
        ex.cols.forEach(p => hdrG.add(pipe(bent([p, V(p.x, p.y - 0.5 * B, p.z), V(tin.x - 2 * s, p.y - 0.5 * B, tin.z), V(tin.x - 2 * s, tin.y - s, tin.z), tin], 0.5 * B), 0.3 * B, M.header)));
        const tout = chg.group.localToWorld(V(-3.0 * s, 0, 0));
        outs = [tout]; via = [V(tin.x - 2 * s, tin.y - s, tin.z), tin, chg.group.localToWorld(V(-1.6 * s, 0, 0)), tout];
        const cOut = chg.group.localToWorld(V(0.9 * s, 2.0 * s, -1.7 * s)), ic = V((ex.xmin + ex.xmax) / 2, c0.y - 0.6 * B, c0.z + 3.2 * s + 2.4 * B);
        const icM = new THREE.Mesh(new THREE.BoxGeometry(3.4 * B, 1.3 * B, 0.3 * B), M.radCore); icM.position.copy(ic); tbG.add(tagP(icM, 'intercooler'), edges(icM));
        const dst = curves.intakeIn || airbox();
        const p1 = bent([cOut, V(cOut.x, cOut.y, ic.z), V(ic.x + 1.9 * B, cOut.y, ic.z), V(ic.x + 1.9 * B, ic.y, ic.z), V(ic.x + 1.7 * B, ic.y, ic.z)], 0.5 * B);
        const p2 = bent([V(ic.x - 1.7 * B, ic.y, ic.z), V(ex.xmin - 1.4 * B, ic.y, ic.z), V(ex.xmin - 1.4 * B, dst.y, ic.z), V(ex.xmin - 1.4 * B, dst.y, dst.z), V(dst.x - 0.3 * B, dst.y, dst.z)], 0.5 * B);
        tbG.add(pipe(p1, 0.25 * B, M.alu), pipe(p2, 0.25 * B, M.alu));
        for (const [cv, u] of [[p1, 0.04], [p1, 0.96], [p2, 0.04], [p2, 0.96]]) coupler(tbG, cv, u, 0.25 * B);
        const tPts = chg.turbCurve.getPoints(60).reverse().concat([V(-1.3 * s, 0, 0), V(-3.0 * s, 0, 0)]), cPts = [V(4.0 * s, 0, 0), V(1.7 * s, 0, 0), V(1.0 * s, 0.6 * s, 0)].concat(chg.compCurve.getPoints(60));
        curves.turbo = [tPts, cPts].map(pts => new THREE.CatmullRomCurve3(pts.map(p => chg.group.localToWorld(p))));   // gás: entra pelo caracol, sai pelo eixo; ar: entra pelo eixo, sai pelo caracol
        const filt = chg.group.localToWorld(V(4.4 * s, 0, 0));
        intake = [filt.clone().add(V(2 * B, 0, 0)), filt].concat(curves.turbo[1].getSpacedPoints(20), p1.getSpacedPoints(16), [ic.clone()], p2.getSpacedPoints(16));
        for (const [k, t] of [['tw', 'ROTOR DA TURBINA (gás de escape)'], ['cw', 'ROTOR DO COMPRESSOR (ar)'], ['chra', 'EIXO E MANCAIS EM ÓLEO'], ['wg', 'WASTEGATE (desvio)'], ['bov', 'VÁLVULA DE ALÍVIO'], ['turb', 'CARACOL DA TURBINA'], ['comp', 'CARACOL DO COMPRESSOR']]) addLabel('turbo', t, chg.group.localToWorld(chg.anch[k].clone()), 0.5 * s);
        addLabel('turbo', 'INTERCOOLER', ic.clone().add(V(0, 1.0 * B, 0)), 0.3 * B); addLabel('intake', 'INTERCOOLER', ic.clone().add(V(0, 1.0 * B, 0)), 0.3 * B);
      } else {
        chg.group.position.set(ex.xmin - 2.2 * s, ex.top * 0.45, 0);
        const dst = curves.intakeIn || airbox(), sOut = chg.group.localToWorld(V(0.9 * s, 2.0 * s, -1.7 * s));
        const p1 = bent([sOut, V(sOut.x, dst.y, sOut.z), V(sOut.x, dst.y, dst.z), V(dst.x - 0.3 * B, dst.y, dst.z)], 0.4 * B); tbG.add(pipe(p1, 0.22 * B, M.alu));
        const pp1 = V(ex.xmin - 1.6 * s - 0.6 * B, 0, 0), pp2 = chg.group.position.clone().add(V(-0.8 * s, 0, 0)), belt = [];
        const pul = P3.cylX(0.55 * B, 0.3 * B, M.dark, 32); pul.position.copy(pp1); crank.add(pul);
        for (let k = 0; k < 32; k++) { const a = k / 32 * 2 * Math.PI, c = k < 16 ? pp2 : pp1, r = k < 16 ? 0.95 * s : 0.6 * B; belt.push(V(c.x, c.y + r * Math.sin(a), c.z + r * Math.cos(a))); }
        tbG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(belt, true), 64, 0.06 * B, 6, true), M.black));
        root.updateMatrixWorld(true);
        curves.turbo = [new THREE.CatmullRomCurve3([V(4.0 * s, 0, 0), V(1.7 * s, 0, 0), V(1.0 * s, 0.6 * s, 0)].concat(chg.compCurve.getPoints(60)).map(p => chg.group.localToWorld(p)))];
        const filt = chg.group.localToWorld(V(4.4 * s, 0, 0));
        intake = [filt.clone().add(V(2 * B, 0, 0)), filt].concat(curves.turbo[0].getSpacedPoints(20), p1.getSpacedPoints(16));
        for (const [k, t] of [['cw', 'ROTOR DO COMPRESSOR'], ['pul', 'POLIA (CORREIA DO VIRABREQUIM)'], ['chra', 'MULTIPLICADOR E MANCAIS'], ['bov', 'VÁLVULA DE ALÍVIO'], ['comp', 'CARACOL']]) addLabel('turbo', t, chg.group.localToWorld(chg.anch[k].clone()), 0.5 * s);
      }
      chg.plane.constant = chg.group.position.z;                                 // corte pelo eixo, do lado da câmera
      proxy('turbo', root, new THREE.Box3().setFromObject(chg.group));
      views.turbo = Object.assign(viewOf(chg.group, 2.4, 0.9, 0.35), { m: 0.8, yaw: 0.55, pitch: 0.3, make: () => flowFX('turbo') });
    } else if (g.plen || K.plenum) {
      const fb = filterBox(curves.intakeIn);
      intake = [fb.mouth.clone().add(V(-2 * B, 0, 0)), fb.mouth, fb.c].concat(fb.duct.getSpacedPoints(20));
    } else {
      airbox(); const ab = K.airbox;
      intake = [ab.mouth.clone().add(V(-2 * B, 0, 0)), ab.mouth, V(ab.min.x + 0.2 * B, ab.mouth.y, ab.c.z), ab.filt, ab.c];
    }
    // caminho do ar até a válvula do cilindro 1 (para as partículas)
    const c1 = g.rot ? rotors[0] : cyls[0], runW = (c1.runWorld || []).slice().reverse();
    if (K.plenum) intake.push(K.plenum.clone());
    intake.push(...runW);
    { const dd = []; intake.forEach(p => { if (!dd.length || dd[dd.length - 1].distanceTo(p) > 0.05 * B) dd.push(p); }); curves.intakeSys = new THREE.CatmullRomCurve3(dd); curves.intakeRun = 1 - runW.length / dd.length; }
    if (!labels.intake || !labels.intake.length) addLabel('intake', 'DUTOS DE ADMISSÃO', (c1.bell || runW[0]).clone().add(V(0, 0.8 * B, 0)));
    exCtx = { outs, via, cols: ex.cols, B, xA: ex.xmax + 0.5 * B, yL: K.yL, zL: K.zL };
    buildExhaust();
    gb = T3.make(g.trans, g.veh, B, M, EngineLib.DRV); tagP(gb.group, g.trans); gb.group.position.set(ex.xmax + 0.9 * B, 0, 0); root.add(gb.group);
    root.updateMatrixWorld(true);
    proxy('gearbox', root, new THREE.Box3().setFromObject(gb.group));
    buildCooling(); buildOil();
    // vistas de foco
    const inB = new THREE.Box3().setFromPoints(curves.intakeSys.getPoints(60));
    if (g.rot) views.chamber = viewOf(rotors[0].rot, 1.8, Math.PI / 2 - 0.25, 0.15);
    else { // pelo lado do corte da bancada do cilindro 1 (o bloco é opaco do outro lado)
      const bk = banks.find(b => b.bx.some(xx => Math.abs(xx - g.lay[0].x * B) < 1e-6)) || banks[0], n = bk.plane.normal.clone().negate();
      views.chamber = { t: cyls[0].G.localToWorld(V(0, K.roof - (g.two ? 0.9 : 0.1) * B, 0)), r: (g.two ? 4.4 : 5.4) * B, yaw: Math.atan2(n.x, n.z) - 0.35, pitch: clamp(Math.asin(clamp(n.y, -1, 1)), -0.2, 1.1) + 0.12, make: chamberFX };
    }
    views.intake = { t: inB.getCenter(V()), r: inB.getSize(V()).length() * 1.25 + 2 * B, yaw: -0.7, pitch: 0.35, make: () => flowFX('intake') };
    views.gearbox = gb.view ? viewOf(gb.group, ...gb.view) : viewOf(gb.group, 2.5, Math.PI - 0.6, 0.45);
    hide = { gearbox: [exG, coolG, hdrG, oilG], oil: [exG, hdrG], cooling: [exG, hdrG], chamber: [coolG, hdrG, exG, ...finGs], intake: [exG], turbo: [coolG, oilG], exhaust: [coolG, oilG, gb.group] };
    // enquadramento geral, chão e sombra
    const box = new THREE.Box3(); root.children.forEach(o => { if (!(gb.big && o === gb.group)) box.expandByObject(o); });   // a hélice de 3–4 m não entra no enquadramento
    const c = box.getCenter(V()), sz = box.getSize(V());
    M.ground.position.y = M.grid.position.y = box.min.y - 0.3;
    Object.assign(home, { t: c, r: 0.48 * sz.length() / Math.tan(cam.fov * DEG / 2), yaw: 0.75, pitch: 0.3, box, m: 0.9 });
    Object.assign(orb, { r: home.r, yaw: home.yaw, pitch: home.pitch }); orb.t.copy(c); tween.k = 1;
    key.position.copy(c).add(V(sz.x * 0.5 + 80, sz.y + 160, sz.z + 120)); key.target.position.copy(c);
    const sc = key.shadow.camera, m = Math.max(sz.x, sz.y, sz.z) * 0.9;
    Object.assign(sc, { left: -m, right: m, top: m, bottom: -m, near: 1, far: 1200 }); sc.updateProjectionMatrix();
  }

  // ---------- partículas dos focos ----------
  const cur = { st: null, mi: 0, me: 0 };
  function chamberFX() {
    const c = cyls[0], f = P3.chamber({ B: K.B, roof: K.roof, sg: c.sg, two: g.two, inPath: c.inPath, exPath: c.exPath });
    c.G.add(f.pts);
    return { obj: f.pts, dispose: f.dispose, stats: f.stats, update: S => S.fx0 && f.update(Object.assign(S.fx0, { dtv: S.dtv, cam: camK(), fuel: S.fuel, lam: S.st ? S.st.lam : 1 })) };
  }
  function flowFX(kind) {
    const B = K.B, egtK = () => (cur.st ? cur.st.egt : 30) + 273;
    let f;
    if (kind === 'intake') f = P3.flow([curves.intakeSys], 700, 0.18 * B, (p, u, c, i) => {
      const fuel = u > curves.intakeRun + 0.15 * (1 - curves.intakeRun);       // combustível só depois do bico
      const sp = fuel && i % 7 === 0 ? P3.SPEC[2] : i % 4 === 1 ? P3.SPEC[1] : P3.SPEC[0];
      c[0] = sp[0]; c[1] = sp[1]; c[2] = sp[2]; return 0.06 * B * sp[3];
    });
    else f = P3.flow(curves.turbo, 360, 0.1 * B, (p, u, c) => {
      if (curves.turbo.length === 2 && p === 0) { P3.heat(egtK() * (1 - 0.25 * u), c, true); return 0.08 * B; }
      const w = clamp((cur.st ? cur.st.T2 : 30) / 200, 0, 1) * u; c[0] = 0.4 + w; c[1] = 0.75 - w * 0.4; c[2] = 1 - w * 0.6; return 0.06 * B;
    });
    root.add(f.pts);
    return { obj: f.pts, dispose: f.dispose, update: S => f.update(S.dtv, () => kind === 'intake' ? 0.04 + 0.6 * Math.max(0, cur.mi) : 0.1 + (S.st ? Math.min(1.5, S.st.trpm / 60000) : 0), camK()) };
  }
  // amostragem rápida de uma curva: pontos, tangentes e comprimento (cm)
  function samp(curve, n = 160) {
    const pts = curve.getSpacedPoints(n), tan = pts.map((_, i) => pts[Math.min(n, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
    return { pts, tan, len: curve.getLength(), n };
  }
  const at = (S, s, out) => { const u = clamp(s / S.len, 0, 1) * S.n, i = Math.min(S.n - 1, u | 0), f = u - i; return out.copy(S.pts[i]).lerp(S.pts[i + 1], f); };
  const tanAt = (S, s) => S.tan[Math.round(clamp(s / S.len, 0, 1) * S.n)];

  // Escape: o gás de cada cilindro (uma cor por cilindro) sai em pulso quando a válvula de escape abre,
  // corre pelo seu header e encontra os dos outros no coletor. Anéis claros = onda de pressão indo;
  // na junção uma parte volta como depressão (azul) — é o que ajuda a esvaziar o cilindro no cruzamento.
  function exhaustFX() {
    const B = K.B, two = g.two && !g.fi, units = g.rot ? rotors : cyls;
    const hdr = units.map(c => samp(two ? c.expCurve : c.hdrCurve));
    const main = two ? [] : (curves.exMain || []).map(c => samp(c, 220));
    const mainOf = i => two || !main.length ? -1 : g.fi || main.length === 1 ? 0 : Math.min(main.length - 1, g.rot ? 0 : cyls[i].grp);
    const N = 1800, P = P3.points(N, true), path = new Int16Array(N).fill(-9), s = new Float32Array(N), sp = new Float32Array(N), cy = new Uint8Array(N), age = new Float32Array(N);
    const ringN = 72, rGeo = new THREE.TorusGeometry(1, 0.07, 6, 28), rMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const rings = new THREE.InstancedMesh(rGeo, rMat, ringN); rings.frustumCulled = false; rings.renderOrder = 11; rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ringN * 3), 3);
    const rg = Array.from({ length: ringN }, () => ({ on: false, h: 0, m: -1, s: 0, d: 1, amp: 0 }));
    const grp = new THREE.Group(); grp.add(P.pts, rings); root.add(grp);
    const prevTc = units.map(() => -1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(), pos = V(), zAx = V(0, 0, 1), col = new THREE.Color();
    let free = 0;
    const spawnRing = (h, m, s0, d, amp) => { const r = rg.find(o => !o.on) || rg[0]; Object.assign(r, { on: true, h, m, s: s0, d, amp, ref: 0 }); };
    const rH = (two ? 0.3 : 0.24 * g.E.hdr / 0.5) * B * (g.rot ? 0.9 : 1);
    return {
      obj: grp, dispose() { P.dispose(); rGeo.dispose(); rMat.dispose(); },
      update(S) {
        const st = S.st, tr = S.tr, C = g.cyc, dtv = S.dtv, egt = (st ? st.egt : 400) + 273, a = Math.sqrt(1.33 * 287 * egt * 0.9) * U;
        const rho = 1.2e5 / (287 * egt), area = (g.hA || 0.001);
        units.forEach((c, i) => {
          const off = g.rot ? ((c.r * 360 / g.n) % 1080) : c.off, tc = ((S.thv - off) % C + C) % C, j = (tc * 2) | 0;
          const evo = g.evo, prev = prevTc[i];
          if (prev >= 0 && inWin(evo, prev, tc, C) && ((tc - prev + C) % C) < C / 2) { spawnRing(i, -1, 0, 1, 1); }
          prevTc[i] = tc;
          const open = (g.Le[j] || 0) > 0, me = tr ? Math.max(0, tr.me[tc | 0]) : open ? 20 : 0;
          if (open && me > 0) {
            const u = clamp(me / 1000 / (rho * area), 8, 450), want = Math.min(14, me / Math.max(meMax, 1e-6) * 30 * Math.min(1, dtv * 600));
            for (let k = 0; k < want; k++) {
              for (let t = 0; t < N; t++) { free = (free + 1) % N; if (path[free] === -9) break; }
              path[free] = i; s[free] = Math.random() * 0.15 * B; sp[free] = u * (0.8 + 0.4 * Math.random()) * U; cy[free] = i; age[free] = 0;
            }
          }
        });
        // gás
        for (let k = 0; k < N; k++) {
          if (path[k] === -9) { P.size[k] = 0; continue; }
          const onMain = path[k] < 0, S0 = onMain ? main[-path[k] - 1] : hdr[path[k]];
          s[k] += sp[k] * dtv; age[k] += dtv; sp[k] *= onMain ? 1 - Math.min(0.5, dtv * 2) : 1 - Math.min(0.3, dtv * 0.5);
          sp[k] = Math.max(sp[k], (onMain ? 3 : 6) * U * (st ? Math.min(1, st.rpm / 2000) : 0.3));
          if (s[k] >= S0.len) {
            const m = mainOf(cy[k]);
            if (!onMain && m >= 0) { path[k] = -(m + 1); s[k] = 0; } else { path[k] = -9; P.size[k] = 0; continue; }
          }
          const S1 = path[k] < 0 ? main[-path[k] - 1] : hdr[path[k]], p = at(S1, s[k], pos);
          P.pos[k * 3] = p.x + (Math.random() - 0.5) * rH * 0.9; P.pos[k * 3 + 1] = p.y + (Math.random() - 0.5) * rH * 0.9; P.pos[k * 3 + 2] = p.z + (Math.random() - 0.5) * rH * 0.9;
          const cc = PAL[cy[k] % PAL.length], fade = path[k] < 0 ? clamp(1 - s[k] / S1.len, 0.15, 1) : 1;
          P.col[k * 3] = cc.r * fade + 0.4 * (1 - fade); P.col[k * 3 + 1] = cc.g * fade + 0.4 * (1 - fade); P.col[k * 3 + 2] = cc.b * fade + 0.4 * (1 - fade);
          P.size[k] = 0.09 * B * (path[k] < 0 && s[k] > S1.len * 0.97 ? 2.2 : 1);
        }
        P.mat.uniforms.k.value = camK(); P.flush();
        // ondas de pressão
        let ni = 0;
        for (const r of rg) {
          if (!r.on) continue;
          r.s += r.d * a * dtv;
          const S1 = r.m >= 0 ? main[r.m] : hdr[r.h];
          if (r.m < 0 && r.d > 0 && r.s >= S1.len) {               // chegou na junção: reflete negativa, transmite positiva
            const m = mainOf(r.h);
            if (two) { r.on = false; continue; }
            spawnRing(r.h, -1, S1.len, -1, -0.6 * r.amp);
            if (m >= 0) { r.m = m; r.s = 0; r.amp *= 0.45; } else r.on = false;
          } else if (r.s < 0 || r.s > S1.len) { r.on = false; continue; }
          if (two && r.m < 0 && r.d > 0 && r.amp > 0 && !r.ref && r.s > S1.len * c2(r.h).d) { r.ref = 1; spawnRing(r.h, -1, r.s, -1, -0.5); }
          if (two && r.m < 0 && r.d > 0 && r.amp > 0 && r.ref === 1 && r.s > S1.len * c2(r.h).b) { r.ref = 2; spawnRing(r.h, -1, r.s, -1, 0.6); r.on = false; continue; }
          const p = at(S1, r.s, pos), t = tanAt(S1, r.s), amp = r.amp * Math.exp(-Math.abs(r.s) / (400 * U / 100));
          q.setFromUnitVectors(zAx, t); sc.setScalar(rH * 1.25 * (two ? 1 + (r.s / S1.len) * 1.5 : 1)); m4.compose(p, q, sc); rings.setMatrixAt(ni, m4);
          if (amp > 0) col.setRGB(1, 0.75, 0.45).multiplyScalar(Math.min(1, amp * 1.4)); else col.setRGB(0.3, 0.6, 1).multiplyScalar(Math.min(1, -amp * 1.8));
          rings.setColorAt(ni, col); ni++;
          if (ni >= ringN) break;
        }
        rings.count = ni; rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      },
    };
    function c2(i) { return cyls[i].expS || { d: 0.4, b: 0.85 }; }
  }
  // arrefecimento: líquido saindo da bomba, passando pelas galerias do bloco e do cabeçote, termostática →
  // radiador (aberta) ou desvio (fechada); cor = temperatura. Motor a ar: o vento passando pelas aletas.
  function coolFX() {
    const B = K.B, N = 700, P = P3.points(N, true), path = new Uint8Array(N), s = new Float32Array(N), grp = new THREE.Group(); grp.add(P.pts); root.add(grp);
    const cc = curves.cool, S = cc ? { eng: samp(cc.eng), up: samp(cc.up), rad: samp(cc.rad), lo: samp(cc.lo), by: samp(cc.by) } : null, order = ['eng', 'up', 'rad', 'lo', 'by'];
    const air = !cc, lanes = [];
    if (air) for (let k = 0; k < 24; k++) { const y = K.y0 + (K.roof + 1.2 * K.B - K.y0) * (k + 0.5) / 24, z = (k % 3 - 1) * 0.6 * B; lanes.push(samp(new THREE.LineCurve3(V(K.xmin - 3 * B, y, z), V(K.xmax + 2 * B, y, z)), 40)); }
    for (let i = 0; i < N; i++) { path[i] = air ? i % lanes.length : i % 4 === 0 ? 4 : i % 2 ? 0 : 1 + (i % 3); s[i] = Math.random(); }
    const col = new THREE.Color(), pos = V();
    return {
      obj: grp, dispose: P.dispose,
      update(St) {
        const st = St.st, th = st && st.heat, dtv = St.dt;
        for (let i = 0; i < N; i++) {
          let x;
          if (air) {
            const L = lanes[path[i]]; s[i] += (0.6 + Math.abs(st ? st.kmh : 0) / 3.6) * 25 * dtv / L.len; if (s[i] > 1) s[i] -= 1;   // vento (escala visual)
            x = at(L, s[i] * L.len, pos); const hot = clamp((x.x - K.xmin) / (K.xmax - K.xmin), 0, 1) * (x.x > K.xmin && x.x < K.xmax ? 1 : x.x >= K.xmax ? 1 : 0);
            heatColor(25 + hot * ((th ? th.head : 60) - 25) * 0.5, col);
          } else {
            const nm = order[path[i]], L = S[nm], flow = th ? (th.lvlC > 0.02 && St.inp.cool === 'liquid' ? 0.35 + (st.rpm / 6000) : 0) : 0.3;
            s[i] += flow * 80 * dtv / L.len;                                    // bomba ∝ rotação (escala visual, cm/s)
            if (s[i] >= 1) { s[i] -= 1; path[i] = nm === 'eng' ? (Math.random() < (th ? 0.05 + 0.95 * th.thermo : 0.5) ? 1 : 4) : nm === 'up' ? 2 : nm === 'rad' ? 3 : 0; }
            x = at(S[order[path[i]]], s[i] * S[order[path[i]]].len, pos);
            const Tc = th ? th.cool : 80, dT = 8, T = nm === 'eng' ? Tc - 6 + 6 * s[i] : nm === 'up' ? Tc : nm === 'rad' ? Tc - (dT + 10) * s[i] : nm === 'lo' ? Tc - dT - 10 : Tc;
            heatColor(T, col);
            if (th && th.lvlC <= 0.02) { P.size[i] = 0; continue; }
          }
          P.pos[i * 3] = x.x; P.pos[i * 3 + 1] = x.y; P.pos[i * 3 + 2] = x.z; P.col[i * 3] = col.r; P.col[i * 3 + 1] = col.g; P.col[i * 3 + 2] = col.b; P.size[i] = (air ? 0.06 : 0.075) * B;
        }
        P.mat.uniforms.k.value = camK(); P.flush();
      },
    };
  }
  // óleo: cárter → pescador → bomba → galeria principal → mancais / cabeçote / turbo → volta ao cárter; jatos sob os pistões
  function oilFX() {
    const B = K.B, N = 800, P = P3.points(N, true), grp = new THREE.Group(); grp.add(P.pts); root.add(grp);
    const o = curves.oil, routes = [];
    if (o) {
      const base = [o.pick, o.gal];
      o.feeds.forEach(f => routes.push(base.concat([f]).map(c => samp(c, 60))));
      if (o.riser) routes.push(base.concat([o.riser, o.headG, o.drain]).map(c => samp(c, 60)));
      if (o.turbo) routes.push(base.concat([o.turbo]).map(c => samp(c, 60)));
      if (!routes.length) routes.push(base.map(c => samp(c, 60)));            // rotativo: bomba → galeria do eixo
    }
    const jets = g.two || g.rot ? [] : cyls.map(c => ({ c, p: c.G.localToWorld(c.jet.clone()) }));
    const rt = new Uint8Array(N), seg = new Uint8Array(N), s = new Float32Array(N), pos = V(), col = new THREE.Color(0xd9921c), mist = g.two;
    for (let i = 0; i < N; i++) { rt[i] = routes.length ? i % (routes.length + (jets.length ? 1 : 0)) : 0; seg[i] = 0; s[i] = Math.random(); }
    return {
      obj: grp, dispose: P.dispose,
      update(St) {
        const th = St.st && St.st.heat, pr = th ? th.pOil : 0, sp = 0.15 + 0.5 * clamp(pr / 4, 0, 1.3), dtv = St.dt, Tn = th ? th.oil : 80;
        col.setRGB(0.85, 0.55 - clamp((Tn - 60) / 200, 0, 0.3), 0.1);
        for (let i = 0; i < N; i++) {
          if (mist) { // 2 tempos: névoa de óleo no cárter de cada cilindro
            const c = cyls[i % cyls.length], a = Math.random() * TAU, r = Math.random() * (K.a + 0.4 * B);
            pos.set(c.G.position.x + (Math.random() - 0.5) * 0.8 * B, r * Math.cos(a), r * Math.sin(a));
            P.pos[i * 3] = pos.x; P.pos[i * 3 + 1] = pos.y; P.pos[i * 3 + 2] = pos.z; P.col[i * 3] = 0.85; P.col[i * 3 + 1] = 0.6; P.col[i * 3 + 2] = 0.2; P.size[i] = 0.04 * B * (St.st && St.st.lph > 0 ? 1 : 0.3); continue;
          }
          if (rt[i] === routes.length) { // jato: do bico para baixo do pistão
            const j = jets[i % jets.length]; s[i] += dtv * (pr > 0.5 ? 3 : 0); if (s[i] > 1) s[i] -= 1;
            const cw = j.c.G.localToWorld(V(0, K.roof - K.hl + s[i] * 0.9 * K.hl, -j.c.sg * 0.3 * B * (1 - s[i])));
            P.pos[i * 3] = cw.x; P.pos[i * 3 + 1] = cw.y; P.pos[i * 3 + 2] = cw.z; P.size[i] = pr > 0.5 ? 0.05 * B : 0;
          } else {
            const R0 = routes[rt[i]]; if (!R0) { P.size[i] = 0; continue; }
            const L = R0[seg[i]]; s[i] += sp * 60 * dtv / L.len * (pr > 0.05 ? 1 : 0);              // vazão ∝ pressão (escala visual, cm/s)
            if (s[i] >= 1) { s[i] -= 1; seg[i]++; if (seg[i] >= R0.length) { seg[i] = 0; } }
            const p = at(R0[seg[i]], s[i] * R0[seg[i]].len, pos);
            P.pos[i * 3] = p.x; P.pos[i * 3 + 1] = p.y; P.pos[i * 3 + 2] = p.z; P.size[i] = 0.06 * B;
          }
          P.col[i * 3] = col.r; P.col[i * 3 + 1] = col.g; P.col[i * 3 + 2] = col.b;
        }
        P.mat.uniforms.k.value = camK(); P.flush();
      },
    };
  }
  function focus(name) {
    if (fx) { if (fx.obj.parent) fx.obj.parent.remove(fx.obj); fx.dispose(); fx = null; }
    focusName = name && views[name] ? name : null;
    for (const set in labels) for (const s of labels[set]) s.visible = set === focusName;
    if (gb && gb.labels) gb.labels.forEach(s => { s.visible = focusName === 'gearbox'; });
    for (const o of [exG, coolG, oilG, hdrG, gb && gb.group, ...finGs]) if (o) o.visible = true;
    if (focusName && hide[focusName]) for (const o of hide[focusName]) if (o) o.visible = false;
    ghost(focusName === 'exhaust' ? [hdrG, exG, chg && chg.group] : focusName === 'turbo' ? [chg && chg.group] : focusName === 'gearbox' ? [gb && gb.group] : null);
    panK = focusName ? 0.3 : 0;                                                  // o painel de explicação cobre ~30% à direita: o desenho anda para a esquerda
    const v = focusName ? views[focusName] : home;
    if (v && v.t) { const to = Object.assign({}, v); if (v.box) to.r = fitR(v.box, v.m); tween.from = { t: orb.t.clone(), r: orb.r, yaw: orb.yaw, pitch: orb.pitch }; tween.to = to; tween.k = 0; tween.t0 = performance.now(); }
    if (focusName && v.make) fx = v.make();
    return focusName;
  }

  // ---------- animação ----------
  function gasColor(m, T, X) {
    if (!m.emissive) return;                                                     // peça em modo fantasma
    const h = clamp((T - 600) / 1900, 0, 1), c = m.color;
    if (h < 0.5) c.copy(cCold).lerp(cMid, h * 2); else c.copy(cMid).lerp(cHot, h * 2 - 1);
    c.lerp(cFresh, clamp(1 - X, 0, 1) * 0.9); m.emissive.copy(c).multiplyScalar(h * X * 1.3);
  }
  const tc0 = new THREE.Color(), glowC = new THREE.Color();
  function glowOf(T, out) { const h = clamp((T - 480) / 420, 0, 1); return out.setRGB(h * 0.9, h * h * 0.25, 0); }  // brilho de metal em brasa
  function tint(mat, T, baseKey, heat) {
    if (heat) { heatColor(T, mat.color); mat.emissive.copy(mat.color).multiplyScalar(0.18); }
    else { mat.color.copy(M.base[baseKey] || mat.color); glowOf(T, mat.emissive); }
  }
  function update(S) { // S: { thv, st, tr, tps, eoi, dtv, dt, fuel, inp }
    if (!g) return;
    const st = S.st, tr = S.tr, C = g.cyc, adv = st ? st.adv : 0, spk = (2 * C - adv) % C, fired = st && st.fired > 0;
    cur.st = st;
    if (tr && tr !== trRef) { trRef = tr; miMax = meMax = 1e-6; for (let k = 0; k < C; k++) { miMax = Math.max(miMax, tr.mi[k]); meMax = Math.max(meMax, tr.me[k]); } }
    crank.rotation.x = S.thv * DEG;
    plight.intensity *= 0.82;
    if (!g.rot) {
      const { B, a, L, ch, roof } = K, pwDeg = st ? st.pw / 1000 * 6 * st.rpm : 0, pi = (g.ivo + g.ivc) / 2, pe = (g.evo + g.evc) / 2, X0 = tr ? tr.X[g.ivc | 0] : 0;
      const lift = tr && tr.li && !g.two;                                       // levante real (com flutuação)
      for (const c of cyls) {
        const tc = ((S.thv - c.off) % C + C) % C, ps = tc * DEG, py = a * Math.cos(ps), pz = a * Math.sin(ps), yp = py + Math.sqrt(L * L - pz * pz), top = yp + ch;
        c.rod.position.set(0, py, pz); c.rod.rotation.x = Math.atan2(-pz, yp - py);
        c.pis.position.y = top - 0.03 * B;
        c.gas.position.y = (top + roof) / 2; c.gas.scale.y = Math.max(roof - top, 0.01);
        const b = tc | 0, T = tr ? tr.T[b] : 300, X = tr ? tr.X[b] : 0;
        gasColor(c.gasMat, T, X);
        const xb = clamp((X - X0) / Math.max(1e-3, 1 - X0), 0, 1), burn = (tc < 220 || tc > C - 80) && xb > 0.004 && xb < 0.995;
        c.flame.visible = burn && !ghosted.length;
        if (burn) { c.flame.scale.setScalar(Math.cbrt(xb) * 0.6 * B); c.flame.material.opacity = 0.6 * (1 - 0.7 * xb); }
        const j = (tc * 2) | 0, li = (lift ? tr.li[b] : g.Li[j]) * U, le = (lift ? tr.le[b] : g.Le[j]) * U;
        for (const v of c.vi) v.set(li);
        for (const v of c.ve) v.set(le);
        if (c.ci) { c.ci.rotation.x = (tc - pi) / 2 * DEG; c.ce.rotation.x = (tc - pe) / 2 * DEG; }
        if (c.reed) { const o = (C === 360 && tc > 190 ? Math.sin((tc - 190) / 210 * Math.PI) : 0) * (0.15 + 0.6 * S.tps); c.reed.forEach(p => { p.rotation.x = p.userData.s * o * 0.5; }); }
        const sk = !!fired && inWin(tc, spk, spk + 12, C);
        c.sparks.forEach(p => { p.visible = sk && !ghosted.length; });
        if (sk) { plight.position.copy(c.G.localToWorld(V(0, roof - 0.1 * B, 0))); plight.intensity = 3; }
        if (c.spray) c.spray.visible = !ghosted.length && pwDeg > 0 && inWin(tc, S.eoi - pwDeg, S.eoi, C);
        if (c.thr) c.thr.rotation.x = (7 + 83 * S.tps) * DEG;
        if (c.i === 0) {
          cur.mi = tr ? tr.mi[b] / miMax : 0; cur.me = tr ? Math.max(0, tr.me[b]) / meMax : 0;
          S.fx0 = tr && { tc, tr, li: g.Li[j], le: g.Le[j], crown: top, xb: burn ? xb : X > X0 + 0.5 && tc < 450 ? 1 : 0, T, Tex: (st ? st.egt : 30) + 273, mi: cur.mi, me: cur.me, swirl: st ? Math.min(1, st.rpm / g.limit) : 0 };
        }
      }
      if (plThr) plThr.rotation.y = (7 + 83 * S.tps) * DEG;
    } else {
      const e = g.e * U, Rr = g.Rg * U, nR = g.n;
      for (const t of rotors) {
        const psi = (S.thv + 3 * t.phi0) * DEG, ra = (S.thv / 3 + t.phi0) * DEG, cu = e * Math.cos(psi), cv = e * Math.sin(psi);
        t.rot.position.set(t.x, cv, -cu); t.rot.rotation.x = ra; t.lobe.position.set(t.x, cv, -cu);
        let plugOn = false;
        for (let k = 0; k < 3; k++) {
          const a0 = ra + k * 120 * DEG, a1 = a0 + 120 * DEG, arr = t.gas[k].geometry.attributes.position.array, pts = [];
          for (let q = 0; q <= 24; q++) pts.push(troch(e, Rr, a0 + (a1 - a0) * q / 24));
          const A0 = [cu + 0.985 * Rr * Math.cos(a0), cv + 0.985 * Rr * Math.sin(a0)], A1 = [cu + 0.985 * Rr * Math.cos(a1), cv + 0.985 * Rr * Math.sin(a1)], mid = a0 + 60 * DEG;
          const Cc = [cu + 0.74 * Rr * Math.cos(mid), cv + 0.74 * Rr * Math.sin(mid)];
          for (let q = 1; q < 12; q++) { const s = 1 - q / 12, z = 1 - s; pts.push([z * z * A1[0] + 2 * z * s * Cc[0] + s * s * A0[0], z * z * A1[1] + 2 * z * s * Cc[1] + s * s * A0[1]]); }
          let mu = 0, mv = 0; pts.forEach(p => { mu += p[0]; mv += p[1]; }); mu /= pts.length; mv /= pts.length;
          let o = 0;
          for (let q = 0; q < pts.length && o <= arr.length - 9; q++) {
            const p0 = pts[q], p1 = pts[(q + 1) % pts.length];
            arr[o++] = t.x; arr[o++] = mv; arr[o++] = -mu; arr[o++] = t.x; arr[o++] = p0[1]; arr[o++] = -p0[0]; arr[o++] = t.x; arr[o++] = p1[1]; arr[o++] = -p1[0];
          }
          t.gas[k].geometry.attributes.position.needsUpdate = true;
          const off = ((-360 * k + t.r * 360 / nR) % 1080 + 1080) % 1080, tc = ((S.thv - off) % C + C) % C;
          gasColor(t.gas[k].material, tr ? tr.T[tc | 0] : 300, tr ? tr.X[tc | 0] : 0);
          if (fired && inWin(tc, spk, spk + 15, C)) plugOn = true;
          if (t.r === 0 && k === 0) { cur.mi = tr ? tr.mi[tc | 0] / miMax : 0; cur.me = tr ? Math.max(0, tr.me[tc | 0]) / meMax : 0; }
        }
        t.plugs.forEach(p => { p.visible = plugOn; });
        if (plugOn) { plight.position.copy(t.plugs[0].position); plight.intensity = 3; }
      }
    }
    const egt = st ? st.egt : 20;
    glowOf(0.62 * egt, M.header.emissive); M.hdrTint.emissive.copy(M.header.emissive); glowOf(0.45 * egt, M.pipe.emissive);           // parede do tubo bem mais fria que o gás
    // temperaturas das peças (rede térmica): mapa de calor no foco do arrefecimento/óleo, brasa quando passa de ~480 °C
    const th = st && st.heat;
    if (th) {
      const heat = focusName === 'cooling' || focusName === 'oil';
      for (const b of banks) {
        tint(b.mH, th.head, 'castAlu', heat); tint(b.mB, (th.lin + th.blk) / 2, 'castBlk', heat); tint(b.mC, th.head - 30, 'cover', heat);
        if (heat) { heatColor(th.head, b.mS.color); b.mS.color.multiplyScalar(0.9); } else b.mS.color.setHex(0xc9553a);
        const filled = th.lvlC > 0.02 && coolKey === 'liquid';
        if (filled) heatColor(th.cool, b.mJ.color); else b.mJ.color.setHex(0x2a2f36);
        b.mJ.emissive.copy(b.mJ.color).multiplyScalar(filled ? 0.35 : 0);
      }
      tint(M.pis, th.pis, 'pis', heat); glowOf(th.ev, M.exv.emissive); if (heat) heatColor(th.ev, M.exv.color); else M.exv.color.setHex(0x8d96a1);
      if (heat) { heatColor(th.lin, M.liner.color); M.liner.opacity = 0.35; } else { M.liner.color.copy(M.base.liner); M.liner.opacity = 0.12; }
      if (M.housing) { if (heat) { heatColor(th.lin, M.housing.color); M.housing.opacity = 0.4; } else { M.housing.color.setHex(0x9bb6d4); M.housing.opacity = 0.16; } }
      heatColor(th.cool, M.hoseHot.color); M.hoseHot.color.lerp(tc0.setHex(0x17191c), heat ? 0.2 : 0.75);
      heatColor(th.cool - 12, M.hoseCold.color); M.hoseCold.color.lerp(tc0.setHex(0x17191c), heat ? 0.2 : 0.75);
      if (heat) heatColor(th.cool - 6, M.radCore.color); else M.radCore.color.setHex(0x4a525b);
      // óleo: nível no cárter e cor; bronzinas pela película (verde = hidrodinâmico, âmbar = misto, vermelho = limite)
      if (oilBox) { const lv = clamp(S.inp ? S.inp.oilLvl : 1, 0, 1.2), d = oilBox.userData; oilBox.visible = lv > 0.01 && !g.two; oilBox.scale.y = Math.max(0.001, lv * d.h); oilBox.position.y = d.y + lv * d.h / 2; }
      const reg = l => l < 1 ? 0xff3b3b : l < 3 ? 0xffb020 : 0x3ecf8e;
      M.brgMain.color.setHex(reg(th.lam.mancal)); M.brgRod.color.setHex(reg(th.lam.biela));
      glowC.setRGB(clamp((th.brg - 150) / 90, 0, 1), clamp((th.brg - 200) / 120, 0, 0.4), 0); M.brgMain.emissive.copy(glowC); M.brgRod.emissive.copy(glowC);
    }
    if (fan) fan.rotation.x += (th && th.fan ? 18 : 0) * S.dt;
    if (gb) gb.update(st, S.dtv, S.dt, S.thv);
    if (chg) chg.update(st, S.dtv);
    if (fx) fx.update(S);
  }

  function render(dt) {
    const el = R.domElement, w = el.clientWidth, h = el.clientHeight;
    if (w !== size[0] || h !== size[1]) { size = [w, h]; R.setSize(w, h, false); cam.aspect = w / Math.max(h, 1); cam.updateProjectionMatrix(); }
    if (tween.k < 1 && tween.to) {
      tween.k = Math.min(1, (performance.now() - tween.t0) / 900);
      const e = tween.k * tween.k * (3 - 2 * tween.k), f = tween.from, t = tween.to;
      const dy = Math.atan2(Math.sin(t.yaw - f.yaw), Math.cos(t.yaw - f.yaw));
      orb.t.lerpVectors(f.t, t.t, e); orb.r = f.r + (t.r - f.r) * e; orb.yaw = f.yaw + dy * e; orb.pitch = f.pitch + (t.pitch - f.pitch) * e;
    }
    cam.position.set(orb.t.x + orb.r * Math.cos(orb.pitch) * Math.sin(orb.yaw), orb.t.y + orb.r * Math.sin(orb.pitch), orb.t.z + orb.r * Math.cos(orb.pitch) * Math.cos(orb.yaw));
    cam.lookAt(orb.t);
    if (panK) cam.setViewOffset(w, h, w * panK / 2, 0, w, h); else if (cam.view && cam.view.enabled) cam.clearViewOffset();
    cam.updateMatrixWorld();
    if (focusName) declutter();
    R.render(scene, cam);
  }
  function camK() { return size[1] * R.getPixelRatio() / (2 * Math.tan(cam.fov * DEG / 2)); }
  // rótulos do foco: ~15 px de altura na tela e empurrados para cima quando um cobriria o outro
  const upV = V(), tmpV = V();
  function declutter() {
    const set = focusName === 'gearbox' ? (gb && gb.labels) || [] : labels[focusName] || [];
    if (!set.length) return;
    const H = size[1], W = size[0], placed = [], tf = 2 * Math.tan(cam.fov * DEG / 2);
    upV.set(0, 1, 0).applyQuaternion(cam.quaternion);
    for (const s of set) {
      const u = s.userData; if (!u.base) { u.base = s.position.clone(); u.ar = s.scale.x / s.scale.y; }
      s.position.copy(u.base);
      s.getWorldPosition(tmpV); const dist = cam.position.distanceTo(tmpV), wpp = dist * tf / H;
      s.scale.set(15 * wpp * u.ar, 15 * wpp, 1);
      tmpV.project(cam); if (tmpV.z > 1) continue;
      const x = (tmpV.x + 1) / 2 * W, y0 = (1 - tmpV.y) / 2 * H, w = 15 * u.ar, h = 15;
      let y = y0, k = 0;
      while (k++ < 10 && placed.some(r => Math.abs(r.x - x) < (r.w + w) / 2 + 4 && Math.abs(r.y - y) < (r.h + h) / 2 + 2)) y -= h + 3;
      if (y !== y0) s.position.addScaledVector(upV, (y0 - y) * wpp);
      placed.push({ x, y, w, h });
    }
  }

  return { init, build, update, render, focus, setExhaust, setCooling, get focusName() { return focusName; }, get fx() { return fx; }, set onPick(f) { onPick = f; }, set onHover(f) { onHover = f; } };
})();
