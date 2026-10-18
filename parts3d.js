// Peças 3D auxiliares: engrenagens, turbo/supercharger e partículas (câmara, dutos). Câmbios em trans3d.js.
// Unidades da cena: cm. Tudo que gira recebe o tempo "visual" (dt real × escala de tempo).
const P3 = !window.THREE ? null : (() => {
  const DEG = Math.PI / 180, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

  // extruda um Shape do plano XY com a espessura ao longo de X (forma fica no plano YZ: x→−z, y→y)
  function extrudeX(shape, depth, bevel = 0) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 20 });
    geo.translate(0, 0, -depth / 2); geo.rotateY(Math.PI / 2);
    return geo;
  }
  const cylX = (r, h, mat, seg = 24) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.rotation.z = Math.PI / 2; return m; };
  function label(text, size, color = '#ffd28a') { // número/rotulo como sprite
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.font = '700 76px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = color; x.fillText(text, 64, 68);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.set(size, size, 1);
    return s;
  }

  function text(t, h, color = '#ffd28a') { // rótulo com fundo escuro, sempre por cima (aparece nas vistas de zoom)
    const W = Math.max(256, Math.ceil(t.length * 36 + 60)), c = document.createElement('canvas'); c.width = W; c.height = 96;
    const x = c.getContext('2d'); x.font = '600 56px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(11,15,20,0.78)'; const w = Math.min(W, x.measureText(t).width + 40); x.fillRect(W / 2 - w / 2, 8, w, 80); x.fillStyle = color; x.fillText(t, W / 2, 50);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false }));
    s.scale.set(h * W / 96, h, 1); s.renderOrder = 20;
    return s;
  }
  function gearShape(z, m, hole) {
    const s = new THREE.Shape(), rp = m * z / 2, ra = rp + m, rf = rp - 1.25 * m, t = 2 * Math.PI / z;
    for (let i = 0; i < z; i++) {
      const a = i * t;
      [[rf, a], [rf, a + t * 0.12], [ra, a + t * 0.32], [ra, a + t * 0.5], [rf, a + t * 0.7]].forEach(([r, b], j) => {
        const x = r * Math.cos(b), y = r * Math.sin(b);
        if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
      });
    }
    s.closePath();
    if (hole) { const h = new THREE.Path(); h.absarc(0, 0, hole, 0, 2 * Math.PI, true); s.holes.push(h); }
    return s;
  }

  // voluta (caracol): espiral em volta do rotor cuja seção cresce até a saída (a vazão vai se somando)
  function volute(R0, R1, tube, x, mat, a0 = 0) {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = a0 + t * 1.9 * Math.PI, r = R0 + (R1 - R0) * t; pts.push(V(x, r * Math.cos(a), r * Math.sin(a))); }
    pts.push(V(x, R1 * 1.42 * Math.cos(a0 - 0.686), R1 * 1.42 * Math.sin(a0 - 0.686)));
    const curve = new THREE.CatmullRomCurve3(pts), m = varTube(curve, u => tube * (0.3 + 0.7 * Math.min(1, u * 1.15)), 90, 18, mat);
    return { mesh: m, curve };
  }
  function varTube(curve, rf, n, m, mat) { // tubo de raio variável
    const F = curve.computeFrenetFrames(n, false), pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPointAt(u), N = F.normals[i], Bn = F.binormals[i], r = rf(u);
      for (let j = 0; j <= m; j++) { const a = j / m * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a); pos.push(p.x + r * (c * N.x + sn * Bn.x), p.y + r * (c * N.y + sn * Bn.y), p.z + r * (c * N.z + sn * Bn.z)); }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const q = i * (m + 1) + j, w = q + m + 1; idx.push(q, w, q + 1, w, w + 1, q + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; return mesh;
  }
  const lathe = (pts, mat, seg = 48) => { const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat); m.rotation.z = -Math.PI / 2; m.castShadow = true; return m; }; // eixo do torno = +x
  // rotor centrífugo/radial: o ar entra pelo eixo (indutor) e sai pela borda (exdutor) — ou o contrário na turbina.
  // Linha do cubo e linha da ponta da pá são quartos de elipse; a pá torce (θ) do indutor ao exdutor.
  function rotor(s, sx, n, split, wrap, back, mat, hubMat) {
    const G = new THREE.Group(), C = [1.35 * s, 0.98 * s];
    const hubL = t => { const f = 1.5 * Math.PI - t * Math.PI / 2; return [C[0] + 0.73 * s * Math.cos(f), C[1] + 0.76 * s * Math.sin(f)]; };
    const tipL = t => { const f = 1.5 * Math.PI - t * Math.PI / 2; return [C[0] + 0.61 * s * Math.cos(f), C[1] + 0.30 * s * Math.sin(f)]; };
    const hub = []; for (let i = 0; i <= 18; i++) { const [xx, r] = hubL(i / 18); hub.push([r, sx * xx]); }
    hub.unshift([0.001, sx * 1.42 * s]); hub.push([0.98 * s, sx * 0.6 * s], [0.001, sx * 0.6 * s]);
    const h = lathe(sx > 0 ? hub.reverse() : hub, hubMat, 40); G.add(h);
    const blade = t0 => {
      const Nt = 16, Ns = 4, pos = [], idx = [];
      for (let i = 0; i <= Nt; i++) {
        const t = t0 + (1 - t0) * i / Nt, [xh, rh] = hubL(t), [xs, rs] = tipL(t), th = wrap * (1 - t) * (1 - t) - back * t;
        for (let j = 0; j <= Ns; j++) { const f = j / Ns, xx = xh + (xs - xh) * f, r = rh + (rs - rh) * f; pos.push(sx * xx, r * Math.cos(th), r * Math.sin(th)); }
      }
      for (let i = 0; i < Nt; i++) for (let j = 0; j < Ns; j++) { const q = i * (Ns + 1) + j, w = q + Ns + 1; idx.push(q, w, q + 1, w, w + 1, q + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    };
    const gm = blade(0), gs = split ? blade(0.42) : null;
    for (let k = 0; k < n; k++) {
      const a = k / n * 2 * Math.PI, b1 = new THREE.Mesh(gm, mat); b1.rotation.x = a; b1.castShadow = true; G.add(b1);
      if (gs) { const b2 = new THREE.Mesh(gs, mat); b2.rotation.x = a + Math.PI / n; G.add(b2); }          // pás intermediárias (splitters)
    }
    const nut = cylX(0.12 * s, 0.25 * s, hubMat, 6); nut.position.x = sx * 1.5 * s; G.add(nut);
    const blur = new THREE.Mesh(new THREE.RingGeometry(0.2 * s, 0.98 * s, 40), new THREE.MeshBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    blur.rotation.y = Math.PI / 2; blur.position.x = sx * 0.95 * s; G.add(blur); G.userData.blur = blur;
    return G;
  }
  // Turbo (turbina + compressor no mesmo eixo) ou supercharger centrífugo (compressor + polia), em corte:
  // as carcaças são cortadas pelo plano do eixo voltado para a câmera (chg.plane, em coordenadas do mundo)
  function charger(type, s, M) {
    const G = new THREE.Group(), turbo = type === 'turbo', plane = new THREE.Plane(V(0, 0, -1), 0);
    const cut = m => { const c = m.clone(); c.clippingPlanes = [plane]; c.clipShadows = true; c.side = THREE.DoubleSide; c.transparent = false; c.opacity = 1; c.depthWrite = true; return c; };
    const mAlu = cut(M.alu), mHot = cut(M.hot), mCore = cut(M.forged), anch = {};
    // compressor: rotor de alumínio com pás inteiras + intermediárias, voluta, bocal de entrada
    const cw = rotor(s, 1, 7, true, 0.95, 0.35, M.alu.clone(), M.forged); G.add(cw); cw.userData.part = 'compWheel';
    cw.children.forEach(o => { if (o.material && o.material.transparent && o !== cw.userData.blur) { o.material = o.material.clone(); o.material.transparent = false; o.material.opacity = 1; o.material.depthWrite = true; } });
    const comp = volute(1.15 * s, 1.9 * s, 0.75 * s, 0.75 * s, mAlu); G.add(comp.mesh);
    const shroud = []; for (let i = 0; i <= 14; i++) { const t = i / 14, f = 1.5 * Math.PI - t * Math.PI / 2; shroud.push([0.98 * s + 0.36 * s * Math.sin(f) + 0.06 * s, 1.35 * s + 0.65 * s * Math.cos(f)]); }
    shroud.unshift([0.76 * s, 2.3 * s]); G.add(lathe(shroud.reverse(), mAlu));
    const inlet = lathe([[0.95 * s, 2.3 * s], [0.95 * s, 3.0 * s], [1.1 * s, 3.05 * s]], mAlu); G.add(inlet);
    const filt = lathe([[1.0 * s, 3.05 * s], [1.45 * s, 3.3 * s], [1.45 * s, 4.3 * s], [1.0 * s, 4.6 * s], [0.001, 4.6 * s]], M.black, 32); G.add(filt);  // filtro cônico
    anch.cw = V(1.0 * s, 1.3 * s, 0); anch.comp = V(0.75 * s, -2.0 * s, 0); anch.cout = V(0.9 * s, 2.6 * s, -1.7 * s);
    // carcaça central: eixo, mancais flutuantes em banho de óleo, entrada e retorno de óleo
    const chra = cylX(0.62 * s, 1.1 * s, mCore, 32); chra.userData.part = 'chra'; chra.position.x = -0.05 * s; G.add(chra);
    const shaft = cylX(0.1 * s, 2.4 * s, M.steel, 12); shaft.position.x = 0.1 * s; G.add(shaft);
    for (const xb of [-0.35 * s, 0.3 * s]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.17 * s, 0.06 * s, 8, 24), M.brass || M.alu); b.rotation.y = Math.PI / 2; b.position.x = xb; G.add(b); }
    const oilIn = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.1 * s, 0.6 * s, 10), mCore); oilIn.position.set(0, 0.85 * s, 0); G.add(oilIn);
    const oilOut = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 0.6 * s, 10), mCore); oilOut.position.set(0, -0.85 * s, 0); G.add(oilOut);
    anch.chra = V(0, 1.3 * s, 0);
    let tw = null, turb = null, pulley = null, flap = null, rod = null, bov = null, rod0 = null;
    if (turbo) { // turbina: rotor de Inconel (sem splitters), voluta de ferro fundido, saída para o downpipe, wastegate
      tw = rotor(0.92 * s, -1, 11, false, 0.6, 0, M.forged, M.forged); G.add(tw); tw.userData.part = 'turbWheel';
      turb = volute(1.05 * s, 1.75 * s, 0.7 * s, -0.75 * s, mHot, 3.57); G.add(turb.mesh);             // a boca larga fica embaixo, onde chega o coletor
      const ts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, f = 1.5 * Math.PI - t * Math.PI / 2; ts.push([0.9 * s + 0.33 * s * Math.sin(f) + 0.06 * s, -(1.24 * s + 0.6 * s * Math.cos(f))]); }
      ts.unshift([0.75 * s, -2.3 * s]); G.add(lathe(ts, mHot));
      const down = lathe([[0.85 * s, -2.3 * s], [0.85 * s, -3.0 * s]], mHot); G.add(down);
      anch.tin = turb.curve.getPoint(1); const fl = cylX(0.85 * s, 0.12 * s, M.steel, 24); fl.rotation.set(0, 0, 0); fl.position.copy(anch.tin); G.add(fl);   // flange de entrada
      flap = new THREE.Group(); flap.position.set(-2.05 * s, -0.55 * s, 0); G.add(flap); flap.userData.part = 'wastegate';                  // portinhola da wastegate (desvia gás antes do rotor)
      const disc = cylX(0.24 * s, 0.05 * s, M.steel, 20); disc.position.y = -0.35 * s; flap.add(disc);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.4 * s, 0.08 * s), M.steel); arm.position.y = -0.2 * s; flap.add(arm);
      const act = cylX(0.35 * s, 0.5 * s, M.dark, 24); act.userData.part = 'wastegate'; act.rotation.set(0, 0, 0); act.position.set(-1.0 * s, -1.0 * s, 1.6 * s); G.add(act);  // atuador (diafragma com pressão do coletor)
      rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 1.4 * s, 8), M.steel); rod.rotation.x = Math.PI / 2; rod.position.set(-1.0 * s, -1.0 * s, 0.85 * s); G.add(rod); rod0 = rod.position.z;
      anch.tw = V(-1.0 * s, 1.3 * s, 0); anch.wg = V(-2.1 * s, -1.2 * s, 0.4 * s); anch.turb = V(-0.75 * s, -2.0 * s, 0);
    } else { // supercharger centrífugo: polia + multiplicador interno
      pulley = new THREE.Group(); pulley.position.x = -0.9 * s; G.add(pulley);
      pulley.add(cylX(0.9 * s, 0.6 * s, M.dark, 32));
      for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 1.6 * s, 0.12 * s), M.steel); sp.rotation.x = k * Math.PI / 3; pulley.add(sp); }
      anch.pul = V(-0.9 * s, 1.2 * s, 0);
    }
    // válvula de alívio (BOV) na saída do compressor
    const bovG = new THREE.Group(); bovG.position.set(0.9 * s, 2.25 * s, -1.2 * s); G.add(bovG); bovG.userData.part = 'bov';
    bovG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.28 * s, 0.4 * s, 16), M.dark));
    bov = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 0.08 * s, 16), M.copper); bov.position.y = -0.24 * s; bovG.add(bov);
    anch.bov = V(0.9 * s, 2.7 * s, -1.2 * s);
    let a = 0;
    return {
      group: G, turbo, pulley, plane, anch, compCurve: comp.curve, turbCurve: turb && turb.curve,
      update(st, dtv) {
        if (!st) return;
        const w = st.trpm * Math.PI / 30, wv = Math.min(w * dtv, 0.5);           // gira no máx. ~0,5 rad/quadro (senão vira borrão)
        a += wv; cw.rotation.x = a; if (tw) tw.rotation.x = a; if (pulley) pulley.rotation.x = a * 0.25;
        const blur = clamp(w * dtv / 0.5 - 0.6, 0, 0.45);
        cw.userData.blur.material.opacity = blur; if (tw) tw.userData.blur.material.opacity = blur;
        if (turbo) {
          mHot.emissive.setRGB(clamp((st.egt - 450) / 500, 0, 1) * 0.7, clamp((st.egt - 650) / 500, 0, 1) * 0.2, 0);
          const o = clamp((st.wg || 0) / 100, 0, 1); flap.rotation.z = o * 0.7; rod.position.z = rod0 - o * 0.25 * s;
        }
        bov.position.y = -0.24 * s + (st.bov ? 0.14 * s : 0);
      },
    };
  }

  // Sistema de pontos com tamanho/cor por partícula (esferinhas sombreadas, visíveis sobre qualquer fundo)
  const VS = 'attribute float size; attribute vec3 col; varying vec3 vC; uniform float k; void main(){ vC = col; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * k / -mv.z; gl_Position = projectionMatrix * mv; }';
  const FS = 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vC * (1.15 - 1.2 * r), smoothstep(0.25, 0.12, r)); }';
  function points(n, xray) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('col', new THREE.BufferAttribute(col, 3)); geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { k: { value: 500 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 10;
    if (xray) mat.depthTest = false;                                           // visível através das paredes do tubo
    return { pts, pos, col, size, n, mat, flush() { for (const k of ['position', 'col', 'size']) geo.attributes[k].needsUpdate = true; },
      dispose() { geo.dispose(); mat.dispose(); } };
  }
  const SPEC = [ // espécie: cor, tamanho
    [0.45, 0.55, 0.70, 0.7],  // 0 N₂
    [0.35, 0.80, 1.00, 0.8],  // 1 O₂
    [1.00, 0.62, 0.15, 1.3],  // 2 gasolina
    [0.40, 1.00, 0.50, 1.2],  // 3 etanol
    [0.80, 0.45, 1.00, 1.0],  // 4 aditivos
    [0.55, 0.50, 0.48, 0.9],  // 5 CO₂
    [0.80, 0.90, 1.00, 0.8],  // 6 H₂O
  ];
  function heat(T, out, burnt) { // cor de corpo negro aproximada
    const h = clamp((T - 500) / 2000, 0, 1);
    if (burnt) { out[0] = 0.5 + 0.5 * h + 0.3 * h * h; out[1] = 0.12 + 0.75 * h * h; out[2] = 0.05 + 0.5 * h * h * h; }
    return h;
  }

  // Partículas fluindo por um caminho (curva): escape, admissão, turbo
  function flow(curves, n, radius, colorFn) {
    const P = points(n, true), samples = curves.map(c => { const F = c.computeFrenetFrames(120, false); return { pts: c.getSpacedPoints(120), F }; });
    const u = new Float32Array(n), path = new Uint8Array(n), ang = new Float32Array(n), rad = new Float32Array(n), c3 = [0, 0, 0];
    for (let i = 0; i < n; i++) { u[i] = Math.random(); path[i] = i % curves.length; ang[i] = Math.random() * 6.283; rad[i] = Math.sqrt(Math.random()) * radius; }
    return {
      pts: P.pts, dispose: P.dispose,
      update(dtv, speed, cam) {
        for (let i = 0; i < n; i++) {
          const S = samples[path[i]], sp = speed(path[i], u[i]);
          u[i] += sp * dtv * (0.8 + 0.4 * ((i * 7919) % 100) / 100);
          if (u[i] >= 1) u[i] -= 1; if (u[i] < 0) u[i] += 1;
          const j = Math.min(119, (u[i] * 120) | 0), p = S.pts[j], N = S.F.normals[j], Bn = S.F.binormals[j], ca = Math.cos(ang[i]) * rad[i], sa = Math.sin(ang[i]) * rad[i];
          P.pos[i * 3] = p.x + N.x * ca + Bn.x * sa; P.pos[i * 3 + 1] = p.y + N.y * ca + Bn.y * sa; P.pos[i * 3 + 2] = p.z + N.z * ca + Bn.z * sa;
          P.size[i] = colorFn(path[i], u[i], c3, i);
          P.col[i * 3] = c3[0]; P.col[i * 3 + 1] = c3[1]; P.col[i * 3 + 2] = c3[2];
        }
        P.mat.uniforms.k.value = cam; P.flush();
      },
    };
  }

  // Câmara do cilindro 1: moléculas de ar, combustível, etanol e aditivos entram pela válvula de
  // admissão na quantidade da massa simulada, aquecem na compressão, viram CO₂/H₂O quando a frente
  // de chama (raio ∝ fração queimada^⅓) passa por elas e saem pelo escape.
  function chamber(dim, n = 900) {
    const P = points(n), { B, roof, sg, two } = dim;   // two: 2 tempos (entra pelas transferências, sai pela janela lateral)
    const where = new Uint8Array(n), sp = new Uint8Array(n), burnt = new Uint8Array(n);
    const s = new Float32Array(n), r = new Float32Array(n), a = new Float32Array(n), h = new Float32Array(n), jx = new Float32Array(n), jy = new Float32Array(n);
    const inP = new THREE.CatmullRomCurve3(dim.inPath || [V(0, roof + 1.8 * B, -sg * 1.8 * B), V(0, roof + 0.45 * B, -sg * 0.55 * B), V(0, roof - 0.04 * B, -sg * 0.23 * B)]);
    const exP = new THREE.CatmullRomCurve3(dim.exPath || [V(0, roof - 0.04 * B, sg * 0.23 * B), V(0, roof - 0.1 * B, sg * 0.55 * B), V(0, roof - 0.55 * B, sg * 1.5 * B)]);
    const inPts = inP.getSpacedPoints(60), exPts = exP.getSpacedPoints(60);
    let fuel = { eth: 0 }, lam = 1;
    function fresh(i) {
      const q = Math.random(), f = 0.14 / Math.max(0.6, lam);
      sp[i] = q < 0.04 ? 4 : q < 0.04 + f ? (Math.random() < fuel.eth ? 3 : 2) : q < 0.24 + f ? 1 : 0; // aditivo, combustível, O₂, N₂
      burnt[i] = 0; where[i] = 0; s[i] = Math.random() * 0.25;
    }
    for (let i = 0; i < n; i++) { fresh(i); jx[i] = (Math.random() - 0.5) * 0.35 * B; jy[i] = (Math.random() - 0.5) * 0.35 * B; s[i] = Math.random(); }
    let mmax = 1, trRef = null;
    const c3 = [0, 0, 0];
    return {
      pts: P.pts, dispose: P.dispose,
      update(o) { // o: { tc, tr, li, le, crown, xb, T, dtv, cam, injOn, fuel, lam, swirl, spark }
        fuel = o.fuel; lam = o.lam || 1;
        if (o.tr !== trRef) { trRef = o.tr; mmax = 1e-12; for (let k = 0; k < o.tr.p.length; k++) mmax = Math.max(mmax, o.tr.p[k] * o.tr.v[k] / o.tr.T[k]); }
        const b = o.tc | 0, mNow = o.tr.p[b] * o.tr.v[b] / o.tr.T[b] / mmax, target = Math.round(0.62 * n * mNow);
        let inCyl = 0;
        for (let i = 0; i < n; i++) if (where[i] === 1) inCyl++;
        let d = Math.max(-30, Math.min(30, target - inCyl));
        if (d > 0 && o.li > 0) { // entra pela válvula de admissão (as mais próximas da válvula primeiro)
          const q = []; for (let i = 0; i < n; i++) if (where[i] === 0) q.push(i);
          q.sort((p1, p2) => s[p2] - s[p1]);
          for (const i of q) { if (d <= 0) break; where[i] = 1; if (two) { r[i] = 0.4 * B; a[i] = (i & 1 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.8; h[i] = 0.05 + 0.25 * Math.random(); } else { r[i] = Math.random() * 0.3 * B; a[i] = -Math.PI / 2 * sg + (Math.random() - 0.5); h[i] = 0.6 + 0.35 * Math.random(); } d--; }
        } else if (d < 0) { // sai pelo escape (ou volta pela admissão se só ela estiver aberta)
          for (let i = 0; i < n && d < 0; i++) if (where[i] === 1 && Math.random() < 0.5) {
            if (o.le > 0) { where[i] = 2; s[i] = 0; } else if (o.li > 0) { where[i] = 0; s[i] = 0.9; } else break;
            d++;
          }
        }
        const vIn = 0.05 + 2.5 * Math.max(0, o.mi), vEx = 0.2 + 3 * Math.max(0, o.me), H = o.crown, span = roof - H;
        const rf = o.xb > 0.005 ? Math.cbrt(o.xb) * 1.15 * B : -1, ry = roof - 0.06 * B;
        for (let i = 0; i < n; i++) {
          let x, y, z, size = SPEC[sp[i]][3], T = 300;
          if (where[i] === 0) { // no pórtico de admissão, andando para a válvula
            s[i] = Math.min(0.995, s[i] + vIn * o.dtv * (0.7 + 0.6 * (i % 7) / 7));
            const p = inPts[Math.min(59, (s[i] * 60) | 0)]; x = p.x + jx[i] * 0.6; y = p.y + jy[i] * 0.4; z = p.z;
            if (sp[i] === 2 || sp[i] === 3) size *= 1.4;                       // gotículas ainda não evaporadas
          } else if (where[i] === 2) { // saindo pelo pórtico de escape
            s[i] += vEx * o.dtv;
            if (s[i] >= 1) { fresh(i); s[i] = 0; continue; }
            const p = exPts[Math.min(59, (s[i] * 60) | 0)]; x = p.x + jx[i] * 0.6; y = p.y + jy[i] * 0.4; z = p.z; T = o.Tex;
          } else { // dentro do cilindro: turbulência (tumble/swirl) e compressão junto com o pistão
            a[i] += o.dtv * (1.5 + 4 * o.swirl) * (1 + (i % 5) * 0.2);
            h[i] = clamp(h[i] + (Math.random() - 0.5) * 0.04 - (h[i] > 0.85 ? 0.01 : 0), 0.03, 0.97);
            x = r[i] * Math.cos(a[i]); z = r[i] * Math.sin(a[i]); y = H + h[i] * span; T = o.T;
            r[i] = clamp(r[i] + (Math.random() - 0.5) * 0.02 * B, 0.02 * B, 0.44 * B);
            if (rf > 0 && !burnt[i] && x * x + (y - ry) ** 2 + z * z < rf * rf) { // a frente de chama passou
              burnt[i] = 1; if (sp[i] >= 1 && sp[i] <= 4) sp[i] = (i & 1) ? 5 : 6;
            }
          }
          const c = SPEC[sp[i]], hh = heat(T, c3, burnt[i]);
          if (!burnt[i]) { c3[0] = c[0] + 0.5 * hh; c3[1] = c[1] * (1 - 0.3 * hh); c3[2] = c[2] * (1 - 0.5 * hh); }
          else { c3[0] = c3[0] * 0.8 + c[0] * 0.2; c3[1] = c3[1] * 0.8 + c[1] * 0.2; c3[2] = c3[2] * 0.8 + c[2] * 0.2; }
          P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
          P.size[i] = 0.11 * B * size * (1 + 0.8 * hh * burnt[i]);
          P.col[i * 3] = c3[0]; P.col[i * 3 + 1] = c3[1]; P.col[i * 3 + 2] = c3[2];
        }
        P.mat.uniforms.k.value = o.cam; P.flush();
      },
    };
  }

  return { extrudeX, cylX, label, text, gearShape, charger, flow, chamber, heat, SPEC, points };
})();
