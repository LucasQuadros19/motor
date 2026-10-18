// Câmbios em 3D, animados pelo estado real da transmissão (drive.js):
//  • sequencial (moto) / manual (carro): embreagem multidisco, eixos primário e secundário com as
//    engrenagens sempre engrenadas, luvas com dentes laterais (dogs) e garfos; na moto os garfos
//    correm nos canais do tambor seletor (1-N-2-3-4-5-6), no carro há trilhos, sincronizadores e alavanca em H;
//  • automático de 8 marchas: conversor de torque (bomba, turbina, estator, travamento), 4 trens
//    planetários com as velocidades de cada solar/portador/coroa resolvidas pela equação de Willis,
//    freios A-B e embreagens C-E acendendo conforme a marcha;
//  • CVT: duas polias de cones e correia de elementos; raios resolvidos pelo comprimento constante da correia.
// Tudo gira na mesma escala de tempo visual: quando a rotação real borraria o movimento, todas as
// velocidades são reduzidas na mesma proporção (o engrenamento continua coerente).
const T3 = !window.THREE ? null : (() => {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), TAU = 2 * Math.PI;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, sm = t => t * t * (3 - 2 * t);
  const { extrudeX, cylX, label, text, gearShape } = P3;
  const gearX = (z, m, w, hole, mat) => { const g = new THREE.Mesh(extrudeX(gearShape(z, m, hole), w, 0.004 * z * m), mat); g.castShadow = true; return g; };
  const tubeX = (r, h, mat, seg = 32) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg, 1, true), mat); m.rotation.z = Math.PI / 2; return m; };
  function ringGear(z, m, rOut, w, mat) { // coroa (dentes internos)
    const s = new THREE.Shape(); s.absarc(0, 0, rOut, 0, TAU, false);
    s.holes.push(new THREE.Path(gearShape(z, m).getPoints()));
    const g = new THREE.Mesh(extrudeX(s, w), mat); g.castShadow = true; return g;
  }
  function shell(G, len, h, d, cx, cy, M) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, h, d), M.shell); s.position.set(cx, cy, 0);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(s.geometry), M.edge); e.position.copy(s.position);
    G.add(s, e);
  }
  const glow = (mat, on, hex = 0x7a3300) => mat.emissive && mat.emissive.setHex(on ? hex : 0);   // (fantasma do foco não tem emissive)
  const speedK = (dtv, ...w) => { const m = Math.max(1e-6, ...w.map(Math.abs)) * dtv; return m > 0.4 ? 0.4 / m : 1; };

  // conversor de torque: bomba (motor), turbina (câmbio), estator no meio, disco de travamento
  function converter(B, M) {
    const G = new THREE.Group(), R = 1.05 * B, r0 = 0.35 * B;
    const torus = (side, mat) => { // meia rosca: perfil semicircular girado em torno do eixo
      const pts = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; pts.push(new THREE.Vector2((r0 + R) / 2 - Math.cos(a) * (R - r0) / 2, side * Math.sin(a) * 0.32 * B)); }
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat); m.rotation.z = -Math.PI / 2; return m;
    };
    const imp = new THREE.Group(), tur = new THREE.Group();
    imp.add(torus(-1, M.forged)); tur.add(torus(1, M.steel));
    for (let k = 0; k < 14; k++) { // pás
      for (const [grp, s, mat] of [[imp, -1, M.alu], [tur, 1, M.brass]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.26 * B, 0.012 * B, (R - r0) * 0.8), mat), a = k / 14 * TAU;
        b.position.set(s * 0.14 * B, Math.cos(a) * (r0 + R) / 2, Math.sin(a) * (r0 + R) / 2); b.rotation.x = -a + Math.PI / 2; b.rotation.y = s * 0.5; grp.add(b);
      }
    }
    const stator = new THREE.Group();
    for (let k = 0; k < 9; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1 * B, 0.03 * B, 0.3 * B), M.dark), a = k / 9 * TAU; b.position.set(0, Math.cos(a) * 0.5 * B, Math.sin(a) * 0.5 * B); b.rotation.x = -a; b.rotation.y = 0.8; stator.add(b); }
    const cover = tubeX(R + 0.06 * B, 0.9 * B, M.shell, 40);
    const lockMat = M.copper.clone(), lock = cylX(0.95 * B, 0.04 * B, lockMat, 40); lock.position.x = -0.42 * B;
    G.add(imp, tur, stator, cover, lock);
    return { group: G, imp, tur, lockMat, width: 0.9 * B };
  }

  // ---------- sequencial (moto / corrida): engrenagens com dentes laterais e tambor seletor ----------
  function stepped(veh, B, M) {
    const G = new THREE.Group(), n = veh.gears.length, Z = 54, Cd = 1.3 * B, m = 2 * Cd / Z, fw = 0.2 * B, gap = 0.44 * B;
    const x0 = 1.15 * B, len = x0 + n * gap + 0.5 * B, car = !!veh.car, labels = [];
    // embreagem multidisco: cesto (motor) com discos de fricção, cubo (eixo primário) com discos de aço
    const nP = 7, basket = new THREE.Group(), hub = new THREE.Group(), fr = [], stl = [];
    basket.position.x = hub.position.x = 0.5 * B; G.add(basket, hub);
    basket.add(tubeX(0.92 * B, 0.66 * B, M.alu, 36)); const pg = gearX(72, 1.86 * B / 72, 0.12 * B, 0.8 * B, M.gear); pg.position.x = -0.38 * B; basket.add(pg);
    for (let k = 0; k < nP; k++) {
      const f = cylX(0.82 * B, 0.03 * B, M.copper, 32); basket.add(f); fr.push(f);
      if (k < nP - 1) { const s = cylX(0.74 * B, 0.02 * B, M.steel, 32); hub.add(s); stl.push(s); }
    }
    const pp = cylX(0.78 * B, 0.08 * B, M.forged, 36); hub.add(pp);                       // platô
    const sIn = cylX(0.08 * B, len, M.steel), sOut = cylX(0.08 * B, len - 0.6 * B, M.steel);
    sIn.position.x = len / 2 + 0.3 * B; sOut.position.set(len / 2 + 0.6 * B, -Cd, 0); G.add(sIn, sOut);
    const pairs = veh.gears.map((r, i) => {
      const zi = clamp(Math.round(Z / (1 + r)), 9, Z - 9), zo = Z - zi, x = x0 + i * gap;
      const mi = M.gear.clone(), mo = M.gear.clone(), gi = gearX(zi, m, fw, 0.08 * B, mi), go = gearX(zo, m, fw, 0.08 * B, mo);
      gi.position.x = x; go.position.set(x, -Cd, 0);
      const lb = label(String(i + 1), 0.32 * B); lb.position.set(x, m * zi / 2 + 0.3 * B, 0);
      G.add(gi, go, lb);
      return { zi, zo, gi, go, mi, mo, phase: Math.PI / zo };
    });
    // luvas com dentes (dogs) entre pares de marchas, cada uma com seu garfo
    const rings = [];
    for (let j = 0; j < n; j += 2) {
      const x = x0 + (j + (j + 1 < n ? 0.5 : 0.25)) * gap, ring = new THREE.Group();
      ring.add(cylX(0.2 * B, 0.11 * B, M.forged, 24));
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.05 * B, 0.06 * B, 0.06 * B), M.steel), a = k * Math.PI / 3; d.position.set(s * 0.075 * B, Math.cos(a) * 0.15 * B, Math.sin(a) * 0.15 * B); ring.add(d); }
      ring.position.set(x, -Cd, 0); G.add(ring);
      const fork = new THREE.Group(), plate = new THREE.Mesh(new THREE.BoxGeometry(0.05 * B, 0.62 * B, 0.36 * B), M.dark);
      plate.position.y = -0.37 * B; fork.add(plate);
      const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.24 * B, 0.03 * B, 6, 20, Math.PI), M.dark); yoke.rotation.y = Math.PI / 2; yoke.rotation.x = Math.PI; fork.add(yoke);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * B, 0.035 * B, 0.12 * B, 10), M.steel); pin.position.y = -0.69 * B; fork.add(pin);
      fork.position.set(x, -Cd, 0); G.add(fork);
      rings.push({ ring, fork, x, a: j, b: j + 1, pos: 0 });
    }
    const target = (r, sel) => sel === r.a + 1 ? -0.3 * gap : sel === r.b + 1 ? 0.3 * gap : 0;
    const order = [1, 0].concat(Array.from({ length: n - 1 }, (_, k) => k + 2)), step = TAU / (n + 2), rd = 0.22 * B; // 1-N-2-3...
    const offAt = (r, phi) => { // canal do tambor: deslocamento do garfo r no ângulo phi
      const u = clamp(phi / step, 0, order.length - 1), k = Math.min(order.length - 2, Math.floor(u)), f = u - k, t = sm(clamp((f - 0.2) / 0.6, 0, 1));
      return target(r, order[k]) * (1 - t) + target(r, order[k + 1]) * t;
    };
    const drum = new THREE.Group(); drum.position.set(0, -Cd - 1.0 * B, 0); G.add(drum);
    const body = cylX(rd, len * 0.85, M.forged, 28); body.position.x = len / 2 + 0.4 * B; drum.add(body);
    for (const r of rings) {
      const pts = []; for (let q = 0; q <= (order.length - 1) * 16; q++) { const phi = q / 16 * step; pts.push(V(r.x + offAt(r, phi), rd * 1.03 * Math.cos(phi), rd * 1.03 * Math.sin(phi))); }
      drum.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.028 * B, 6, false), M.black));
    }
    const star = gearX(order.length + 1, 0.6 * B / (order.length + 1), 0.08 * B, 0, M.steel); star.position.x = len + 0.15 * B; drum.add(star); // estrela de posições (detentes)
    for (let k = 0; k < order.length; k++) { const lb = label(order[k] ? String(order[k]) : 'N', 0.16 * B, '#9fd0ff'); const a = k * step; lb.position.set(len + 0.3 * B, 0.42 * B * Math.cos(a), 0.42 * B * Math.sin(a)); drum.add(lb); }
    const out = gearX(15, 0.5 * B / 15 * 2, 0.12 * B, 0.08 * B, M.dark); out.position.set(len + 0.55 * B, -Cd, 0); G.add(out); // pinhão da corrente
    shell(G, len + 0.2 * B, Cd + 1.6 * B, 1.8 * B, len / 2 + 0.3 * B, -Cd / 2 - 0.25 * B, M);
    const tag = (t, x, y, z) => { const s = text(t, 0.2 * B); s.position.set(x, y, z); s.visible = false; G.add(s); labels.push(s); };
    tag('EMBREAGEM MULTIDISCO', 0.5 * B, 1.2 * B, 0); tag('EIXO PRIMÁRIO', len * 0.6, 0.15 * B, 1.0 * B); tag('EIXO SECUNDÁRIO', len * 0.6, -Cd, 1.0 * B);
    tag('TAMBOR SELETOR', len * 0.6, -Cd - 1.0 * B, 0.7 * B); tag('GARFOS', rings[0].x, -Cd - 0.45 * B, 0.6 * B);
    let aE = 0, aI = 0, aO = 0, wI = 0, psi = 0, gap0 = 0;
    return {
      group: G, len: len + 0.7 * B, labels,
      update(st, dtv, dt) {
        const d = st && st.dl, sel = st ? Math.max(0, st.gear) : 0, wE = st ? st.w / (car ? 1 : veh.primary) : 0, wO = d ? d.wOut : 0, open = st ? st.clutch > 0.5 : true;
        wI = !open ? wE : sel ? wO * veh.gears[sel - 1] : wI * Math.max(0, 1 - dt * 0.8);           // desembreado em N: o eixo vai parando
        const k = speedK(dtv, wE, wI, wO);
        aE += wE * dtv * k; aI += wI * dtv * k; aO += wO * dtv * k;
        basket.rotation.x = aE; hub.rotation.x = aI; sIn.rotation.x = aI; sOut.rotation.x = -aO;
        gap0 += ((open ? 1 : 0) - gap0) * Math.min(1, dt * 12);                                     // discos se afastam com a embreagem aberta
        fr.forEach((f, i) => { f.position.x = -0.24 * B + i * (0.07 + 0.03 * gap0) * B; });
        stl.forEach((s, i) => { s.position.x = -0.205 * B + i * (0.07 + 0.03 * gap0) * B; });
        pp.position.x = -0.24 * B + nP * (0.07 + 0.03 * gap0) * B;
        pairs.forEach((p, i) => { p.gi.rotation.x = aI; p.go.rotation.x = -aI * p.zi / p.zo + p.phase; const on = sel === i + 1; glow(p.mi, on); glow(p.mo, on); });
        const idx = order.indexOf(sel), tgt = -Math.max(0, idx) * step;
        psi += (tgt - psi) * Math.min(1, dt * 9); drum.rotation.x = psi;
        for (const r of rings) { r.pos = offAt(r, -psi); r.ring.position.x = r.fork.position.x = r.x + r.pos; r.ring.rotation.x = -aO; } // o canal empurra o garfo
        out.rotation.x = -aO;
      },
    };
  }

  // ---------- manual de carro (tração traseira, 3 eixos) ----------
  // Eixo de entrada → par de entrada sempre engrenado → contra-eixo (embaixo) → pares de cada marcha. As
  // engrenagens do eixo de saída giram soltas no eixo; a luva do sincronizador (anel de latão iguala as
  // velocidades) trava a escolhida. A marcha direta (1:1) trava o eixo de entrada direto no de saída.
  // Ré: a engrenagem intermediária desliza para dentro, entre o contra-eixo e o eixo de saída, e inverte o giro.
  // A alavanca percorre o H de verdade: volta ao neutro, atravessa, engata; trilho e garfo seguem a alavanca.
  function manual(veh, B, M, rev) {
    const G = new THREE.Group(), rs = veh.gears, n = rs.length, Zs = 54, Cd = 1.25 * B, m = 2 * Cd / Zs, fw = 0.19 * B, gap = 0.42 * B, labels = [];
    const k0 = clamp(Math.sqrt(Math.max(...rs) * Math.min(...rs)), 1.2, 1.8), zA = Math.round(Zs / (1 + k0)), zB = Zs - zA, kk = zB / zA;
    const dIdx = rs.findIndex(r => Math.abs(r - 1) < 0.03) + 1;                                  // marcha direta (0 = não tem)
    const cols = []; for (let a = 1; a <= n; a += 2) cols.push(a + 1 <= n ? [a, a + 1] : [a]);
    const colOf = g => cols.findIndex(c => c.includes(g)), rowOf = g => cols[colOf(g)][0] === g ? 1 : -1;
    // ré no H: coluna própria à direita (marchas pares) ou abaixo da última marcha (ímpares)
    const rCol = n % 2 ? cols.length - 1 : cols.length, rRow = n % 2 ? -1 : 1, nCol = Math.max(cols.length, rCol + 1), nCol0 = Math.min(1, cols.length - 1);
    const gl = { gear: M.gear };
    const mk = (z, w, mat) => gearX(z, m, w, 0.09 * B, mat);
    // embreagem: volante (motor) + disco (eixo de entrada) + platô e mola diafragma + rolamento de embreagem
    const fly = new THREE.Group(); fly.position.x = 0.25 * B; G.add(fly);
    fly.add(cylX(1.05 * B, 0.16 * B, M.dark, 48)); const ringG = gearX(96, 2.3 * B / 96, 0.1 * B, 1.0 * B, M.steel); fly.add(ringG);
    const disc = new THREE.Group(); disc.position.x = 0.42 * B; G.add(disc);
    disc.add(cylX(0.85 * B, 0.035 * B, M.copper, 40)); disc.add(cylX(0.25 * B, 0.1 * B, M.steel, 20));
    for (let s = 0; s < 6; s++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * B, 0.04 * B, 0.12 * B, 8), M.steel); sp.rotation.z = Math.PI / 2; const a = s / 6 * TAU; sp.position.set(0, 0.4 * B * Math.cos(a), 0.4 * B * Math.sin(a)); disc.add(sp); }
    const press = new THREE.Group(); press.position.x = 0.55 * B; G.add(press);
    press.add(cylX(0.95 * B, 0.08 * B, M.forged, 40));
    for (let f = 0; f < 12; f++) { const fi = new THREE.Mesh(new THREE.BoxGeometry(0.02 * B, 0.45 * B, 0.08 * B), M.steel); const a = f / 12 * TAU; fi.position.set(0.08 * B, 0.45 * B * Math.cos(a), 0.45 * B * Math.sin(a)); fi.rotation.x = -a; fi.rotation.z = 0.25; press.add(fi); }
    const bear = tubeX(0.2 * B, 0.12 * B, M.alu, 20); bear.position.x = 0.85 * B; G.add(bear);
    // eixos
    const xh = 1.35 * B, sIn = cylX(0.08 * B, xh + 0.1 * B, M.steel); sIn.position.x = (xh + 0.1 * B) / 2 + 0.1 * B; G.add(sIn);
    const head = mk(zA, fw, gl.gear.clone()); head.position.x = xh; G.add(head);
    const cnt = new THREE.Group(); cnt.position.y = -Cd; G.add(cnt);
    const cB = mk(zB, fw, gl.gear.clone()); cB.position.x = xh; cnt.add(cB);
    // posições ao longo do eixo: a coluna com a direta encosta na engrenagem de entrada
    const order = cols.map((c, i) => i).sort((a, b) => (cols[b].includes(dIdx) ? 1 : 0) - (cols[a].includes(dIdx) ? 1 : 0));
    let x = xh + 0.42 * gap;
    const gears = {}, sleeves = [];
    for (const ci of order) {
      const c = cols[ci], items = c.includes(dIdx) ? [dIdx, 'S', ...c.filter(g => g !== dIdx)] : c.length > 1 ? [c[0], 'S', c[1]] : ['S', c[0]];
      const sl = { col: ci, gx: {} };
      for (const it of items) {
        if (it === 'S') { sl.x = x; x += 0.75 * gap; continue; }
        if (it === dIdx) { sl.gx[it] = xh + 0.12 * B; continue; }                                 // dentes de engate na engrenagem de entrada
        const r = rs[it - 1], zc = clamp(Math.round(Zs / (1 + r / kk)), 11, Zs - 11), zm = Zs - zc;
        const mm = gl.gear.clone(), mc = gl.gear.clone(), gm = mk(zm, fw, mm), gc = mk(zc, fw, mc);
        gm.position.x = x; gc.position.x = x; G.add(gm); cnt.add(gc);
        const dog = mk(28, 0.05 * B, M.steel); dog.scale.setScalar(0.42); dog.position.x = x + (sl.x !== undefined ? -1 : 1) * (fw / 2 + 0.03 * B); G.add(dog);
        const syn = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * B, 0.24 * B, 0.05 * B, 24), M.brass); syn.rotation.z = (sl.x !== undefined ? -1 : 1) * Math.PI / 2;
        syn.position.x = x + (sl.x !== undefined ? -1 : 1) * (fw / 2 + 0.09 * B); G.add(syn);
        const lb = label(String(it), 0.3 * B); lb.position.set(x, m * zm / 2 + 0.3 * B, 0); G.add(lb);
        gears[it] = { gm, gc, mm, mc, zc, zm, x, dog, syn, phase: Math.PI / zm }; sl.gx[it] = x;
        x += gap;
      }
      // luva do sincronizador: cubo estriado no eixo + luva com dentes internos
      const grp = new THREE.Group(); grp.position.x = sl.x; G.add(grp);
      grp.add(cylX(0.27 * B, 0.15 * B, M.forged, 28));
      for (let q = 0; q < 8; q++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.16 * B, 0.04 * B, 0.04 * B), M.steel), a = q / 8 * TAU; t.position.set(0, 0.29 * B * Math.cos(a), 0.29 * B * Math.sin(a)); grp.add(t); }
      grp.add(new THREE.Mesh(new THREE.TorusGeometry(0.27 * B, 0.025 * B, 6, 24), M.dark).rotateY(Math.PI / 2));
      sl.grp = grp; sl.pos = 0; sleeves.push(sl);
    }
    // ré: engrenagem do contra-eixo, intermediária deslizante (eixo próprio, de lado) e engrenagem fixa no eixo de saída
    const xr = x + 0.1 * gap, zcr = 13, zmr = clamp(Math.round(zcr * (rev || 3.4) / kk), 20, 42), zid = 17;
    const rm = m * zmr / 2, rc = m * zcr / 2, ri = m * zid / 2, d1 = rm + ri, d2 = rc + ri, iy = (d2 * d2 - d1 * d1 - Cd * Cd) / (2 * Cd), iz = Math.sqrt(Math.max(0, d1 * d1 - iy * iy));
    const rMm = gl.gear.clone(), rCm = gl.gear.clone(), rIm = gl.gear.clone();
    const rM = mk(zmr, fw, rMm), rC = mk(zcr, fw * 2.2, rCm), idl = mk(zid, fw, rIm);
    rM.position.x = xr; rC.position.x = xr + 0.6 * fw; G.add(rM); cnt.add(rC);
    const idS = cylX(0.05 * B, 1.4 * gap, M.steel, 10); idS.position.set(xr + 0.4 * gap, iy, iz); G.add(idS); idl.position.set(xr + 1.3 * fw, iy, iz); G.add(idl); // eixo da intermediária, ao lado
    const lbR = label('R', 0.3 * B, '#ff9a3c'); lbR.position.set(xr, rm + 0.3 * B, 0); G.add(lbR);
    x = xr + gap;
    const len = x + 0.4 * B, sOut = cylX(0.08 * B, len - xh, M.steel); sOut.position.x = (len + xh) / 2; G.add(sOut);
    const sCnt = cylX(0.07 * B, x - xh + 0.2 * B, M.steel); sCnt.position.x = (x + xh) / 2; cnt.add(sCnt);
    const flange = cylX(0.3 * B, 0.1 * B, M.forged, 24); flange.position.x = len + 0.05 * B; G.add(flange);   // flange do cardã
    // trilhos, garfos e alavanca em H (em cima)
    const yR = m * Zs * 0.42 + 0.45 * B, rails = [], xm = (xh + len) / 2;
    const railZ = c => (c - (nCol - 1) / 2) * 0.2 * B;
    for (let c = 0; c < nCol; c++) {
      const r = cylX(0.03 * B, len - xh, M.dark, 8); r.position.set(xm, yR, railZ(c)); G.add(r);
      const sl = sleeves.find(s => s.col === c), fx = sl ? sl.x : xr;
      const fork = new THREE.Group(); fork.position.set(fx, 0, 0); G.add(fork);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05 * B, yR - (sl ? 0.3 * B : 0), 0.06 * B), M.dark); arm.position.set(0, (yR + (sl ? 0.3 * B : 0)) / 2, railZ(c)); fork.add(arm);
      if (sl) { const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.31 * B, 0.03 * B, 6, 20, Math.PI), M.dark); yoke.rotation.y = Math.PI / 2; fork.add(yoke); }
      else { const lk = new THREE.Mesh(new THREE.BoxGeometry(0.05 * B, 0.06 * B, Math.abs(iz - railZ(c))), M.dark); lk.position.set(0, (yR + iy) / 2, (iz + railZ(c)) / 2); fork.add(lk); }
      rails.push({ c, r, fork, base: fx });
    }
    const lever = new THREE.Group(); lever.position.set(xm, yR + 0.15 * B, 0); G.add(lever);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * B, 0.035 * B, 1.1 * B, 10), M.dark); stick.position.y = 0.55 * B;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13 * B, 16, 12), M.black); knob.position.y = 1.12 * B; lever.add(stick, knob);
    const gate = new THREE.Group(); gate.position.set(xm, yR + 0.95 * B, 0); G.add(gate);           // grelha do H vista de cima
    const gw = 0.35 * B, gzz = c => (c - (nCol - 1) / 2) * 0.32 * B;
    const slot = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0), b = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.03 * B, Math.abs(x1 - x0)), 0.02 * B, Math.max(0.03 * B, Math.abs(z1 - z0))), M.dark); b.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); gate.add(b); return l; };
    slot(0, gzz(0), 0, gzz(nCol - 1));
    for (let c = 0; c < nCol; c++) { const up = cols[c] || c === rCol, dn = (cols[c] && cols[c].length > 1) || (c === rCol && rRow < 0); if (up) slot(0, gzz(c), -gw, gzz(c)); if (dn) slot(0, gzz(c), gw, gzz(c)); }
    const gLab = (t, c, row) => { const s = label(t, 0.22 * B, t === 'R' ? '#ff9a3c' : '#9fd0ff'); s.position.set(-row * (gw + 0.12 * B), 0.05 * B, gzz(c)); gate.add(s); };
    cols.forEach((c, i) => { gLab(String(c[0]), i, 1); if (c[1]) gLab(String(c[1]), i, -1); }); if (rev) gLab('R', rCol, rRow);
    shell(G, len - 0.1 * B, Cd + 2.0 * B, 2.1 * B, (len + 0.2 * B) / 2, -Cd / 2 + 0.15 * B, M);
    const tag = (t, x0, y0, z0) => { const s = text(t, 0.19 * B); s.position.set(x0, y0, z0); s.visible = false; G.add(s); labels.push(s); };
    tag('EMBREAGEM (VOLANTE · DISCO · PLATÔ)', 0.45 * B, 1.3 * B, 0); tag('EIXO DE ENTRADA', xh, 0.1 * B, 1.05 * B); tag('CONTRA-EIXO', xm, -Cd - 0.5 * B, 0.8 * B);
    tag('EIXO DE SAÍDA', len - 0.4 * B, 0.15 * B, 0.9 * B); tag('LUVA + SINCRONIZADOR', sleeves[0].x, -0.55 * B, 0.95 * B); tag('INTERMEDIÁRIA DA RÉ', xr + 1.1 * fw, iy - 0.4 * B, iz + 0.4 * B);
    tag('ALAVANCA (H)', xm, yR + 1.5 * B, 0); tag('TRILHOS E GARFOS', xm, yR + 0.25 * B, 0.9 * B);
    let aE = 0, aI = 0, aO = 0, aC = 0, aId = 0, wI = 0, lc = nCol0, lr = 0, gap0 = 0, idlIn = 0;
    const target = sel => sel > 0 ? [colOf(sel), rowOf(sel)] : sel < 0 ? [rCol, rRow] : [nCol0, 0];
    return {
      group: G, len: len + 0.3 * B, labels,
      update(st, dtv, dt) {
        const d = st && st.dl, sel = st ? st.gear : 0, wE = st ? st.w : 0, wO = d ? d.wOut : 0, open = st ? st.clutch > 0.5 : true;
        const rSel = sel > 0 ? rs[sel - 1] : sel < 0 ? -(rev || 3.4) : 0;
        wI = !open ? wE : sel ? wO * rSel : wI * Math.max(0, 1 - dt * 0.8);
        const wC = -wI / kk, wId = -wC * zcr / zid;
        const k = speedK(dtv, wE, wI, wC, wO, wId);
        aE += wE * dtv * k; aI += wI * dtv * k; aC += wC * dtv * k; aO += wO * dtv * k; aId += wId * dtv * k;
        fly.rotation.x = press.rotation.x = aE; disc.rotation.x = sIn.rotation.x = head.rotation.x = aI;
        cB.rotation.x = rC.rotation.x = sCnt.rotation.x = aC + Math.PI / zB;
        for (const g of Object.values(gears)) { g.gc.rotation.x = aC; g.gm.rotation.x = -aC * g.zc / g.zm + g.phase; g.dog.rotation.x = g.syn.rotation.x = g.gm.rotation.x; }
        rM.rotation.x = sOut.rotation.x = flange.rotation.x = aO;
        // pedal: platô recua, rolamento avança
        gap0 += ((open ? 1 : 0) - gap0) * Math.min(1, dt * 12);
        press.position.x = 0.55 * B + 0.05 * B * gap0; bear.position.x = 0.85 * B - 0.1 * B * gap0;
        // alavanca no H: volta ao neutro antes de trocar de coluna
        const [tc, tr] = target(sel), sp = dt * 7;
        if (Math.abs(lc - tc) > 0.01) { if (Math.abs(lr) > 0.01) lr -= Math.sign(lr) * Math.min(Math.abs(lr), sp); else lc += Math.sign(tc - lc) * Math.min(Math.abs(tc - lc), sp); }
        else { lc = tc; lr += Math.sign(tr - lr) * Math.min(Math.abs(tr - lr), sp); }
        lever.rotation.z = lr * 0.32; lever.rotation.x = -(lc - (nCol - 1) / 2) * 0.22;
        for (const rl of rails) { // só o trilho da coluna da alavanca anda
          const row = Math.abs(lc - rl.c) < 0.05 ? lr : 0, sl = sleeves.find(s => s.col === rl.c);
          if (sl) {
            const gA = cols[rl.c][0], gB = cols[rl.c][1], tx = row > 0 ? sl.gx[gA] : row < 0 && gB ? sl.gx[gB] : sl.x;
            sl.pos = (Math.sign(tx - sl.x) * 0.3 * gap) * Math.abs(row); sl.grp.position.x = sl.x + sl.pos; sl.grp.rotation.x = aO;
            rl.fork.position.x = rl.base + sl.pos; rl.r.position.x = (xh + len) / 2 + sl.pos;
          } else { idlIn = Math.abs(row); rl.fork.position.x = rl.base + (1 - idlIn) * 1.3 * fw; rl.r.position.x = (xh + len) / 2 + (1 - idlIn) * 1.3 * fw; }
        }
        idl.position.x = xr + (1 - idlIn) * 1.3 * fw; idl.rotation.x = aId;                               // desliza para dentro só na ré
        // caminho da força aceso
        const engaged = Math.abs(lr) > 0.95;
        glow(head.material, engaged && sel !== 0); glow(cB.material, engaged && sel !== 0 && sel !== dIdx);
        for (const [gi, g] of Object.entries(gears)) { const on = engaged && +gi === sel; glow(g.mm, on); glow(g.mc, on); }
        glow(rMm, engaged && sel < 0); glow(rCm, engaged && sel < 0); glow(rIm, engaged && sel < 0);
      },
    };
  }

  // ---------- automático de 8 marchas (4 planetários) ----------
  function auto8(veh, B, M, DRV) {
    const { ZF, zf } = DRV, G = new THREE.Group(), fw = 0.26 * B, Dp = 2.2 * B;
    const tc = converter(B, M); tc.group.position.x = 0.5 * B; G.add(tc.group);
    const xs = [1.55 * B, 2.15 * B, 3.35 * B, 4.45 * B], sets = [];
    const input = cylX(0.07 * B, 2.2 * B, M.steel); input.position.x = 1.4 * B; G.add(input);
    for (let k = 0; k < 4; k++) {
      const S = ZF.S[k], R = ZF.R[k], P = (R - S) / 2, m = Dp / R, rs = m * S / 2, rp = m * P / 2, x = xs[k];
      const sun = gearX(S, m, fw, 0.07 * B, M.steel); sun.position.x = x;
      const ring = ringGear(R, m, m * R / 2 + 1.6 * m + 0.06 * B, fw, M.forged); ring.position.x = x;
      const car = new THREE.Group(); car.position.x = x;
      const plate = new THREE.Mesh(extrudeX((() => { const s = new THREE.Shape(); s.absarc(0, 0, rs + rp * 1.6, 0, TAU, false); const h = new THREE.Path(); h.absarc(0, 0, rs * 0.55, 0, TAU, true); s.holes.push(h); return s; })(), 0.03 * B), M.dark);
      plate.position.x = fw / 2 + 0.03 * B; car.add(plate);
      const pl = [0, 1, 2].map(j => { const p = gearX(P, m, fw * 0.96, 0.03 * B, M.gear); car.add(p); const pin = cylX(0.025 * B, fw + 0.08 * B, M.steel, 8); pin.userData.j = j; car.add(pin); return { p, pin, j }; });
      G.add(sun, ring, car);
      const lb = label(`P${k + 1}`, 0.3 * B, '#9fd0ff'); lb.position.set(x, m * R / 2 + 0.45 * B, 0); G.add(lb);
      sets.push({ sun, ring, car, pl, rs, rp, S, P });
    }
    // elementos de engate: discos empilhados (A, B freios na carcaça; C, D, E embreagens)
    const PACK = { A: [1.05 * B, 0.45 * B], B: [2.0 * B, 1.42 * B], C: [2.75 * B, 0.62 * B], D: [3.95 * B, 1.32 * B], E: [2.75 * B, 1.32 * B] }, packs = {};
    for (const [nm, [x, r]] of Object.entries(PACK)) {
      const mat = M.copper.clone(), grp = new THREE.Group(); grp.position.x = x;
      for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(extrudeX((() => { const s = new THREE.Shape(); s.absarc(0, 0, r + 0.1 * B, 0, TAU, false); const h = new THREE.Path(); h.absarc(0, 0, r - 0.12 * B, 0, TAU, true); s.holes.push(h); return s; })(), 0.025 * B), i % 2 ? M.steel : mat); d.position.x = (i - 1.5) * 0.05 * B; grp.add(d); }
      const lb = label(nm, 0.3 * B, '#ffd28a'); lb.position.set(0, r + 0.32 * B, 0.15 * B); grp.add(lb);
      G.add(grp); packs[nm] = { mat, grp };
    }
    const outS = cylX(0.08 * B, 1.3 * B, M.steel); outS.position.x = 5.1 * B; G.add(outS);
    const park = gearX(24, 0.9 * B / 24, 0.12 * B, 0.08 * B, M.dark); park.position.x = 5.3 * B; G.add(park);
    const pts = [[0.2, 1.25], [1.0, 1.25], [1.25, 1.6], [4.9, 1.55], [5.3, 0.8], [5.8, 0.5]].map(([a, r]) => new THREE.Vector2(r * B, a * B));
    const hous = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), M.shell); hous.rotation.z = -Math.PI / 2; G.add(hous);
    const ang = new Float64Array(12), rel = [0, 0, 0, 0];
    let aE = 0, aT = 0;
    return {
      group: G, len: 5.9 * B,
      update(st, dtv, dt) {
        const d = st && st.dl, gear = st ? st.gear : 0, wE = st ? st.w : 0, wT = d ? d.wIn : 0;
        const sp = gear ? zf(gear, wT) : ang.map((_, i) => i === 4 ? wT : 0);
        const k = speedK(dtv, wE, ...sp);
        aE += wE * dtv * k; aT += wT * dtv * k;
        tc.imp.rotation.x = aE; tc.tur.rotation.x = aT; input.rotation.x = aT; glow(tc.lockMat, d && d.lock > 0.5, 0x7a3300);
        for (let i = 0; i < 12; i++) ang[i] += sp[i] * dtv * k;
        sets.forEach((s, j) => {
          const wS = sp[j * 3], wC = sp[j * 3 + 1];
          rel[j] += -(wS - wC) * s.S / s.P * dtv * k;                                            // giro do satélite no próprio pino
          s.sun.rotation.x = ang[j * 3]; s.car.rotation.x = ang[j * 3 + 1]; s.ring.rotation.x = ang[j * 3 + 2];
          s.pl.forEach(({ p, pin, j: q }) => { const a = q * TAU / 3, r = s.rs + s.rp; p.position.set(0, r * Math.cos(a), r * Math.sin(a)); pin.position.copy(p.position); p.rotation.x = rel[j]; });
        });
        outS.rotation.x = park.rotation.x = ang[7];
        const on = gear ? ZF.shift[gear] : '';
        for (const nm in packs) { const c = on.includes(nm); glow(packs[nm].mat, c, 0xa04800); packs[nm].grp.scale.x = c ? 0.8 : 1; }
      },
    };
  }

  // ---------- CVT ----------
  function cvt(veh, B, M) {
    const G = new THREE.Group(), car = !!veh.car, C = 2.3 * B, R = 1.0 * B, rh = 0.24 * B, ta = Math.tan(14 * Math.PI / 180), wb = 0.24 * B;
    const pF = 1 * (veh.primary || 1) * veh.final, xc = (car ? 1.6 : 0.8) * B;
    let tc = null;
    if (car) { tc = converter(B, M); tc.group.position.x = 0.5 * B; G.add(tc.group); }
    const pulley = y => { // cone fixo + cone móvel (a face cônica olha para a correia)
      const grp = new THREE.Group(); grp.position.set(xc, y, 0); G.add(grp);
      const hc = (R - rh) * ta, mk = s => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rh, R, hc, 48), M.steel); c.rotation.z = s * Math.PI / 2; c.castShadow = true; const back = cylX(R, 0.05 * B, M.forged, 48); const sh = new THREE.Group(); sh.add(c, back); back.position.x = s * (hc / 2 + 0.025 * B); return sh; };
      const fix = mk(-1), mov = mk(1); grp.add(fix, mov);
      const shaft = cylX(0.08 * B, 1.6 * B, M.steel, 12); grp.add(shaft);
      return { grp, fix, mov, hc };
    };
    const p1 = pulley(0), p2 = pulley(-C);
    let drum = null, shoes = [];
    if (!car) { // embreagem centrífuga na polia movida: sapatas abrem com o giro e agarram o tambor
      drum = tubeX(0.85 * B, 0.3 * B, M.dark, 36); drum.position.set(xc + 0.75 * B, -C, 0); G.add(drum);
      for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.22 * B, 0.12 * B, 0.7 * B), M.copper); G.add(s); shoes.push(s); }
    }
    const N = 96, el = new THREE.InstancedMesh(new THREE.BoxGeometry(wb, 0.12 * B, 0.07 * B), car ? M.steel : M.black, N); el.frustumCulled = false; G.add(el);
    const out = gearX(28, 0.9 * B / 28, 0.12 * B, 0.08 * B, M.gear); out.position.set(xc + (car ? 0.75 : 1.05) * B, -C, 0); G.add(out);
    shell(G, xc + 1.6 * B, C + 2.4 * B, 2.4 * B, (xc + 1.6 * B) / 2, -C / 2, M);
    const L0 = (r1, r2) => { const dr = r1 - r2, g = Math.acos(clamp(dr / C, -1, 1)); return 2 * Math.sqrt(C * C - dr * dr) + r1 * (TAU - 2 * g) + r2 * 2 * g; };
    const Lb = L0(0.6 * B, 0.6 * B), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1), pos = V(), ax = V(1, 0, 0);
    let s0 = 0, a1 = 0, a2 = 0, aE = 0, ri = 2.5, open = 0;
    return {
      group: G, len: xc + 1.8 * B,
      update(st, dtv, dt) {
        const d = st && st.dl, wE = st ? st.w : 0;
        ri += (clamp(d ? d.cvt / pF : 2.5, 0.42, 2.6) - ri) * Math.min(1, dt * 6);
        let lo = 0.3 * rh + rh, hi = R * 0.98, r1 = 0;                                         // raio na polia motora tal que a correia não muda de comprimento
        for (let it = 0; it < 30; it++) { r1 = (lo + hi) / 2; if (L0(r1, Math.min(R * 0.98, r1 * ri)) > Lb) hi = r1; else lo = r1; }
        const r2 = Math.min(R * 0.98, r1 * ri), w1 = car ? (d ? d.wIn : 0) : wE, w2 = w1 / ri;
        const k = speedK(dtv, wE, w1, w2, d ? d.wOut : 0);
        aE += wE * dtv * k; a1 += w1 * dtv * k; a2 += w2 * dtv * k; s0 = (s0 + w1 * r1 * dtv * k) % Lb;
        if (tc) { tc.imp.rotation.x = aE; tc.tur.rotation.x = a1; glow(tc.lockMat, d && d.lock > 0.5); }
        for (const [p, r, a] of [[p1, r1, a1], [p2, r2, a2]]) { // o cone móvel desliza: correia no raio r
          const sep = wb - 2 * (r - rh) * ta;
          p.fix.position.x = -sep / 2 - p.hc / 2; p.mov.position.x = sep / 2 + p.hc / 2; p.grp.rotation.x = a;
        }
        out.rotation.x = a2;
        // correia: arco na motora → reta → arco na movida → reta
        const dr = r1 - r2, g = Math.acos(clamp(dr / C, -1, 1)), ls = Math.sqrt(C * C - dr * dr), L1 = r1 * (TAU - 2 * g), L2 = r2 * 2 * g, Lt = L1 + L2 + 2 * ls;
        const P = (c, r, a) => [c - r * Math.cos(a), r * Math.sin(a)];                       // (y, z) no plano da correia
        for (let i = 0; i < N; i++) {
          let s = ((s0 + i * Lt / N) % Lt + Lt) % Lt, y, z, t;
          if (s < L1) { const a = g + s / r1; [y, z] = P(0, r1, a); t = a; }
          else if ((s -= L1) < ls) { const [y0, z0] = P(0, r1, -g), [y1, z1] = P(-C, r2, -g), f = s / ls; y = y0 + (y1 - y0) * f; z = z0 + (z1 - z0) * f; t = -g; }
          else if ((s -= ls) < L2) { const a = -g + s / r2; [y, z] = P(-C, r2, a); t = a; }
          else { s -= L2; const [y0, z0] = P(-C, r2, g), [y1, z1] = P(0, r1, g), f = s / ls; y = y0 + (y1 - y0) * f; z = z0 + (z1 - z0) * f; t = g; }
          pos.set(xc, y, z); q.setFromAxisAngle(ax, -t); m4.compose(pos, q, sc); el.setMatrixAt(i, m4);
        }
        el.instanceMatrix.needsUpdate = true;
        if (drum) {
          const eng = d && d.wOut > 0.5 || (st && st.rpm > 3500); open += ((eng ? 1 : 0) - open) * Math.min(1, dt * 8);
          drum.rotation.x = a2;
          shoes.forEach((s, j) => { const a = a2 + j * TAU / 3, r = 0.6 * B + 0.12 * B * open; s.position.set(xc + 0.75 * B, -C + r * Math.cos(a), r * Math.sin(a)); s.rotation.x = -a; });
        }
      },
    };
  }

  // ---------- hélice de passo fixo (avião): redução por engrenagens, cubo, spinner e pás torcidas ----------
  // ângulo da pá em cada raio = atan(passo / 2πr): perto do cubo a pá fica "em pé", na ponta quase deitada
  function propeller(veh, B, M) {
    const G = new THREE.Group(), R = (veh.propD || 2) / 2 * 100, nb = veh.blades || 2, red = veh.red || 1, labels = [];   // 100 = unidades de cena por metro
    const tag = (t, x, y, z) => { const s = text(t, 0.3 * B); s.position.set(x, y, z); s.visible = false; G.add(s); labels.push(s); };
    let yS = 0, pin = null, big = null, x = 0.4 * B;
    if (red < 0.99) { // par de engrenagens: pinhão no virabrequim, coroa no eixo da hélice (deslocado para cima)
      const z1 = 22, z2 = Math.round(z1 / red), m = 3.0 * B / (z1 + z2);
      yS = m * (z1 + z2) / 2;
      pin = gearX(z1, m, 0.35 * B, 0.1 * B, M.gear); big = gearX(z2, m, 0.35 * B, 0.2 * B, M.steel);
      pin.position.x = big.position.x = x; big.position.y = yS; G.add(pin, big); pin.userData.part = big.userData.part = 'propRed';
      shell(G, 0.9 * B, yS + 2.6 * B, 2.6 * B, x, yS / 2, M);
      tag(`REDUÇÃO ${z1}:${z2} (hélice a ${Math.round(red * 100)}% do giro)`, x, yS + 1.6 * B, 0);
      x += 0.5 * B;
    }
    const shaft = cylX(0.16 * B, 1.4 * B, M.forged, 16); shaft.position.set(x + 0.7 * B, yS, 0); G.add(shaft);
    const P = new THREE.Group(), r0 = Math.max(0.45 * B, 0.07 * R); P.position.set(x + 1.6 * B, yS, 0); G.add(P);
    P.add(cylX(r0, 0.9 * B, M.dark, 32));
    const sp = new THREE.Mesh(new THREE.LatheGeometry(Array.from({ length: 13 }, (_, i) => { const t = i / 12; return new THREE.Vector2(r0 * 1.05 * Math.sqrt(1 - t * t) + 0.001, t * 0.22 * R); }), 32), M.alu);
    sp.rotation.z = -Math.PI / 2; sp.position.x = 0.4 * B; sp.userData.part = 'spinner'; P.add(sp);
    // pá: seções em lente com corda c(r) e torção β(r), empilhadas do cubo à ponta
    const pitch = 0.8 * 2 * R, Ns = 16, Nc = 14, pos = [], idx = [];
    for (let i = 0; i <= Ns; i++) {
      const u = i / Ns, r = r0 * 0.8 + (R - r0 * 0.8) * u, c = R * (0.07 + 0.06 * Math.sin(Math.PI * Math.min(1, 0.2 + u))) * Math.sqrt(Math.max(0.04, 1 - Math.pow(u, 8)));
      const t = c * (0.22 - 0.13 * u), b = Math.atan(pitch / (TAU * r)), e1 = [Math.sin(b), Math.cos(b)], e2 = [Math.cos(b), -Math.sin(b)];  // (x, z): corda e espessura
      for (let k = 0; k < Nc; k++) {
        const f = k / Nc * TAU, a = c / 2 * Math.cos(f), h = t / 2 * Math.sin(f) * (Math.sin(f) > 0 ? 1 : 0.35);  // dorso curvo, ventre quase plano
        pos.push(a * e1[0] + h * e2[0], r, a * e1[1] + h * e2[1]);
      }
    }
    for (let i = 0; i < Ns; i++) for (let k = 0; k < Nc; k++) { const a = i * Nc + k, b2 = i * Nc + (k + 1) % Nc; idx.push(a, b2, a + Nc, b2, b2 + Nc, a + Nc); }
    const tip = pos.length / 3; pos.push(0, R, 0); for (let k = 0; k < Nc; k++) idx.push(Ns * Nc + k, Ns * Nc + (k + 1) % Nc, tip);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setIndex(idx); bg.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ color: 0x23272c, metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide });
    for (let k = 0; k < nb; k++) {
      const bl = new THREE.Mesh(bg, bm); bl.rotation.x = k / nb * TAU; bl.castShadow = true; bl.userData.part = 'blade'; P.add(bl);
      const tipC = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.085, R * 0.085, R * 0.06, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5, side: THREE.DoubleSide }));
      tipC.position.y = R * 0.95; tipC.scale.set(1, 1, 0.25); const tg = new THREE.Group(); tg.rotation.x = k / nb * TAU; tg.add(tipC); P.add(tg);  // ponta pintada (segurança)
    }
    const discM = new THREE.MeshBasicMaterial({ color: 0x9aa7b5, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.RingGeometry(r0, R, 64), discM); disc.rotation.y = Math.PI / 2; P.add(disc);   // disco "borrado" quando gira rápido
    tag(`HÉLICE ${nb} PÁS · Ø ${(veh.propD || 2).toFixed(2)} m · passo fixo`, P.position.x, yS + R * 0.55, 0);
    tag('PÁ TORCIDA (mais inclinada no cubo)', P.position.x, yS + R * 0.3, R * 0.25);
    tag('SPINNER', P.position.x + 0.25 * R, yS + r0 + 0.6 * B, 0);
    let last = null;
    return {
      group: G, len: x + 2 * B + 0.22 * R, labels, big: true, view: [1.1, 1.2, 0.25],
      update(st, dtv, dt, thv) {
        const a = (thv || 0) * Math.PI / 180;                                  // pinhão preso ao virabrequim: mesma fase que a manivela
        if (pin) { pin.rotation.x = a; big.rotation.x = -a * red + Math.PI / Math.round(22 / red); }
        P.rotation.x = (pin ? -1 : 1) * a * red;
        const step = last === null ? 0 : Math.abs(a - last) * red; last = a;     // passo por quadro: acima de ~20° o olho vê um disco
        discM.opacity += (clamp((step - 0.25) / 0.6, 0, 1) * 0.1 - discM.opacity) * Math.min(1, (dt || 0.016) * 6);
      },
    };
  }

  function make(type, veh, B, M, DRV) {
    if (type === 'prop') return propeller(veh, B, M);
    return type === 'auto8' ? auto8(veh, B, M, DRV) : type === 'cvt' ? cvt(veh, B, M) : type === 'manual' ? manual(veh, B, M, veh.car ? veh.rev || 3.4 : 0) : stepped(veh, B, M);
  }
  return { make };
})();
