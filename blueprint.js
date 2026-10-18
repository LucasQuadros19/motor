// Desenho técnico 2D (pranchas "blueprint") animadas pela simulação — uma prancha para cada zoom do 3D:
//  • câmara: corte do cilindro (ou do rotor / 2 tempos) com cotas, distribuição, P×V e levante das válvulas
//    (came × levante real: aparece a flutuação);
//  • admissão: caminho do ar em corte + vazão na válvula ao longo do ciclo (efeito ram, refluxo);
//  • escape: sistema em corte (coletor, catalisador, ressonador, abafador) + onda de pressão no header;
//    2 tempos: perfil da câmara de expansão cotado;
//  • turbo: mapa do compressor (linhas de rotação, surge, choke, ponto de operação) + circuito do ar;
//  • câmbio: esquema do câmbio escolhido (sequencial com tambor, manual 3 eixos com ré, automático com
//    tabela de elementos, CVT) + tabela de relações e velocidades;
//  • arrefecimento: circuito com temperaturas e histórico; lubrificação: circuito, curva de Stribeck com
//    o regime de cada peça, viscosidade × temperatura e desgaste.
// Os rótulos desviam uns dos outros (nada de letra sobreposta).
const Blueprint = (() => {
  const DEG = Math.PI / 180, BG = '#0c2a4c', INK = '#e6f2ff', THIN = '#8fbbe6', CL = '#6fa3d8', HOT = '#ffb36b', SEL = '#ff9a3c', AIR = '#7fb8ff', OK = '#7be0b0', BAD = '#ff7a7a';
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const fmt = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
  let x, W, H, placed = [];
  const hist = [];

  // ---------- primitivas ----------
  const pen = (c = INK, w = 1.5, dash = []) => { x.strokeStyle = c; x.lineWidth = w; x.setLineDash(dash); };
  const ln = (a, b, c, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); };
  const path = (pts, close) => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); if (close) x.closePath(); };
  const font = sz => `${sz}px ui-monospace, Menlo, monospace`;
  const txt = (t, px, py, al = 'left', sz = 11, c = INK) => { x.font = font(sz); x.fillStyle = c; x.textAlign = al; x.textBaseline = 'middle'; x.fillText(t, px, py); };
  function lab(t, px, py, al = 'left', sz = 10, c = THIN) { // texto que procura um lugar livre (desce/sobe até não cobrir outro)
    x.font = font(sz); const w = x.measureText(t).width, h = sz + 2;
    let x0 = al === 'center' ? px - w / 2 : al === 'right' ? px - w : px;
    const xc = clamp(x0, 22, W - 22 - w); px += xc - x0; x0 = xc;                    // não sai pela borda
    let y = py;
    for (let k = 0; k < 14; k++) {
      const dy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (h + 1), yy = py + dy;
      if (!placed.some(r => x0 < r.x + r.w + 2 && x0 + w + 2 > r.x && yy - h / 2 < r.y + r.h / 2 && yy + h / 2 > r.y - r.h / 2)) { y = yy; break; }
    }
    placed.push({ x: x0, y, w, h });
    txt(t, px, y, al, sz, c);
    return y;
  }
  const reserve = (x0, y0, w, h) => placed.push({ x: x0, y: y0 + h / 2, w, h });
  function hatch(build, gap = 6, rule = 'evenodd', ang = 45) { // hachura a 45° dentro do caminho
    x.save(); x.beginPath(); build(); x.clip(rule);
    pen(THIN, 0.7); const d = Math.max(W, H) * 2, s = Math.sin(ang * DEG), c = Math.cos(ang * DEG);
    for (let t = -d; t < d; t += gap) ln(W / 2 + t * c - d * s, H / 2 + t * s + d * c, W / 2 + t * c + d * s, H / 2 + t * s - d * c);
    x.restore();
  }
  function arrow(a, b, c, d, col = INK, hs = 7) {
    pen(col, 1.2); ln(a, b, c, d);
    const t = Math.atan2(d - b, c - a); x.fillStyle = col; x.beginPath(); x.moveTo(c, d);
    x.lineTo(c - hs * Math.cos(t - 0.35), d - hs * Math.sin(t - 0.35)); x.lineTo(c - hs * Math.cos(t + 0.35), d - hs * Math.sin(t + 0.35)); x.fill();
  }
  function dim(a, b, c, d, off, label) { // cota com linhas de chamada e setas
    const t = Math.atan2(d - b, c - a), nx = -Math.sin(t) * off, ny = Math.cos(t) * off;
    pen(THIN, 0.8); ln(a, b, a + nx * 1.15, b + ny * 1.15); ln(c, d, c + nx * 1.15, d + ny * 1.15);
    arrow((a + c) / 2 + nx, (b + d) / 2 + ny, a + nx, b + ny, THIN, 6); arrow((a + c) / 2 + nx, (b + d) / 2 + ny, c + nx, d + ny, THIN, 6);
    x.save(); x.translate((a + c) / 2 + nx * 1.6, (b + d) / 2 + ny * 1.6); let r = t; if (r > Math.PI / 2 || r < -Math.PI / 2) r += Math.PI;
    x.rotate(r); x.fillStyle = BG; x.font = font(10); const w = x.measureText(label).width; x.fillRect(-w / 2 - 2, -7, w + 4, 14); txt(label, 0, 0, 'center', 10, INK); x.restore();
  }
  function leader(px, py, tx, ty, label) { // linha de chamada com o texto num lugar livre
    x.font = font(10); const right = tx > px, y = lab(label, tx + (right ? 4 : -4), ty, right ? 'left' : 'right', 10, THIN);
    pen(THIN, 0.8); ln(px, py, tx, y); x.fillStyle = THIN; x.beginPath(); x.arc(px, py, 2, 0, 7); x.fill();
  }
  function gasRGBA(T, X, a = 0.55) {
    const h = clamp((T - 600) / 1900, 0, 1), m = clamp(1 - X, 0, 1) * 0.9;
    let r, g, b;
    if (h < 0.5) { r = 90 + 330 * h; g = 64 + 76 * h; b = 52 - 48 * h; } else { r = 255; g = 106 + 230 * (h - 0.5); b = 26 + 220 * (h - 0.5); }
    r = r * (1 - m) + 59 * m; g = g * (1 - m) + 130 * m; b = b * (1 - m) + 246 * m;
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  }
  const HEAT = [[-20, [29, 79, 209]], [40, [59, 130, 246]], [85, [47, 201, 138]], [130, [182, 224, 74]], [180, [255, 211, 77]], [250, [255, 138, 42]], [350, [255, 45, 45]], [700, [255, 226, 226]]];
  function heatCss(T, a = 1) {
    let c = HEAT[HEAT.length - 1][1];
    for (let i = 1; i < HEAT.length; i++) if (T <= HEAT[i][0]) { const f = clamp((T - HEAT[i - 1][0]) / (HEAT[i][0] - HEAT[i - 1][0]), 0, 1), p = HEAT[i - 1][1], q = HEAT[i][1]; c = p.map((v, k) => v + (q[k] - v) * f); break; }
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  }
  function frame() {
    x.fillStyle = BG; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 20) { pen(i % 100 ? 'rgba(120,170,230,0.07)' : 'rgba(120,170,230,0.15)', 1); ln(i, 0, i, H); }
    for (let j = 0; j < H; j += 20) { pen(j % 100 ? 'rgba(120,170,230,0.07)' : 'rgba(120,170,230,0.15)', 1); ln(0, j, W, j); }
    pen(INK, 2); x.strokeRect(12, 12, W - 24, H - 24); pen(INK, 0.8); x.strokeRect(17, 17, W - 34, H - 34);
  }
  function panel(px, py, pw, ph, title) { // quadro com título; devolve a área interna
    pen(THIN, 0.8, [2, 3]); x.strokeRect(px, py, pw, ph); x.setLineDash([]);
    if (title) { x.font = font(11); const w = x.measureText(title).width; x.fillStyle = BG; x.fillRect(px + 8, py - 8, w + 10, 16); txt(title, px + 13, py, 'left', 11, INK); reserve(px + 8, py - 8, w + 10, 16); }
    return { x: px + 10, y: py + 14, w: pw - 20, h: ph - 24 };
  }
  function plot(r, xs, series, opt = {}) { // gráfico simples: eixos, grade, séries [{ys, col, dash}]
    const x0 = opt.x0 != null ? opt.x0 : Math.min(...xs), x1 = opt.x1 != null ? opt.x1 : Math.max(...xs);
    let y0 = opt.y0 != null ? opt.y0 : Infinity, y1 = opt.y1 != null ? opt.y1 : -Infinity;
    if (opt.y0 == null || opt.y1 == null) for (const s of series) for (const v of s.ys) { if (opt.y0 == null) y0 = Math.min(y0, v); if (opt.y1 == null) y1 = Math.max(y1, v); }
    if (!(y1 > y0)) y1 = y0 + 1;
    const l = r.x + 34, b = r.y + r.h - 16, w = r.w - 40, h = r.h - 24, X = v => l + (v - x0) / (x1 - x0) * w, Y = v => b - (v - y0) / (y1 - y0) * h;
    pen(THIN, 0.5, [2, 3]); for (let i = 0; i <= 4; i++) { ln(l, b - h * i / 4, l + w, b - h * i / 4); ln(l + w * i / 4, b, l + w * i / 4, b - h); } x.setLineDash([]);
    pen(THIN, 1); x.strokeRect(l, b - h, w, h);
    for (let i = 0; i <= 4; i += 2) { txt(fmt(y0 + (y1 - y0) * i / 4, opt.yd || 0), l - 4, b - h * i / 4, 'right', 9, THIN); txt(fmt(x0 + (x1 - x0) * i / 4, opt.xd || 0), l + w * i / 4, b + 9, 'center', 9, THIN); }
    if (opt.xl) txt(opt.xl, l + w, b + 9, 'right', 9, THIN); if (opt.yl) txt(opt.yl, l + 3, b - h - 6, 'left', 9, THIN);
    for (const s of series) { pen(s.col, s.w || 1.5, s.dash || []); x.beginPath(); xs.forEach((v, i) => { const px = X(v), py = Y(clamp(s.ys[i], y0, y1)); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); x.setLineDash([]); }
    return { X, Y, l, b, w, h };
  }
  function stamp(S, g, name, sheet, ox, oy, w, h) {
    pen(INK, 1.4); x.strokeRect(ox, oy, w, h); reserve(ox, oy, w, h);
    const st = S.st || {}, rows = [
      [`SIMULADOR DE MOTOR — ${{ chamber: 'CÂMARA E DISTRIBUIÇÃO', intake: 'ADMISSÃO', exhaust: 'ESCAPE', turbo: 'SOBREALIMENTAÇÃO', gearbox: g.trans === 'prop' ? 'HÉLICE' : 'TRANSMISSÃO', cooling: 'ARREFECIMENTO', oil: 'LUBRIFICAÇÃO E DESGASTE' }[sheet]}`, ''],
      ['MOTOR', name], ['ROTAÇÃO', `${fmt(st.rpm, 0)} rpm · ${fmt(Math.max(0, st.cv || 0), 1)} cv · ${fmt(Math.max(0, st.tq || 0), 1)} N·m`],
      [g.rot ? 'ROTOR' : 'Ø × CURSO', g.rot ? `R ${fmt(g.Rg * 1000, 0)} · e ${fmt(g.e * 1000, 1)} mm` : `${fmt(g.B * 1000, 1)} × ${fmt(g.S * 1000, 1)} mm · ε ${fmt(g.cr, 1)}:1`],
      ['ESC.', 'SEM ESCALA · COTAS EM mm'],
    ];
    rows.forEach(([a, b], i) => { const y = oy + (i + 0.5) * h / rows.length; if (i) { pen(THIN, 0.6); ln(ox, oy + i * h / rows.length, ox + w, oy + i * h / rows.length); }
      if (b) { txt(a, ox + 8, y, 'left', 9, THIN); txt(b, ox + w - 8, y, 'right', 10, INK); } else txt(a, ox + w / 2, y, 'center', 10, INK); });
  }

  // ---------- corte do cilindro (4T / 2T) ----------
  function section(S, g, ox, oy, bw, bh) {
    const B = g.B, a = g.a, L = g.L, ch = 0.45 * B, hc = g.vc / g.Ap, roof = a + L + ch + hc, two = g.two;
    const total = roof + 1.95 * B + a + 0.45 * B, k = Math.min(bh / total, bw / (4.4 * B)), cx = ox + bw / 2, cy = oy + bh - (a + 0.45 * B) * k;
    const P = (u, v) => [cx + u * k, cy - v * k], C = g.cyc, tc = (((S.thv - g.lay[0].off) % C) + C) % C, ps = tc * DEG;
    const pin = [a * Math.sin(ps), a * Math.cos(ps)], yp = pin[1] + Math.sqrt(L * L - pin[0] * pin[0]), crown = yp + ch;
    const tr = S.tr, b = tc | 0, T = tr ? tr.T[b] : 300, X = tr ? tr.X[b] : 0, p = tr ? tr.p[b] : 1;
    const li = tr && tr.li && !two ? tr.li[b] : g.Li[(tc * 2) | 0], le = tr && tr.le && !two ? tr.le[b] : g.Le[(tc * 2) | 0], liner = roof - hc - 2 * a - 0.75 * B;
    const gas = [P(-B / 2, crown), P(B / 2, crown), P(B / 2, roof), P(0, roof + (two ? 0.06 : 0.1) * B), P(-B / 2, roof)];
    x.fillStyle = gasRGBA(T, X, 0.6); path(gas, true); x.fill();
    const X0 = tr ? tr.X[g.ivc | 0] : 0, xb = clamp((X - X0) / Math.max(1e-3, 1 - X0), 0, 1);
    if ((tc < 220 || tc > C - 80) && xb > 0.004 && xb < 0.995) { // frente de chama a partir da vela
      x.save(); path(gas, true); x.clip(); const [fx, fy] = P(0, roof + 0.05 * B), r = Math.cbrt(xb) * 1.05 * B * k;
      const gr = x.createRadialGradient(fx, fy, 0, fx, fy, r); gr.addColorStop(0, 'rgba(255,240,180,0.9)'); gr.addColorStop(0.8, 'rgba(255,140,40,0.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(fx, fy, r, 0, 7); x.fill(); x.restore();
    }
    const th = S.st && S.st.heat;
    // camisa e bloco cortados; galerias de água na cor da temperatura do líquido
    for (const s of [-1, 1]) {
      const w0 = s * B / 2, w1 = s * (B / 2 + 0.09 * B), w2 = s * (B / 2 + 0.42 * B);
      if (two) { // 2 tempos: janela de escape (direita) e de transferência (esquerda) recortadas na camisa
        const yc = t2 => { const t = t2 * DEG, sn = Math.sin(t); return a * Math.cos(t) + Math.sqrt(L * L - a * a * sn * sn) + ch; };
        const yTop = s > 0 ? yc(g.E.epo) : yc(g.E.tpo), yBot = yc(180) - 0.05 * B;
        hatch(() => { path([P(w0, liner), P(w2, liner), P(w2, yBot), P(w0, yBot)], true); path([P(w0, yTop), P(w2, yTop), P(w2, roof), P(w0, roof)], true); }, 6, 'nonzero');
        pen(INK, 1.4); path([P(w0, liner), P(w0, yBot)]); x.stroke(); path([P(w0, yTop), P(w0, roof)]); x.stroke();
        x.fillStyle = s > 0 ? 'rgba(255,140,60,0.25)' : 'rgba(80,160,255,0.25)'; x.fillRect(...P(w0, yTop), (w2 - w0) * k, (yTop - yBot) * k);
        leader(...P(w2 * 0.9, (yTop + yBot) / 2), ...P(s * 1.5 * B, (yTop + yBot) / 2 + 0.3 * B), s > 0 ? 'JANELA DE ESCAPE' : 'TRANSFERÊNCIA');
      } else {
        hatch(() => { path([P(w0, liner), P(w1, liner), P(w1, roof), P(w0, roof)], true); path([P(w1 + s * 0.22 * B, liner + 0.2 * B), P(w2, liner + 0.2 * B), P(w2, roof), P(w1 + s * 0.22 * B, roof)], true); }, 6, 'nonzero');
        pen(INK, 1.4); path([P(w0, liner), P(w0, roof)]); x.stroke(); path([P(w2, liner + 0.2 * B), P(w2, roof)]); x.stroke();
        if (th) { x.fillStyle = heatCss(th.cool, 0.55); const q = P(w1 + (s < 0 ? -0.22 * B : 0), roof - 0.2 * B); x.fillRect(q[0], q[1], 0.22 * B * k, (roof - 0.2 * B - liner - 0.4 * B) * k); }
        pen(CL, 0.8, [5, 4]); x.strokeRect(...P(w1 + (s < 0 ? -0.22 * B : 0), roof - 0.2 * B), 0.22 * B * k, (roof - 0.2 * B - liner - 0.4 * B) * k); x.setLineDash([]);
      }
    }
    if (!two) leader(...P(-B / 2 - 0.2 * B, roof - 0.6 * B), ...P(-1.6 * B, roof - 1.0 * B), 'GALERIA DE ÁGUA');
    // cabeçote cortado
    const hy = roof + (two ? 0.5 : 1.0) * B, head = [P(-1.7 * B, roof), P(1.7 * B, roof), P(1.7 * B, hy), P(-1.7 * B, hy)];
    if (two) { hatch(() => { path(head, true); path(gas.slice(2).concat([P(-B / 2, roof)]), true); }, 7); pen(INK, 1.6); path(head, true); x.stroke(); }
    else {
      const portI = [P(-0.38 * B, roof + 0.02 * B), P(-0.6 * B, roof + 0.45 * B), P(-1.7 * B, roof + 0.6 * B), P(-1.7 * B, roof + 0.25 * B), P(-0.75 * B, roof + 0.12 * B), P(-0.08 * B, roof + 0.02 * B)];
      const portE = portI.map(([u, v]) => [2 * cx - u, v]);
      x.fillStyle = 'rgba(80,140,255,0.18)'; path(portI, true); x.fill();
      x.fillStyle = `rgba(255,${(150 - 70 * clamp(((S.st ? S.st.egt : 30) - 300) / 600, 0, 1)) | 0},60,0.25)`; path(portE, true); x.fill();
      hatch(() => { path(head, true); path(portI, true); path(portE, true); path(gas.slice(2).concat([P(-B / 2, roof)]), true); }, 7);
      pen(INK, 1.6); path(head, true); x.stroke(); path(portI, true); x.stroke(); path(portE, true); x.stroke();
      const valve = (s, l, d) => {
        const t = s * 0.35, su = Math.sin(t), cu = Math.cos(t), base = [s * 0.23 * B, roof + 0.02 * B], at = (h, w) => P(base[0] + su * h + cu * w, base[1] - l + cu * h - su * w);
        x.fillStyle = BG; path([at(0, -d / 2), at(0, d / 2), at(0.06 * d, d / 2), at(0.25 * d, 0.07 * d), at(1.6 * d, 0.07 * d), at(1.6 * d, -0.07 * d), at(0.25 * d, -0.07 * d), at(0.06 * d, -d / 2)], true); x.fill();
        pen(INK, 1.4); x.stroke();
        pen(THIN, 1); x.beginPath(); for (let i = 0; i <= 12; i++) { const q = at(0.75 * d + i / 12 * 0.68 * d, (i % 2 ? 0.2 : -0.2) * d); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); } x.stroke();
        return at(1.6 * d + 0.17 * B, 0);
      };
      const camI = valve(-1, li, g.ivd), camE = valve(1, le, g.evd);
      const cam = (c, tab, o, cl) => {
        const pk = (o + cl) / 2, rot = (tc - pk) / 2 * DEG; x.beginPath();
        for (let i = 0; i <= 90; i++) { const psi = i / 90 * 2 * Math.PI - Math.PI, th2 = (((pk - 180 - 2 * psi / DEG) % C) + C) % C, r = (0.16 * B + tab[(th2 * 2) | 0]) * k, an = psi + rot;
          const q = [c[0] + r * Math.cos(an), c[1] - r * Math.sin(an)]; i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }
        x.closePath(); x.fillStyle = 'rgba(230,242,255,0.08)'; x.fill(); pen(INK, 1.3); x.stroke();
        pen(CL, 0.7, [8, 3, 2, 3]); ln(c[0] - 0.3 * B * k, c[1], c[0] + 0.3 * B * k, c[1]); ln(c[0], c[1] - 0.3 * B * k, c[0], c[1] + 0.3 * B * k); x.setLineDash([]);
      };
      cam(camI, g.Li, g.ivo, g.ivc); cam(camE, g.Le, g.evo, g.evc);
      const [ix, iy] = P(-1.0 * B, roof + 0.95 * B), [jx, jy] = P(-0.55 * B, roof + 0.3 * B);
      pen(INK, 1.3); x.strokeRect(ix - 5, iy - 18, 10, 26);
      if (S.pwDeg > 0 && ((tc - (S.eoi - S.pwDeg) + C) % C) <= S.pwDeg) { pen(HOT, 1, [3, 3]); for (let i = -2; i <= 2; i++) ln(ix, iy + 8, jx + i * 5, jy); x.setLineDash([]); }
      leader(...P(-0.23 * B, roof + 0.8 * B), ...P(-1.35 * B, roof + 1.65 * B), 'VÁLV. ADMISSÃO'); leader(...P(0.23 * B, roof + 0.8 * B), ...P(1.35 * B, roof + 1.65 * B), 'VÁLV. ESCAPE');
      leader(...P(-1.4 * B, roof + 0.4 * B), ...P(-1.85 * B, roof - 0.3 * B), 'PÓRTICO ADM.'); leader(...P(1.4 * B, roof + 0.4 * B), ...P(1.85 * B, roof - 0.3 * B), 'PÓRTICO ESC.');
      leader(ix, iy - 18, ...P(-1.6 * B, roof + 1.35 * B), 'BICO');
    }
    // vela e faísca
    const [px, py] = P(0, roof + (two ? 0.06 : 0.1) * B);
    x.fillStyle = BG; x.fillRect(px - 0.07 * B * k, py - 0.95 * B * k, 0.14 * B * k, 0.95 * B * k); pen(INK, 1.3); x.strokeRect(px - 0.07 * B * k, py - 0.95 * B * k, 0.14 * B * k, 0.95 * B * k);
    const spk = ((2 * C - (S.st ? S.st.adv : 0)) % C);
    if (S.st && S.st.fired && ((tc - spk + C) % C) < 14) { x.fillStyle = 'rgba(255,245,170,0.95)'; pen('#fff3a0', 1.5); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; ln(px, py + 4, px + Math.cos(an) * 14, py + 4 + Math.sin(an) * 14); } x.beginPath(); x.arc(px, py + 4, 5, 0, 7); x.fill(); }
    leader(px, py - 0.7 * B * k, ...P(0.7 * B, roof + 1.95 * B), 'VELA');
    // pistão, pino, biela, virabrequim
    const pw = 0.485 * B, pis = [P(-pw, crown), P(pw, crown), P(pw, crown - 0.55 * B), P(-pw, crown - 0.55 * B)], pin_ = [P(-pw + 0.06 * B, crown - 0.1 * B), P(pw - 0.06 * B, crown - 0.1 * B), P(pw - 0.06 * B, crown - 0.55 * B), P(-pw + 0.06 * B, crown - 0.55 * B)];
    x.fillStyle = th ? heatCss(th.pis, 0.35) : BG; path(pis, true); x.fill();
    hatch(() => { path(pis, true); path(pin_, true); }, 5); pen(INK, 1.6); path(pis, true); x.stroke(); path(pin_.slice(0, 2).concat([pin_[2], pin_[3]]), true); x.stroke();
    for (const r of [0.05, 0.08, 0.11]) { pen(INK, 1); ln(...P(-pw, crown - r * B), ...P(-pw + 0.04 * B, crown - r * B)); ln(...P(pw, crown - r * B), ...P(pw - 0.04 * B, crown - r * B)); }
    const W0 = P(0, yp), Pn = P(pin[0], pin[1]), ang = Math.atan2(W0[1] - Pn[1], W0[0] - Pn[0]), nx = -Math.sin(ang), ny = Math.cos(ang);
    const rb = 0.3 * B * k, rs = 0.17 * B * k;
    x.fillStyle = 'rgba(12,42,76,0.85)'; x.beginPath(); x.moveTo(Pn[0] + nx * rb * 0.6, Pn[1] + ny * rb * 0.6); x.lineTo(W0[0] + nx * rs * 0.6, W0[1] + ny * rs * 0.6); x.lineTo(W0[0] - nx * rs * 0.6, W0[1] - ny * rs * 0.6); x.lineTo(Pn[0] - nx * rb * 0.6, Pn[1] - ny * rb * 0.6); x.closePath(); x.fill();
    pen(INK, 1.4); x.stroke(); x.beginPath(); x.arc(Pn[0], Pn[1], rb, 0, 7); x.stroke(); x.beginPath(); x.arc(W0[0], W0[1], rs, 0, 7); x.stroke();
    hatch(() => { x.arc(W0[0], W0[1], 0.1 * B * k, 0, 7); }, 3); pen(INK, 1.2); x.beginPath(); x.arc(W0[0], W0[1], 0.1 * B * k, 0, 7); x.stroke();
    pen(CL, 0.7, [10, 3, 2, 3]); ln(Pn[0], Pn[1], W0[0], W0[1]); ln(cx, cy + (a + 0.4 * B) * k, cx, P(0, roof + 1.75 * B)[1]); x.setLineDash([]);
    pen(CL, 0.7, [6, 3, 2, 3]); x.beginPath(); x.arc(cx, cy, a * k, 0, 7); x.stroke(); x.setLineDash([]);
    const Rc = (a + 0.35 * B) * k; pen(INK, 1.4); x.beginPath(); x.arc(cx, cy, Rc, ps + 0.2 * Math.PI, ps + 0.8 * Math.PI); x.stroke();
    x.beginPath(); x.arc(cx, cy, 0.19 * B * k, 0, 7); x.stroke(); hatch(() => x.arc(cx, cy, 0.19 * B * k, 0, 7), 3);
    if (two) { pen(INK, 1.3); x.beginPath(); x.arc(cx, cy, (a + 0.55 * B) * k, 0, 7); x.stroke(); leader(cx - (a + 0.55 * B) * k * 0.7, cy + (a + 0.55 * B) * k * 0.7, ...P(-1.5 * B, -0.9 * B), 'CÁRTER (BOMBEIA A MISTURA)'); }
    // cotas e rótulos
    const top = P(0, a + L + ch), bot = P(0, L - a + ch);
    dim(...P(-B / 2, roof + (two ? 0.75 : 1.25) * B), ...P(B / 2, roof + (two ? 0.75 : 1.25) * B), 0, `Ø ${fmt(B * 1000, 1)}`);
    dim(...P(-B / 2 - 0.5 * B, L - a + ch), ...P(-B / 2 - 0.5 * B, a + L + ch), 18, `CURSO ${fmt(g.S * 1000, 1)}`);
    pen(THIN, 0.7, [4, 3]); ln(top[0] - B * 0.7 * k, top[1], top[0] + B * 0.95 * k, top[1]); ln(bot[0] - B * 0.7 * k, bot[1], bot[0] + B * 0.95 * k, bot[1]); x.setLineDash([]);
    lab('PMS', top[0] + B * 1.0 * k, top[1], 'left', 10, THIN); lab('PMI', bot[0] + B * 1.0 * k, bot[1], 'left', 10, THIN);
    const rA = 1.35 * a * k; pen(SEL, 1.2); x.beginPath(); x.arc(cx, cy, rA, -Math.PI / 2, -Math.PI / 2 + (ps % (2 * Math.PI))); x.stroke();
    const stroke = two ? (tc < 180 ? 'EXPANSÃO / ESCAPE' : 'LAVAGEM / COMPRESSÃO') : ['EXPANSÃO', 'ESCAPE', 'ADMISSÃO', 'COMPRESSÃO'][Math.floor(tc / 180) % 4];
    lab(`θ = ${fmt(tc, 0)}°  ${stroke}`, cx + rA + 10, cy - rA, 'left', 12, SEL);
    leader(...P(pw * 0.6, crown - 0.3 * B), ...P(1.4 * B, crown - 0.15 * B), 'PISTÃO');
    leader((Pn[0] + W0[0]) / 2, (Pn[1] + W0[1]) / 2, ...P(-1.45 * B, (pin[1] + yp) / 2), `BIELA L=${fmt(L * 1000, 1)}`); leader(cx - 0.19 * B * k, cy, ...P(-1.3 * B, -0.35 * B), 'VIRABREQUIM');
    if (tr && !two) { // setas de vazão nas válvulas
      const mi = tr.mi[b], me = tr.me[b], q = (v) => clamp(Math.abs(v) / 60, 0, 1) * 0.9 * B * k + 6;
      if (Math.abs(mi) > 0.5) { const [u, v] = P(-0.9 * B, roof + 0.35 * B); mi > 0 ? arrow(u - q(mi), v - q(mi) * 0.25, u, v, AIR) : arrow(u, v, u - q(mi), v - q(mi) * 0.25, AIR); }
      if (me > 0.5) { const [u, v] = P(0.9 * B, roof + 0.35 * B); arrow(u, v, u + q(me), v - q(me) * 0.25, HOT); }
    }
    txt(two ? 'CORTE A-A · CILINDRO 1 (2 TEMPOS)' : 'CORTE A-A · CILINDRO 1', cx, oy - 12, 'center', 13, INK); reserve(cx - 140, oy - 20, 280, 16);
    return { p, T };
  }

  // ---------- corte do rotativo ----------
  function sectionRot(S, g, ox, oy, bw, bh) {
    const e = g.e, R = g.Rg, k = Math.min(bw, bh) / (2.9 * (R + e)), cx = ox + bw / 2, cy = oy + bh / 2 + 10, C = g.cyc;
    const P = (u, v) => [cx + u * k, cy - v * k], tro = a => [e * Math.cos(3 * a) + R * Math.cos(a), e * Math.sin(3 * a) + R * Math.sin(a)];
    const th = S.thv, psi = th * DEG + 90 * DEG, ra = (th / 3 + 30) * DEG, cu = e * Math.cos(psi), cv = e * Math.sin(psi), tr = S.tr;
    for (let f = 0; f < 3; f++) { // câmaras
      const a0 = ra + f * 120 * DEG, pts = [];
      for (let q = 0; q <= 24; q++) pts.push(P(...tro(a0 + q / 24 * 120 * DEG)));
      const A0 = [cu + R * Math.cos(a0), cv + R * Math.sin(a0)], A1 = [cu + R * Math.cos(a0 + 120 * DEG), cv + R * Math.sin(a0 + 120 * DEG)], m = a0 + 60 * DEG, Cc = [cu + 0.74 * R * Math.cos(m), cv + 0.74 * R * Math.sin(m)];
      for (let q = 1; q < 12; q++) { const s = 1 - q / 12, z = 1 - s; pts.push(P(z * z * A1[0] + 2 * z * s * Cc[0] + s * s * A0[0], z * z * A1[1] + 2 * z * s * Cc[1] + s * s * A0[1])); }
      const tcf = ((th + 360 * f) % C + C) % C;
      x.fillStyle = gasRGBA(tr ? tr.T[tcf | 0] : 300, tr ? tr.X[tcf | 0] : 0, 0.6); path(pts, true); x.fill();
    }
    const hous = () => { x.ellipse(cx, cy, (R + e) * 1.3 * k, (R - e) * 1.55 * k, 0, 0, 7); for (let i = 0; i <= 120; i++) { const q = P(...tro(i / 120 * 2 * Math.PI)); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); } };
    hatch(hous, 7); pen(INK, 1.6); x.beginPath(); hous(); x.stroke();
    const rot = () => { const A = j => [cu + 0.985 * R * Math.cos(ra + j * 120 * DEG), cv + 0.985 * R * Math.sin(ra + j * 120 * DEG)]; x.moveTo(...P(...A(0)));
      for (let j = 0; j < 3; j++) { const m = ra + (j * 120 + 60) * DEG; x.quadraticCurveTo(...P(cu + 0.74 * R * Math.cos(m), cv + 0.74 * R * Math.sin(m)), ...P(...A(j + 1))); } };
    x.fillStyle = 'rgba(12,42,76,0.7)'; x.beginPath(); rot(); x.fill(); hatch(() => { rot(); x.moveTo(...P(cu + 0.32 * R, cv)); x.arc(...P(cu, cv), 0.32 * R * k, 0, 7); }, 9, 'evenodd', -45);
    pen(INK, 1.6); x.beginPath(); rot(); x.stroke();
    pen(CL, 0.7, [6, 3, 2, 3]); x.beginPath(); x.arc(cx, cy, e * k, 0, 7); x.stroke(); ln(cx - (R + e) * 1.4 * k, cy, cx + (R + e) * 1.4 * k, cy); ln(cx, cy - (R) * 1.7 * k, cx, cy + R * 1.7 * k); x.setLineDash([]);
    pen(INK, 1.2); x.beginPath(); x.arc(...P(cu, cv), 0.32 * R * k, 0, 7); x.stroke(); x.beginPath(); x.arc(cx, cy, 0.16 * R * k, 0, 7); x.stroke();
    for (const al of [80, 100]) { const [u, v] = tro(al * DEG), q = P(u * 1.05, v * 1.05); pen(INK, 1.3); x.strokeRect(q[0] - 4, q[1] - 26, 8, 22); }
    const [ue, ve] = tro(228 * DEG); arrow(...P(ue, ve), ...P(ue * 1.55, ve * 1.55), HOT);
    const [ui, vi] = tro(305 * DEG); arrow(...P(ui * 1.5, vi * 1.5), ...P(ui * 0.95, vi * 0.95), AIR);
    dim(cx, cy, ...P(R * Math.cos(ra) + cu, R * Math.sin(ra) + cv), 0, `R ${fmt(R * 1000, 0)}`);
    lab(`e = ${fmt(e * 1000, 1)} mm  ·  Vd = ${fmt(g.vd * 1e6, 0)} cm³/face  ·  θ eixo = ${fmt(((th % C) + C) % C, 0)}°`, cx, oy + bh - 6, 'center', 11, SEL);
    leader(...P(R * 0.95, R * 0.75), ...P(R * 1.3, R * 1.3), 'VELAS'); leader(...P(ue * 1.3, ve * 1.3), ...P(ue * 1.25, ve * 2.0), 'JANELA ESCAPE'); leader(...P(ui * 1.2, vi * 1.2), ...P(ui * 1.1, vi * 2.0), 'JANELA ADMISSÃO');
    txt('CORTE A-A · ROTOR 1', cx, oy - 12, 'center', 13, INK); reserve(cx - 100, oy - 20, 200, 16);
    return { p: tr ? tr.p[((th % C) + C) % C | 0] : 1, T: tr ? tr.T[((th % C) + C) % C | 0] : 300 };
  }

  // ---------- diagramas da câmara ----------
  function timing(S, g, cx, cy, r) {
    const C = g.cyc, an = t => -Math.PI / 2 + t / C * 2 * Math.PI, tc = (((S.thv - g.lay[0].off) % C) + C) % C;
    const strokes = g.rot ? [['EXPANSÃO', 0, 270], ['ESCAPE', 270, 540], ['ADMISSÃO', 540, 810], ['COMPRESSÃO', 810, 1080]] : g.two ? [['EXPANSÃO', 0, 180], ['COMPRESSÃO', 180, 360]] : [['EXPANSÃO', 0, 180], ['ESCAPE', 180, 360], ['ADMISSÃO', 360, 540], ['COMPRESSÃO', 540, 720]];
    strokes.forEach(([n, a0, a1], i) => {
      x.fillStyle = ['rgba(255,140,40,0.14)', 'rgba(180,120,90,0.12)', 'rgba(60,130,246,0.14)', 'rgba(140,90,255,0.12)'][g.two && i ? 3 : i];
      x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, an(a0), an(a1)); x.closePath(); x.fill();
      const m = an((a0 + a1) / 2); txt(n, cx + Math.cos(m) * r * 0.55, cy + Math.sin(m) * r * 0.55, 'center', 9, THIN);
    });
    pen(INK, 1.2); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
    const arc = (a0, a1, rr, col, l) => { pen(col, 4); x.beginPath(); x.arc(cx, cy, rr, an(a0), an(a1 < a0 ? a1 + C : a1)); x.stroke();
      lab(l, cx + Math.cos(an(a0)) * (rr + 16), cy + Math.sin(an(a0)) * (rr + 16), 'center', 9, col); };
    lab('PMS', cx, cy - r - 30, 'center', 9, THIN);
    arc(g.ivo, g.ivc, r + 8, AIR, g.rot ? 'AJA' : g.two ? 'TRANSF.' : 'AA'); arc(g.evo, g.evc, r + 16, HOT, g.rot ? 'AJE' : g.two ? 'ESCAPE' : 'AE');
    if (S.pwDeg > 0) arc(S.eoi - S.pwDeg, S.eoi, r - 8, '#ffd27a', 'INJ');
    const sp = (2 * C - (S.st ? S.st.adv : 0)) % C; pen('#fff3a0', 2); ln(cx + Math.cos(an(sp)) * (r - 16), cy + Math.sin(an(sp)) * (r - 16), cx + Math.cos(an(sp)) * (r + 24), cy + Math.sin(an(sp)) * (r + 24));
    lab('FAÍSCA', cx + Math.cos(an(sp)) * (r + 36), cy + Math.sin(an(sp)) * (r + 36), 'center', 9, '#fff3a0');
    pen(SEL, 2.2); ln(cx, cy, cx + Math.cos(an(tc)) * (r + 4), cy + Math.sin(an(tc)) * (r + 4)); x.fillStyle = SEL; x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fill();
    lab(`DISTRIBUIÇÃO · 1 volta = ciclo de ${C}°`, cx, cy + r + 38, 'center', 10, INK);
  }
  function pvPanel(S, g, r) {
    const tr = S.tr; if (!tr) { txt('ligue o motor', r.x + r.w / 2, r.y + r.h / 2, 'center', 10, THIN); return; }
    const vs = Array.from(tr.v), ps = Array.from(tr.p), pm = Math.max(...ps) * 1.1;
    const q = plot(r, vs, [], { x0: 0, x1: Math.max(...vs), y0: 0, y1: pm, xl: 'cm³', yl: 'bar' });
    pen(SEL, 1.4); x.beginPath(); for (let i = 0; i <= g.cyc; i++) { const j = i % g.cyc; i ? x.lineTo(q.X(vs[j]), q.Y(ps[j])) : x.moveTo(q.X(vs[j]), q.Y(ps[j])); } x.stroke();
    const j = (((S.thv - g.lay[0].off) % g.cyc) + g.cyc) % g.cyc | 0; x.fillStyle = '#fff'; x.beginPath(); x.arc(q.X(vs[j]), q.Y(ps[j]), 4, 0, 7); x.fill();
  }
  function liftPanel(S, g, r) { // levante pelo came (tracejado) × levante real com a mola (cheio): flutuação aparece aqui
    const C = g.cyc, n = 180, xs = [], ci = [], ce = [], ri = [], re = [], tr = S.tr, two = g.two, rot = g.rot, sc = rot ? 100 : 1000;
    for (let i = 0; i <= n; i++) { const t = i / n * C; xs.push(t); ci.push(g.Li[Math.min(2 * C - 1, (t * 2) | 0)] * sc); ce.push(g.Le[Math.min(2 * C - 1, (t * 2) | 0)] * sc);
      ri.push(tr && tr.li && !two && !rot ? tr.li[Math.min(C - 1, t | 0)] * sc : NaN); re.push(tr && tr.le && !two && !rot ? tr.le[Math.min(C - 1, t | 0)] * sc : NaN); }
    const real = !two && !rot && tr && tr.li;
    const series = [{ ys: ci, col: AIR, dash: real ? [4, 3] : [] }, { ys: ce, col: HOT, dash: real ? [4, 3] : [] }];
    if (real) series.push({ ys: ri, col: AIR, w: 2 }, { ys: re, col: HOT, w: 2 });
    const ymax = Math.max(...ci, ...ce, ...(real ? ri.concat(re) : [0])) * 1.15;
    const q = plot(r, xs, series, { x0: 0, x1: C, y0: 0, y1: ymax || 1, xl: '° do ciclo', yl: two ? 'abertura da janela (mm)' : rot ? 'abertura (%)' : 'levante (mm)', yd: 1 });
    const tc = (((S.thv - g.lay[0].off) % C) + C) % C; pen(SEL, 1); ln(q.X(tc), q.b, q.X(tc), q.b - q.h);
    const fl = S.st ? S.st.flt : 0;
    if (real) lab(fl > 0.05 ? `FLUTUAÇÃO: +${fmt(fl, 2)} mm além do came` : 'tracejado = came · cheio = válvula real (mola)', q.l + q.w - 4, q.b - q.h + 10, 'right', 9, fl > 0.05 ? BAD : THIN);
  }

  // ---------- admissão ----------
  function intakeSheet(S, g, r) {
    const st = S.st || {}, F = g.fi, inp = S.inp || {}, items = [];
    items.push(['TOMADA DE AR', `${fmt(st.Tamb != null ? st.Tamb : 25, 0)} °C · 101 kPa`], ['FILTRO', '']);
    if (F && F.type === 'turbo') items.push(['COMPRESSOR', `${fmt(st.PR || 1, 2)}:1 · ${fmt(st.T2, 0)} °C`], ['INTERCOOLER', `${fmt(st.Tab, 0)} °C`]);
    if (F && F.type === 'sc') items.push(['SUPERCHARGER', `${fmt(st.PR || 1, 2)}:1`], ['INTERCOOLER', `${fmt(st.Tab, 0)} °C`]);
    items.push(['BORBOLETA', `${fmt((S.tps || 0) * 100, 0)}% aberta`], [g.plen ? 'PLENUM' : 'CORNETA', `MAP ${fmt(st.map, 0)} kPa`], ['DUTO', `${fmt(g.E.lin * 1000, 0)} mm`], [g.two ? 'PALHETA → CÁRTER' : g.rot ? 'JANELA' : 'VÁLVULA', `VE ${fmt(st.ve, 0)}%`]);
    // fluxo em corte: retângulos ligados por tubos, largura do tubo ∝ área
    const p1 = panel(r.x, r.y, r.w, r.h * 0.42, 'CAMINHO DO AR (CORTE ESQUEMÁTICO)'), n = items.length, bw = Math.min(110, (p1.w - 10 * (n - 1)) / n), gap = (p1.w - n * bw) / (n - 1), cy = p1.y + p1.h * 0.45;
    items.forEach(([nm, v], i) => {
      const bx = p1.x + i * (bw + gap), h = nm === 'FILTRO' ? 60 : nm.startsWith('PLENUM') ? 70 : nm === 'DUTO' ? 26 : 44;
      x.fillStyle = nm === 'FILTRO' ? 'rgba(233,217,166,0.15)' : 'rgba(80,140,255,0.12)'; x.fillRect(bx, cy - h / 2, bw, h);
      hatch(() => { x.rect(bx - 4, cy - h / 2 - 6, bw + 8, 6); x.rect(bx - 4, cy + h / 2, bw + 8, 6); }, 5);
      pen(INK, 1.3); x.strokeRect(bx, cy - h / 2, bw, h);
      if (nm === 'FILTRO') { pen(THIN, 0.8); for (let k = 0; k < 8; k++) ln(bx + 6 + k * (bw - 12) / 7, cy - h / 2 + 4, bx + 6 + k * (bw - 12) / 7 + 4, cy + h / 2 - 4); }
      if (nm === 'BORBOLETA') { const a = (7 + 83 * (S.tps || 0)) * DEG; pen(SEL, 2.4); ln(bx + bw / 2 - Math.cos(a) * h * 0.4, cy - Math.sin(a) * h * 0.4, bx + bw / 2 + Math.cos(a) * h * 0.4, cy + Math.sin(a) * h * 0.4); }
      lab(nm, bx + bw / 2, cy - h / 2 - 16, 'center', 9, INK); lab(v, bx + bw / 2, cy + h / 2 + 16, 'center', 9, THIN);
      if (i) arrow(bx - gap + 2, cy, bx - 2, cy, AIR, 6);
    });
    // vazão na válvula ao longo do ciclo × levante
    const p2 = panel(r.x, r.y + r.h * 0.48, r.w * 0.6, r.h * 0.52, 'VAZÃO NA ADMISSÃO DO CILINDRO 1 (g/s)'), tr = S.tr;
    if (tr) {
      const C = g.cyc, xs = [], mi = [], li = []; let mx = 1;
      for (let i = 0; i < C; i += 2) { xs.push(i); mi.push(tr.mi[i]); mx = Math.max(mx, Math.abs(tr.mi[i])); }
      for (let i = 0; i < C; i += 2) li.push(g.Li[i * 2] / Math.max(1e-6, Math.max(...g.Li)) * mx);
      const q = plot(p2, xs, [{ ys: li, col: THIN, dash: [3, 3], w: 1 }, { ys: mi, col: AIR, w: 1.8 }], { x0: 0, x1: C, y0: -mx * 0.4, y1: mx * 1.1, xl: '° do ciclo', yl: 'g/s' });
      pen(THIN, 0.6); ln(q.l, q.Y(0), q.l + q.w, q.Y(0));
      lab('negativo = refluxo (gás volta para o duto)', q.l + 4, q.Y(-mx * 0.3), 'left', 9, THIN);
    } else txt('ligue o motor', p2.x + p2.w / 2, p2.y + p2.h / 2, 'center', 10, THIN);
    const p3 = panel(r.x + r.w * 0.63, r.y + r.h * 0.48, r.w * 0.37, r.h * 0.52, 'COMO FUNCIONA');
    wrap(['A borboleta controla quanto ar passa: fechada, o coletor fica em vácuo (MAP baixo) e o motor faz força para puxar (bombeamento).',
      'Quando a válvula abre, o ar acelera no duto. A onda de pressão volta do fim do duto e, se chegar perto do fechamento, empurra mais ar para dentro (efeito ram) — eficiência volumétrica acima de 100% em algumas rotações.',
      g.fi ? 'O compressor aumenta a pressão; o ar esquenta e o intercooler o esfria antes de entrar (ar frio é mais denso).' : 'Duto longo favorece giro baixo; curto favorece giro alto.'], p3, 10);
  }
  function wrap(pars, r, sz = 10) { // parágrafos que quebram linha dentro do quadro
    x.font = font(sz); let y = r.y + 4;
    for (const p of pars) { let line = ''; for (const w of p.split(' ')) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > r.w) { txt(line, r.x, y, 'left', sz, THIN); y += sz + 4; line = w; } else line = t; } if (line) { txt(line, r.x, y, 'left', sz, THIN); y += sz + 4; } y += 6; if (y > r.y + r.h) break; }
    reserve(r.x, r.y, r.w, y - r.y);
  }

  // ---------- escape ----------
  function exhaustSheet(S, g, r) {
    const st = S.st || {}, inp = S.inp || {}, X = EngineLib.EXH[inp.exh || 'stock'], two = g.two && !g.fi;
    const p1 = panel(r.x, r.y, r.w, r.h * 0.45, two ? 'CÂMARA DE EXPANSÃO (PERFIL COTADO)' : 'SISTEMA DE ESCAPE (CORTE LONGITUDINAL)');
    const cy = p1.y + p1.h * 0.5;
    if (two) {
      const pp = g.E.pipe, Lt = pp.lb + 0.3, k = p1.w / Lt, r0 = 0.032, rb = 2.4 * r0, rs = 0.48 * r0, ky = (p1.h * 0.35) / rb, s1 = 0.35 * pp.ld, s2 = pp.ld, s4 = pp.lb, s3 = s4 - 0.35 * (s4 - s2);
      const rf = s => s < s1 ? r0 * (1 + 0.15 * s / s1) : s < s2 ? r0 * 1.15 + (rb - r0 * 1.15) * (s - s1) / (s2 - s1) : s < s3 ? rb : s < s4 ? rb + (rs - rb) * (s - s3) / (s4 - s3) : rs;
      const top = [], bot = []; for (let i = 0; i <= 80; i++) { const s = i / 80 * Lt; top.push([p1.x + s * k, cy - rf(s) * ky]); bot.push([p1.x + s * k, cy + rf(s) * ky]); }
      x.fillStyle = 'rgba(255,140,60,0.12)'; path(top.concat(bot.slice().reverse()), true); x.fill(); pen(INK, 1.6); path(top); x.stroke(); path(bot); x.stroke();
      pen(CL, 0.7, [10, 3, 2, 3]); ln(p1.x, cy, p1.x + p1.w, cy); x.setLineDash([]);
      dim(p1.x, cy + rb * ky + 14, p1.x + s2 * k, cy + rb * ky + 14, 10, `${fmt(s2 * 1000, 0)} até o fim do cone divergente`);
      dim(p1.x, cy + rb * ky + 40, p1.x + s4 * k, cy + rb * ky + 40, 10, `${fmt(s4 * 1000, 0)} até o fim do cone convergente`);
      lab('CONE DIVERGENTE → devolve DEPRESSÃO (puxa a mistura)', p1.x + (s1 + s2) / 2 * k, cy - rb * ky - 14, 'center', 9, AIR);
      lab('CONE CONVERGENTE → devolve PULSO (empurra de volta)', p1.x + (s3 + s4) / 2 * k, cy - rb * ky - 30, 'center', 9, HOT);
    } else {
      const parts = [['COLETOR', g.rot ? `${g.n} rotores` : `${g.nch} → ${g.grp.length}`, 0.9]];
      if (g.fi && g.fi.type === 'turbo') parts.push(['TURBINA', `${fmt(st.pt, 0)} kPa`, 0.8]);
      if (X.cat) parts.push(['CATALISADOR', 'colmeia cerâmica', 1.1]); if (X.res) parts.push(['RESSONADOR', 'anti-ronco', 0.9]);
      if (X.muff) parts.push([X.muff > 1 ? 'ABAFADOR 2 CÂMARAS' : 'ABAFADOR RETO', X.muff > 1 ? 'chicanas' : 'fibra', 1.6]);
      parts.push(['PONTEIRA', X.muff ? '' : 'saída direta', 0.5]);
      const tot = parts.reduce((s, p) => s + p[2], 0) + (parts.length - 1) * 0.35, k = p1.w / tot, rp = 7;
      let px = p1.x;
      parts.forEach(([nm, v, len], i) => {
        const w = len * k, h = nm.startsWith('ABAF') ? 56 : nm === 'CATALISADOR' ? 44 : nm === 'RESSONADOR' ? 34 : nm === 'TURBINA' ? 40 : 2 * rp + 6;
        if (nm === 'COLETOR') { const m = Math.min(4, g.grp.length > 1 ? 2 : g.nch); for (let j = 0; j < m; j++) { pen(INK, 1.2); x.beginPath(); x.moveTo(px, cy - 30 + j * 20); x.quadraticCurveTo(px + w * 0.6, cy - 30 + j * 20, px + w, cy); x.stroke(); } }
        else {
          x.fillStyle = 'rgba(230,242,255,0.05)'; x.fillRect(px, cy - h / 2, w, h); hatch(() => { x.rect(px, cy - h / 2, w, 5); x.rect(px, cy + h / 2 - 5, w, 5); }, 4); pen(INK, 1.3); x.strokeRect(px, cy - h / 2, w, h);
          if (nm === 'CATALISADOR') { pen(THIN, 0.6); for (let j = 1; j < 9; j++) ln(px + w * 0.15, cy - h / 2 + j * h / 9, px + w * 0.85, cy - h / 2 + j * h / 9); }
          if (nm.startsWith('ABAFADOR 2')) { pen(INK, 1.2); ln(px + w / 3, cy - h / 2, px + w / 3, cy + h / 2); ln(px + 2 * w / 3, cy - h / 2, px + 2 * w / 3, cy + h / 2); arrow(px + 4, cy - 8, px + w / 3 - 4, cy - 8, HOT, 5); arrow(px + w / 3 + 4, cy + 10, px + 2 * w / 3 - 4, cy + 10, HOT, 5); arrow(px + 2 * w / 3 + 4, cy - 8, px + w - 4, cy - 8, HOT, 5); }
          if (nm === 'ABAFADOR RETO' || nm === 'RESSONADOR') { pen(THIN, 0.8, [2, 2]); x.strokeRect(px, cy - rp, w, 2 * rp); x.setLineDash([]); x.fillStyle = 'rgba(232,210,122,0.15)'; x.fillRect(px, cy - h / 2 + 5, w, h / 2 - rp - 5); x.fillRect(px, cy + rp, w, h / 2 - rp - 5); }
        }
        lab(nm, px + w / 2, cy - h / 2 - 14, 'center', 9, INK); if (v) lab(v, px + w / 2, cy + h / 2 + 14, 'center', 9, THIN);
        px += w;
        if (i < parts.length - 1) { pen(INK, 1.3); ln(px, cy - rp, px + 0.35 * k, cy - rp); ln(px, cy + rp, px + 0.35 * k, cy + rp); arrow(px + 2, cy, px + 0.35 * k - 2, cy, HOT, 5); px += 0.35 * k; }
      });
    }
    // onda de pressão no header (ida + volta refletida)
    const p2 = panel(r.x, r.y + r.h * 0.5, r.w * 0.6, r.h * 0.5, 'PRESSÃO AO LONGO DO HEADER AGORA (kPa, onda)');
    if (st.ew && st.ew.length) {
      const xs = st.ew.map((_, i) => i / (st.ew.length - 1) * g.E.lex * 1000), ys = Array.from(st.ew), m = Math.max(5, ...ys.map(Math.abs));
      const q = plot(p2, xs, [{ ys, col: HOT, w: 2 }], { y0: -m, y1: m, xl: 'mm a partir da válvula', yl: 'kPa' });
      pen(THIN, 0.6); ln(q.l, q.Y(0), q.l + q.w, q.Y(0)); lab(g.two ? 'câmara' : 'junção (coletor)', q.l + q.w - 4, q.b - q.h + 10, 'right', 9, THIN);
    } else txt('ligue o motor', p2.x + p2.w / 2, p2.y + p2.h / 2, 'center', 10, THIN);
    const p3 = panel(r.x + r.w * 0.63, r.y + r.h * 0.5, r.w * 0.37, r.h * 0.5, 'DADOS');
    const rows = [['EGT', `${fmt(st.egt, 0)} °C`], ['Contrapressão', `${fmt(st.pt, 0)} kPa`], ['Restrição', X.nome.split(' (')[0]], ['Estalos', `${fmt(st.pops, 0)}`], ['Mapa de estalos', inp.crackle ? 'ligado' : 'desligado']];
    rows.forEach(([a, b], i) => { txt(a, p3.x, p3.y + 6 + i * 18, 'left', 10, THIN); txt(b, p3.x + p3.w, p3.y + 6 + i * 18, 'right', 10, INK); });
    reserve(p3.x, p3.y, p3.w, rows.length * 18 + 6);
    wrap([two ? 'No 2 tempos o escape é afinado: a depressão do cone divergente ajuda a puxar mistura nova e o pulso do cone convergente devolve ao cilindro o que escaparia, logo antes da janela fechar.' : 'Cada pulso sai quando a válvula abre; ao chegar à junção, parte volta como depressão e ajuda a esvaziar o cilindro no cruzamento de válvulas. Catalisador e abafador seguram pressão e agudos.'], { x: p3.x, y: p3.y + rows.length * 18 + 14, w: p3.w, h: p3.h - rows.length * 18 - 14 }, 9);
  }

  // ---------- turbo ----------
  function turboSheet(S, g, r) {
    const st = S.st || {}, F = g.fi;
    if (!F) { txt('Motor aspirado — sem turbo ou supercharger.', r.x + r.w / 2, r.y + r.h / 2, 'center', 12, THIN); return; }
    const p1 = panel(r.x, r.y, r.w * 0.6, r.h * 0.62, 'MAPA DO COMPRESSOR'), TA = 298, Nd = F.Nd;
    const mmax = F.mch * 1.25, PRmax = 1 + (Math.pow(1 + 0.675 * Math.pow(Nd * 1.15 * F.rc, 2) / (1005 * TA), 3.5) - 1) * 1.05;
    const q = plot(p1, [0, mmax], [], { x0: 0, x1: mmax, y0: 1, y1: PRmax, xl: 'vazão de ar (kg/s)', yl: 'razão de pressão', xd: 2, yd: 1 });
    const surge = [], choke = [];
    for (const f of [0.4, 0.6, 0.8, 1.0, 1.15]) { // linhas de rotação: PR = 1 + (PR0−1)(1 − (m/mch)²)
      const U = Nd * f * F.rc, PR0 = Math.pow(1 + 0.675 * U * U / (1005 * TA), 3.5), mch = F.mch * f, pts = [];
      for (let i = 0; i <= 30; i++) { const m = 0.35 * mch + i / 30 * 0.65 * mch, PR = 1 + (PR0 - 1) * (1 - (m / mch) ** 2); pts.push([q.X(m), q.Y(PR)]); }
      pen(THIN, 1); path(pts); x.stroke(); lab(`${fmt(f * Nd * 30 / Math.PI / 1000, 0)}k rpm`, pts[0][0] - 2, pts[0][1] - 8, 'right', 8, THIN);
      surge.push(pts[0]); choke.push(pts[pts.length - 1]);
    }
    pen(BAD, 1.6, [6, 3]); path(surge); x.stroke(); pen(HOT, 1.4, [3, 3]); path(choke); x.stroke(); x.setLineDash([]);
    lab('SURGE (fluxo volta)', surge[surge.length - 1][0] - 4, surge[surge.length - 1][1] - 10, 'right', 9, BAD); lab('CHOKE (som no rotor)', choke[choke.length - 1][0], choke[choke.length - 1][1] + 12, 'center', 9, HOT);
    if (st.PR) { const px = q.X(clamp(st.mc || 0, 0, mmax)), py = q.Y(clamp(st.PR, 1, PRmax)); x.fillStyle = SEL; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill(); lab(`AGORA ${fmt(st.PR, 2)}:1`, px + 10, py - 10, 'left', 10, SEL); }
    // circuito do ar (vertical)
    const p2 = panel(r.x + r.w * 0.63, r.y, r.w * 0.37, r.h * 0.62, 'CIRCUITO DO AR'), turbo = F.type === 'turbo';
    const items = [['FILTRO', `${fmt(st.Tamb != null ? st.Tamb : 25, 0)} °C`], [turbo ? 'COMPRESSOR' : 'SUPERCHARGER', `${fmt(st.PR || 1, 2)}:1 · ${fmt((st.trpm || 0) / 1000, 0)}k rpm`], ['INTERCOOLER', `${fmt(st.T2, 0)} → ${fmt(st.Tab, 0)} °C`], ['BORBOLETA', `${fmt((S.tps || 0) * 100, 0)}%`], ['MOTOR', `+${fmt(Math.max(0, st.boost || 0), 0)} kPa`]];
    if (turbo) items.push(['TURBINA', `${fmt(st.pt, 0)} kPa · WG ${fmt(st.wg, 0)}%`], ['ESCAPE', `${fmt(st.egt, 0)} °C`]);
    const bh = Math.min(34, (p2.h - 10 * (items.length - 1)) / items.length);
    items.forEach(([nm, v], i) => { const y = p2.y + i * (bh + 10); pen(nm === 'MOTOR' ? SEL : INK, 1.3); x.strokeRect(p2.x, y, p2.w, bh); txt(nm, p2.x + 8, y + bh / 2, 'left', 9, INK); txt(v, p2.x + p2.w - 8, y + bh / 2, 'right', 9, THIN); if (i) arrow(p2.x + p2.w / 2, y - 10, p2.x + p2.w / 2, y - 1, nm === 'TURBINA' || nm === 'ESCAPE' ? HOT : AIR, 5); });
    reserve(p2.x, p2.y, p2.w, items.length * (bh + 10));
    const p3 = panel(r.x, r.y + r.h * 0.67, r.w, r.h * 0.33, 'COMO FUNCIONA');
    wrap([turbo ? 'A turbina, girando com o gás de escape, move o compressor no mesmo eixo. Cada linha do mapa é uma rotação do eixo: mais rotação, mais pressão. À esquerda da linha vermelha (surge) o ar volta pelo compressor; à direita (choke) ele não consegue passar mais rápido. A wastegate desvia gás da turbina para segurar a pressão alvo.' : 'O supercharger é tocado pela correia do virabrequim: a rotação do rotor acompanha o motor, então a pressão sobe com o giro sem atraso, mas custa potência do próprio motor.',
      'Comprimir esquenta o ar (veja a temperatura depois do compressor); o intercooler resfria para o ar entrar mais denso e com menos risco de detonação.'], p3, 10);
  }

  // ---------- hélice (avião) ----------
  // mesma geometria da pá do 3D e mesma física do drive.js (P = kq·ω³·cp(J), tração = min(disco atuador, 0,82·P/v))
  function propSheet(S, g, r) {
    const st = S.st || {}, d = st.dl || {}, V = g.veh, E = g.E, D = V.propD || 2, Rm = D / 2, red = V.red || 1, nb = V.blades || 2, pitch = 0.8 * D;
    const chord = u => Rm * (0.07 + 0.06 * Math.sin(Math.PI * Math.min(1, 0.2 + u))) * Math.sqrt(Math.max(0.04, 1 - Math.pow(u, 8))), r0 = 0.08 * Rm;
    const p1 = panel(r.x, r.y, r.w, r.h * 0.5, `HÉLICE DE PASSO FIXO · ${nb} PÁS · Ø ${fmt(D, 2)} m${red < 1 ? ` · REDUÇÃO ${fmt(1 / red, 2)}:1` : ' · DIRETO NO VIRABREQUIM'}`);
    const sc = (p1.w - 120) / Rm, hx = p1.x + 40, cy = p1.y + p1.h * 0.32, cs = Math.min(sc, p1.h * 0.25 / (0.14 * Rm));
    pen(INK, 1.4); x.beginPath(); x.arc(hx, cy, r0 * sc, 0, 7); x.stroke(); txt('cubo', hx, cy + r0 * sc + 10, 'center', 9, THIN);
    const top = [], bot = []; for (let i = 0; i <= 40; i++) { const u = i / 40, rr = r0 + (Rm - r0) * u, c = chord(u) * cs; top.push([hx + rr * sc, cy - c * 0.4]); bot.push([hx + rr * sc, cy + c * 0.6]); }
    path(top.concat(bot.reverse()), true); x.fillStyle = 'rgba(230,242,255,0.06)'; x.fill(); pen(INK, 1.5); x.stroke();
    pen(CL, 0.8, [8, 3, 2, 3]); ln(hx - 20, cy, hx + Rm * sc + 20, cy); x.setLineDash([]);
    dim(hx, cy - 0.12 * Rm * cs - 6, hx + Rm * sc, cy - 0.12 * Rm * cs - 6, -10, `R = ${fmt(Rm, 2)} m`);
    for (const u of [0.25, 0.5, 0.75, 0.95]) { // seções da pá: o ângulo cai do cubo para a ponta
      const rr = r0 + (Rm - r0) * u, b = Math.atan(pitch / (2 * Math.PI * rr)), c = chord(u) * cs * 0.9, t = c * (0.22 - 0.13 * u), px = hx + rr * sc, py = p1.y + p1.h * 0.78;
      pen(THIN, 0.6, [2, 3]); ln(px, cy + chord(u) * cs * 0.6, px, py - c / 2 - 4); x.setLineDash([]);
      x.save(); x.translate(px, py); x.rotate(-b); x.beginPath(); for (let k = 0; k <= 32; k++) { const f = k / 32 * 2 * Math.PI, a = c / 2 * Math.cos(f), h = t / 2 * Math.sin(f) * (Math.sin(f) > 0 ? 1 : 0.35); k ? x.lineTo(a, -h) : x.moveTo(a, -h); } x.closePath();
      x.fillStyle = 'rgba(255,154,60,0.25)'; x.fill(); pen(SEL, 1.2); x.stroke(); x.restore();
      pen(THIN, 0.6); ln(px - c * 0.6, py, px + c * 0.6, py);
      lab(`r/R ${fmt(u, 2)} · β ${fmt(b / DEG, 0)}°`, px, py + c * 0.5 + 10, 'center', 9, INK);
    }
    txt('seções (giro → para a direita): mais "em pé" perto do cubo, quase deitada na ponta', p1.x + 4, p1.y + p1.h - 8, 'left', 9, THIN);
    // tração × velocidade: agora e a plena potência
    const rho = 1.2, A = Math.PI * D * D / 4, wpk = E.ref.rpmP * g.limit / E.limit * Math.PI / 30 * red, kq = 0.95 * E.ref.cv * 735.5 * g.cc / E.cc / Math.pow(wpk, 3);
    const cpJ = J => clamp(1 - (J / 1.1) ** 2, 0.15, 1);
    const T = (w, v) => { const n = w / (2 * Math.PI), P = kq * w * w * w * cpJ(v / Math.max(0.5, n * D)), Tst = Math.cbrt(2 * rho * A * Math.pow(0.75 * P, 2)); return Math.min(Tst, 0.82 * P / Math.max(v, 1)) / 9.81; };
    const wNow = (st.rpm || 0) * Math.PI / 30 * red, vmax = Math.max(80, 1.15 * wpk / (2 * Math.PI) * D * 1.1), xs = Array.from({ length: 50 }, (_, i) => i / 49 * vmax);
    const p2 = panel(r.x, r.y + r.h * 0.55, r.w * 0.55, r.h * 0.45, 'TRAÇÃO × VELOCIDADE (kgf)');
    const pl = plot(p2, xs.map(v => v * 3.6), [{ ys: xs.map(v => T(wpk, v)), col: SEL }, { ys: xs.map(v => T(wNow, v)), col: AIR, dash: [5, 3] }], { y0: 0, xl: 'km/h' });
    const vNow = Math.abs(st.kmh || 0) / 3.6; x.fillStyle = INK; x.beginPath(); x.arc(pl.X(vNow * 3.6), pl.Y(clamp((d.thrust || 0) / 9.81, 0, 1e9)), 4, 0, 7); x.fill();
    txt('— plena potência', pl.l + pl.w - 4, pl.b - pl.h + 10, 'right', 9, SEL); txt('-- giro atual', pl.l + pl.w - 4, pl.b - pl.h + 22, 'right', 9, AIR);
    reserve(p2.x, p2.y, p2.w, p2.h);
    const p3 = panel(r.x + r.w * 0.58, r.y + r.h * 0.55, r.w * 0.42, r.h * 0.45, 'AGORA');
    const np = (st.rpm || 0) * red, tip = Math.PI * D * np / 60, J = vNow / Math.max(0.5, np / 60 * D);
    const rowsA = [['Motor', `${fmt(st.rpm, 0)} rpm`], ['Hélice', `${fmt(np, 0)} rpm`], ['Ponta da pá', `${fmt(tip, 0)} m/s · Mach ${fmt(Math.hypot(tip, vNow) / 340, 2)}`], ['Tração', `${fmt((d.thrust || 0) / 9.81, 0)} kgf`],
      ['Ar atrás da hélice', `${fmt((d.vAir || 0) * 3.6, 0)} km/h`], ['Avião', `${fmt(vNow * 3.6, 0)} km/h`], ['Avanço J = v/(n·D)', fmt(J, 2)]];
    rowsA.forEach(([a, b], i) => { txt(a, p3.x, p3.y + 6 + i * 17, 'left', 10, THIN); txt(b, p3.x + p3.w, p3.y + 6 + i * 17, 'right', 10, INK); });
    reserve(p3.x, p3.y, p3.w, rowsA.length * 17 + 6);
  }

  // ---------- câmbio ----------
  function gearboxSheet(S, g, r) {
    if (g.trans === 'prop') return propSheet(S, g, r);
    const st = S.st || {}, d = st.dl || {}, V = g.veh, type = g.trans, sel = st.gear || 0, DRV = EngineLib.DRV;
    const ratios = type === 'auto8' ? DRV.ZF_R.slice(1) : V.gears, fin = type === 'auto8' ? d.r && sel > 0 ? Math.abs(d.r) / DRV.ZF_R[sel] : V.final * (V.primary || 1) : V.final * (V.primary || 1);
    const p1 = panel(r.x, r.y, r.w, r.h * 0.55, { seq: 'CÂMBIO SEQUENCIAL (TAMBOR + GARFOS)', manual: 'CÂMBIO MANUAL 3 EIXOS (COM RÉ)', auto8: 'AUTOMÁTICO 8 MARCHAS (4 PLANETÁRIOS)', cvt: 'CVT (POLIAS VARIÁVEIS)' }[type]);
    if (type === 'auto8') {
      const els = ['A', 'B', 'C', 'D', 'E'], rows = ['R', '1', '2', '3', '4', '5', '6', '7', '8'], cw = Math.min(46, p1.w / 10), rh = Math.min(20, p1.h / 11), x0 = p1.x + 40, y0 = p1.y + 18;
      els.forEach((e, j) => txt(e, x0 + j * cw + cw / 2, y0, 'center', 11, INK)); txt('relação', x0 + 5 * cw + 30, y0, 'left', 10, THIN); txt('passo', x0 + 5 * cw + 100, y0, 'left', 10, THIN);
      rows.forEach((rr, i) => {
        const y = y0 + (i + 1) * rh, on = (sel < 0 && i === 0) || sel === i;
        if (on) { x.fillStyle = 'rgba(255,154,60,0.18)'; x.fillRect(p1.x, y - rh / 2, x0 + 5 * cw + 160 - p1.x, rh); }
        txt(rr, p1.x + 14, y, 'center', 11, on ? SEL : INK);
        els.forEach((e, j) => { if (DRV.ZF.shift[i].includes(e)) { x.fillStyle = on ? SEL : INK; x.beginPath(); x.arc(x0 + j * cw + cw / 2, y, 5, 0, 7); x.fill(); } });
        txt(fmt(DRV.ZF_R[i], 3), x0 + 5 * cw + 30, y, 'left', 10, on ? SEL : THIN);
        if (i > 1) txt(fmt(DRV.ZF_R[i - 1] / DRV.ZF_R[i], 2), x0 + 5 * cw + 100, y, 'left', 10, THIN);
      });
      reserve(p1.x, y0 - 10, x0 + 5 * cw + 160 - p1.x, rows.length * rh + 20);
      const bx = x0 + 5 * cw + 170, bw = p1.x + p1.w - bx;
      if (bw > 120) { // velocidade de cada membro (S, P, R dos 4 trens) relativa à entrada
        const sp = sel ? DRV.zf(sel < 0 ? 0 : sel, 1) : null, names = DRV.ZF.names;
        txt('rotação de cada peça (× entrada)', bx, y0, 'left', 9, THIN);
        names.forEach((nm, i) => { const y = y0 + 12 + i * ((p1.h - 30) / 12), v = sp ? sp[i] : 0, cxm = bx + bw / 2; txt(nm, bx, y, 'left', 9, INK); pen(THIN, 0.5); ln(cxm, y - 5, cxm, y + 5);
          x.fillStyle = Math.abs(v) < 1e-3 ? BAD : v > 0 ? OK : AIR; const len = clamp(v, -2, 2) / 2 * (bw / 2 - 30); x.fillRect(Math.min(cxm, cxm + len), y - 4, Math.abs(len) || 2, 8); });
        reserve(bx, y0 - 8, bw, p1.h - 10);
      }
    } else if (type === 'cvt') {
      const ri = clamp(Math.abs(d.cvt || 2.5) / ((V.primary || 1) * V.final), 0.42, 2.6), C0 = p1.w * 0.42, R0 = p1.h * 0.32, cx1 = p1.x + p1.w * 0.25, cy0 = p1.y + p1.h * 0.5, cx2 = cx1 + C0;
      let r1 = R0 * 0.6; for (let it = 0; it < 20; it++) { const r2 = Math.min(R0, r1 * ri), L = (a, b) => { const dr = a - b, gg = Math.acos(clamp(dr / C0, -1, 1)); return 2 * Math.sqrt(C0 * C0 - dr * dr) + a * (2 * Math.PI - 2 * gg) + b * 2 * gg; }; r1 *= L(R0 * 0.55, R0 * 0.55) / L(r1, r2); }
      const r2 = Math.min(R0, r1 * ri);
      for (const [c, rr, nm] of [[cx1, r1, 'POLIA MOTORA'], [cx2, r2, 'POLIA MOVIDA']]) { pen(THIN, 1, [4, 3]); x.beginPath(); x.arc(c, cy0, R0, 0, 7); x.stroke(); x.setLineDash([]); pen(SEL, 3); x.beginPath(); x.arc(c, cy0, rr, 0, 7); x.stroke(); lab(nm, c, cy0 + R0 + 14, 'center', 9, INK); lab(`raio ${fmt(rr / R0 * 100, 0)}%`, c, cy0 - R0 - 12, 'center', 9, THIN); }
      const dr = r1 - r2, gg = Math.acos(clamp(dr / C0, -1, 1)); pen(SEL, 2); for (const s of [-1, 1]) ln(cx1 + r1 * Math.cos(Math.PI - s * gg) * -1, cy0 + s * r1 * Math.sin(gg), cx2 + r2 * Math.cos(Math.PI - s * gg) * -1, cy0 + s * r2 * Math.sin(gg));
      const bx = cx2 + R0 + 40, bw = p1.x + p1.w - bx;
      if (bw > 60) { const rmax = Math.abs(d.r || 1) ? (V.primary || 1) * V.gears[0] * V.final * 1.05 : 1; txt('relação', bx, p1.y + 14, 'left', 9, THIN); pen(INK, 1); x.strokeRect(bx, p1.y + 26, 18, p1.h - 40); x.fillStyle = SEL; const f = clamp(Math.abs(d.cvt || 0) / rmax, 0, 1); x.fillRect(bx, p1.y + 26 + (p1.h - 40) * (1 - f), 18, (p1.h - 40) * f); txt(`${fmt(Math.abs(d.cvt || 0), 2)}:1`, bx + 24, p1.y + 26 + (p1.h - 40) * (1 - f), 'left', 10, SEL); reserve(bx, p1.y + 8, bw, p1.h - 10); }
    } else { // sequencial / manual: eixos, pares, luvas
      const n = ratios.length, pairsX = p1.x + 60, gw = (p1.w - 140) / (n + (type === 'manual' ? 2 : 0.5)), yI = p1.y + p1.h * 0.28, yO = p1.y + p1.h * (type === 'manual' ? 0.58 : 0.72), yC = p1.y + p1.h * 0.86;
      pen(INK, 1.6); ln(p1.x, yI, p1.x + p1.w - 20, yI); txt(type === 'manual' ? 'ENTRADA → SAÍDA (mesmo eixo)' : 'PRIMÁRIO', p1.x, yI - 12, 'left', 9, THIN);
      if (type === 'manual') { ln(pairsX, yC, p1.x + p1.w - 40, yC); txt('CONTRA-EIXO', p1.x, yC, 'left', 9, THIN); }
      else { ln(pairsX - 20, yO, p1.x + p1.w - 20, yO); txt('SECUNDÁRIO', p1.x, yO, 'left', 9, THIN); }
      pen(INK, 1.2); x.strokeRect(p1.x + 4, yI - 22, 10, 44); x.strokeRect(p1.x + 16, yI - 22, 10, 44); lab(st.clutch > 0.5 ? 'embreagem aberta' : 'embreagem fechada', p1.x + 4, yI + 34, 'left', 9, THIN);
      ratios.forEach((rr, i) => {
        const gx = pairsX + gw * (i + 0.5), on = sel === i + 1, zi = Math.round(54 / (1 + rr)), lo = type === 'manual' ? yC : yO, span = lo - yI, hi = span * zi / 54;
        x.fillStyle = on ? 'rgba(255,154,60,0.35)' : 'rgba(230,242,255,0.06)';
        x.fillRect(gx - 6, yI - hi * 0.5, 12, hi); x.fillRect(gx - 6, lo - (span - hi) * 0.5, 12, span - hi);
        pen(on ? SEL : INK, 1.2); x.strokeRect(gx - 6, yI - hi * 0.5, 12, hi); x.strokeRect(gx - 6, lo - (span - hi) * 0.5, 12, span - hi);
        lab(`${i + 1}ª`, gx, yI - hi * 0.5 - 10, 'center', 9, on ? SEL : THIN); lab(fmt(rr, 2), gx, lo + (span - hi) * 0.5 + 10, 'center', 8, THIN);
      });
      if (type === 'manual') { const gx = pairsX + gw * (n + 0.8), on = sel < 0; pen(on ? SEL : INK, 1.3); x.strokeRect(gx - 6, yI - 14, 12, 28); x.strokeRect(gx - 6, yC - 10, 12, 20); x.beginPath(); x.arc(gx + 18, (yI + yC) / 2, 9, 0, 7); x.stroke(); lab('R (intermediária)', gx, yI - 26, 'center', 9, on ? SEL : THIN); }
      if (type === 'manual') { // grelha do H com a posição atual
        const hx = p1.x + p1.w - 110, hy = p1.y + 20, cols = Math.ceil(n / 2) + 1, cwid = 22;
        pen(THIN, 1.2); ln(hx, hy + 30, hx + (cols - 1) * cwid, hy + 30);
        for (let c = 0; c < cols; c++) { ln(hx + c * cwid, hy + 4, hx + c * cwid, hy + 56); const up = c * 2 + 1, dn = c * 2 + 2; txt(up <= n ? String(up) : c === cols - 1 && n % 2 === 0 ? 'R' : '', hx + c * cwid, hy - 4, 'center', 9, THIN); txt(dn <= n ? String(dn) : c === cols - 1 && n % 2 === 1 ? 'R' : '', hx + c * cwid, hy + 66, 'center', 9, THIN); }
        let lc = Math.min(1, cols - 1), lr = 0; if (sel > 0) { lc = (sel - 1) >> 1; lr = sel % 2 ? -1 : 1; } else if (sel < 0) { lc = n % 2 ? cols - 1 : cols - 1; lr = n % 2 ? 1 : -1; }
        x.fillStyle = SEL; x.beginPath(); x.arc(hx + lc * cwid, hy + 30 + lr * 24, 6, 0, 7); x.fill(); reserve(hx - 12, hy - 12, cols * cwid + 12, 84);
      } else { // tambor seletor: posição atual
        const hx = p1.x + p1.w - 120, hy = p1.y + 26, order = ['1', 'N'].concat(ratios.slice(1).map((_, i) => String(i + 2)));
        order.forEach((o, i) => { const on = (o === 'N' && sel === 0) || o === String(sel); x.fillStyle = on ? SEL : 'rgba(230,242,255,0.15)'; x.fillRect(hx + i * 14, hy, 12, 18); txt(o, hx + i * 14 + 6, hy + 28, 'center', 9, on ? SEL : THIN); });
        txt('tambor: 1-N-2-3…', hx, hy - 10, 'left', 9, THIN); reserve(hx - 4, hy - 18, order.length * 14 + 8, 56);
      }
    }
    // tabela de relações e velocidade máxima em cada marcha
    const p2 = panel(r.x, r.y + r.h * 0.6, r.w * 0.55, r.h * 0.4, 'RELAÇÕES E VELOCIDADE NO CORTE'), rw = V.wheel || 0.3, lim = g.limit;
    const list = (type === 'cvt' ? [] : ratios.map((rr, i) => [`${i + 1}ª`, rr]));
    if (type === 'cvt') txt('Relação contínua: sem marchas fixas.', p2.x, p2.y + 8, 'left', 10, THIN);
    const rh = Math.min(16, (p2.h - 8) / (list.length + 1)); txt('marcha', p2.x, p2.y + 6, 'left', 9, THIN); txt('relação', p2.x + p2.w * 0.35, p2.y + 6, 'left', 9, THIN); txt('total', p2.x + p2.w * 0.55, p2.y + 6, 'left', 9, THIN); txt('km/h no corte', p2.x + p2.w, p2.y + 6, 'right', 9, THIN);
    list.forEach(([nm, rr], i) => { const y = p2.y + 6 + (i + 1) * rh, tot = rr * fin, on = sel === i + 1, vk = lim * Math.PI / 30 / tot * rw * 3.6;
      txt(nm, p2.x, y, 'left', 10, on ? SEL : INK); txt(fmt(rr, 3), p2.x + p2.w * 0.35, y, 'left', 10, on ? SEL : INK); txt(fmt(tot, 2), p2.x + p2.w * 0.55, y, 'left', 10, on ? SEL : INK); txt(fmt(vk, 0), p2.x + p2.w, y, 'right', 10, on ? SEL : INK); });
    reserve(p2.x, p2.y, p2.w, p2.h);
    const p3 = panel(r.x + r.w * 0.58, r.y + r.h * 0.6, r.w * 0.42, r.h * 0.4, 'AGORA');
    const th = st.heat || {}, rowsA = [['Marcha', sel < 0 ? 'R' : sel ? String(sel) : 'N'], ['Relação total', fmt(Math.abs(d.r || 0), 2)], ['Entrada', `${fmt(Math.abs(d.wIn || 0) * 30 / Math.PI, 0)} rpm`], ['Saída', `${fmt(Math.abs(d.wOut || 0) * 30 / Math.PI, 0)} rpm`], ['Embreagem', `${fmt(th.clu, 0)} °C`], ['Óleo do câmbio', V.car ? `${fmt(th.gbo, 0)} °C` : 'óleo do motor']];
    if (type === 'auto8' || (type === 'cvt' && V.car)) rowsA.push(['Conversor', `turbina ${fmt((d.sr || 0) * 100, 0)}% · trava ${fmt((d.lock || 0) * 100, 0)}%`]);
    rowsA.forEach(([a, b], i) => { txt(a, p3.x, p3.y + 6 + i * 17, 'left', 10, THIN); txt(b, p3.x + p3.w, p3.y + 6 + i * 17, 'right', 10, INK); });
    reserve(p3.x, p3.y, p3.w, rowsA.length * 17 + 6);
  }

  // ---------- arrefecimento ----------
  function coolingSheet(S, g, r) {
    const st = S.st || {}, th = st.heat, inp = S.inp || {}, TH = EngineLib.TH, kind = inp.cool || 'liquid';
    const p1 = panel(r.x, r.y, r.w * 0.58, r.h * 0.55, `CIRCUITO · ${TH.COOLING[kind].toUpperCase()}`);
    const box = (bx, by, bw, bh, nm, T, extra) => { x.fillStyle = th ? heatCss(T, 0.35) : 'rgba(230,242,255,0.05)'; x.fillRect(bx, by, bw, bh); pen(INK, 1.3); x.strokeRect(bx, by, bw, bh); txt(nm, bx + bw / 2, by + 12, 'center', 9, INK); txt(th ? `${fmt(T, 0)} °C` : '–', bx + bw / 2, by + bh / 2 + 6, 'center', 11, INK); if (extra) txt(extra, bx + bw / 2, by + bh - 9, 'center', 8, THIN); reserve(bx, by, bw, bh); };
    const c = p1, w3 = c.w / 3.4;
    if (kind === 'liquid' || kind === 'none') {
      const engX = c.x + c.w - w3 - 4, radX = c.x + 4, pmY = c.y + c.h - 40;
      box(engX, c.y + 6, w3, c.h * 0.36, 'CABEÇOTE', th ? th.head : 0, 'galerias de água');
      box(engX, c.y + c.h * 0.46, w3, c.h * 0.32, 'BLOCO / CILINDROS', th ? th.lin : 0);
      box(radX, c.y + 6, w3 * 0.9, c.h * 0.72, 'RADIADOR', th ? th.cool - 6 : 0, th ? `${fmt((th.Q.rad || 0) / 1000, 1)} kW${th.fan ? ' · ventoinha' : ''}` : '');
      const tmx = (radX + w3 * 0.9 + engX) / 2, tmy = c.y + 20;
      pen(INK, 1.2); x.strokeRect(tmx - 34, tmy - 12, 68, 24); txt('TERMOSTÁTICA', tmx, tmy - 20, 'center', 8, THIN); txt(th ? `${fmt(th.thermo * 100, 0)}% aberta` : '–', tmx, tmy, 'center', 9, SEL); reserve(tmx - 40, tmy - 28, 80, 42);
      pen(INK, 1.2); x.beginPath(); x.arc(tmx, pmY, 14, 0, 7); x.stroke(); txt("BOMBA", tmx, pmY + 24, 'center', 8, THIN); reserve(tmx - 30, pmY - 14, 60, 44);
      const hot = th ? heatCss(th.cool, 1) : HOT, cold = th ? heatCss(th.cool - 12, 1) : AIR, lv = th ? th.lvlC : 1;
      if (lv > 0.02) {
        arrow(engX, tmy, tmx + 36, tmy, hot); arrow(tmx - 36, tmy, radX + w3 * 0.9 + 2, tmy, hot);          // motor → termostática → radiador
        arrow(radX + w3 * 0.45, c.y + 6 + c.h * 0.72, radX + w3 * 0.45, pmY, cold); arrow(radX + w3 * 0.45, pmY, tmx - 15, pmY, cold);
        arrow(tmx + 15, pmY, engX + w3 / 2, pmY, cold); arrow(engX + w3 / 2, pmY, engX + w3 / 2, c.y + c.h * 0.46 + c.h * 0.32 + 2, cold);
        pen(THIN, 1, [3, 3]); ln(tmx, tmy + 12, tmx, pmY - 14); x.setLineDash([]); lab('desvio (frio)', tmx + 4, (tmy + pmY) / 2, 'left', 8, THIN);
      } else lab('SEM LÍQUIDO — o calor só sai pelo bloco', c.x + c.w / 2, pmY, 'center', 11, BAD);
      lab(`${TH.COOLANTS[inp.coolant || 'glicol'].nome} · ferve a ${fmt(TH.COOLANTS[inp.coolant || 'glicol'].Tb - 273.15, 0)} °C · nível ${fmt(lv * 100, 0)}%${th && th.boil ? ' · FERVENDO' : ''}`, c.x + c.w / 2, c.y + c.h + 4, 'center', 9, th && th.boil ? BAD : THIN);
    } else {
      box(c.x + c.w * 0.35, c.y + 10, w3, c.h * 0.38, 'CABEÇOTE (ALETAS)', th ? th.head : 0);
      box(c.x + c.w * 0.35, c.y + c.h * 0.5, w3, c.h * 0.38, 'CILINDRO (ALETAS)', th ? th.lin : 0);
      for (let k = 0; k < 5; k++) arrow(c.x + 4, c.y + 20 + k * c.h / 5, c.x + c.w * 0.33, c.y + 20 + k * c.h / 5, AIR, 6);
      lab(`vento ${fmt(Math.abs(st.kmh || 0), 0)} km/h → calor tirado ${th ? fmt((th.Q.fin || 0) / 1000, 1) : '–'} kW`, c.x + c.w * 0.75, c.y + c.h / 2, 'center', 10, INK);
      if (kind === 'oilair') lab(`radiador de óleo ${th ? fmt((th.Q.ocool || 0) / 1000, 1) : '–'} kW`, c.x + c.w * 0.75, c.y + c.h / 2 + 22, 'center', 10, THIN);
    }
    // barras de temperatura de cada peça
    const p2 = panel(r.x + r.w * 0.61, r.y, r.w * 0.39, r.h * 0.55, 'TEMPERATURA DAS PEÇAS');
    const parts = [['Líquido/bloco', 'cool', 120], ['Óleo', 'oil', 150], ['Cabeçote', 'head', 260], ['Cilindro', 'lin', 260], ['Pistão (coroa)', 'pis', 360], ['Válv. escape', 'ev', 900], ['Bronzinas', 'brg', 240]];
    const rh2 = (p2.h - 6) / parts.length;
    parts.forEach(([nm, k2, mx], i) => { const y = p2.y + i * rh2 + rh2 / 2, v = th ? th[k2] : 0, bw2 = p2.w - 130; txt(nm, p2.x, y, 'left', 9, THIN); pen(THIN, 0.6); x.strokeRect(p2.x + 92, y - 5, bw2, 10); x.fillStyle = heatCss(v); x.fillRect(p2.x + 92, y - 5, bw2 * clamp(v / mx, 0, 1), 10); txt(th ? `${fmt(v, 0)} °C` : '–', p2.x + p2.w, y, 'right', 10, INK); });
    reserve(p2.x, p2.y, p2.w, p2.h);
    // histórico
    const p3 = panel(r.x, r.y + r.h * 0.6, r.w, r.h * 0.4, 'HISTÓRICO (segundos térmicos)');
    if (hist.length > 2) {
      const t0 = hist[0].s, xs = hist.map(h => h.s - t0);
      const q = plot(p3, xs, [{ ys: hist.map(h => h.cool), col: '#4ea1ff' }, { ys: hist.map(h => h.oil), col: '#d9a441' }, { ys: hist.map(h => h.head), col: OK }, { ys: hist.map(h => h.lin), col: '#c58bff' }, { ys: hist.map(h => h.pis), col: HOT }], { y0: 0, xl: 's (térmicos)', yl: '°C' });
      [['líquido', '#4ea1ff'], ['óleo', '#d9a441'], ['cabeçote', OK], ['cilindro', '#c58bff'], ['pistão', HOT]].forEach(([n, col], i) => txt(n, q.l + 8 + i * 72, q.b - q.h + 10, 'left', 9, col));
    } else txt('ligue o motor para registrar', p3.x + p3.w / 2, p3.y + p3.h / 2, 'center', 10, THIN);
  }

  // ---------- lubrificação ----------
  function oilSheet(S, g, r) {
    const st = S.st || {}, th = st.heat, inp = S.inp || {}, TH = EngineLib.TH, oil = TH.OILS[inp.oil || '5w30'];
    const p1 = panel(r.x, r.y, r.w * 0.5, r.h * 0.5, g.two ? 'LUBRIFICAÇÃO 2 TEMPOS (MISTURA)' : 'CIRCUITO DE ÓLEO');
    if (g.two) wrap(['Sem bomba nem cárter de óleo: o óleo vem misturado na gasolina e lubrifica bronzinas, pistão e anéis como névoa ao passar pelo cárter.', `Mistura atual: ${S.fuel && S.fuel.oil ? fmt(S.fuel.oil * 100, 0) + '%' : 'SEM ÓLEO — as peças ficam sem película e travam!'}`], p1, 10);
    else {
      const items = [['CÁRTER', `${fmt((inp.oilLvl != null ? inp.oilLvl : 1) * 100, 0)}% · ${th ? fmt(th.oil, 0) : '–'} °C`], ['PESCADOR + BOMBA', `${th ? fmt(th.pOil, 1) : '–'} bar`], ['ALÍVIO / FILTRO', '~5 bar máx.'], ['GALERIA', '']];
      const bh = 26; items.forEach(([nm, v], i) => { const y = p1.y + 4 + i * (bh + 12); pen(INK, 1.2); x.strokeRect(p1.x, y, p1.w * 0.42, bh); txt(nm, p1.x + 6, y + bh / 2, 'left', 9, INK); txt(v, p1.x + p1.w * 0.42 - 6, y + bh / 2, 'right', 9, THIN); if (i) arrow(p1.x + p1.w * 0.21, y - 12, p1.x + p1.w * 0.21, y - 1, '#d9a441', 5); });
      reserve(p1.x, p1.y, p1.w * 0.42, items.length * (bh + 12));
      const gy = p1.y + 4 + 3 * (bh + 12) + bh / 2, outs = [['MANCAIS', 'mancal'], ['BIELAS', 'biela'], ['COMANDO', 'comando'], ['JATOS → PISTÕES', 'aneis']]; if (g.fi && g.fi.type === 'turbo') outs.push(['TURBO', 'turbo']);
      outs.forEach(([nm, k2], i) => { const y = p1.y + 4 + i * (p1.h - 8) / outs.length + 10, l = th ? th.lam[k2] : 9, col = l < 1 ? BAD : l < 3 ? '#ffb020' : OK;
        arrow(p1.x + p1.w * 0.42 + 2, gy, p1.x + p1.w * 0.58, y, '#d9a441', 5); pen(col, 1.4); x.strokeRect(p1.x + p1.w * 0.6, y - 11, p1.w * 0.4, 22); txt(nm, p1.x + p1.w * 0.6 + 6, y, 'left', 9, INK); txt(th ? `λ ${fmt(l, 1)}` : '', p1.x + p1.w - 6, y, 'right', 9, col); });
      reserve(p1.x + p1.w * 0.58, p1.y, p1.w * 0.42, p1.h);
    }
    // Stribeck: atrito × número de Hersey (μ·N/P), com cada peça no seu regime
    const p2 = panel(r.x + r.w * 0.53, r.y, r.w * 0.47, r.h * 0.5, 'CURVA DE STRIBECK');
    const xs = [], ys = []; for (let i = 0; i <= 60; i++) { const lam = i / 60 * 6; xs.push(lam); ys.push(0.004 + 0.12 * TH.contact(lam) + 0.0015 * lam); }
    const q = plot(p2, xs, [{ ys, col: INK, w: 1.8 }], { x0: 0, x1: 6, y0: 0, y1: 0.14, xl: 'λ = película ÷ rugosidade', yl: 'atrito', yd: 2, xd: 0 });
    x.fillStyle = 'rgba(255,90,90,0.08)'; x.fillRect(q.X(0), q.b - q.h, q.X(1) - q.X(0), q.h); x.fillStyle = 'rgba(255,176,32,0.07)'; x.fillRect(q.X(1), q.b - q.h, q.X(3) - q.X(1), q.h); x.fillStyle = 'rgba(123,224,176,0.06)'; x.fillRect(q.X(3), q.b - q.h, q.X(6) - q.X(3), q.h);
    lab('LIMITE', q.X(0.5), q.b - q.h + 10, 'center', 8, BAD); lab('MISTO', q.X(2), q.b - q.h + 10, 'center', 8, '#ffb020'); lab('HIDRODINÂMICO', q.X(4.5), q.b - q.h + 10, 'center', 8, OK);
    if (th) [['biela', 'biela'], ['mancal', 'mancal'], ['comando', 'comando'], ['anéis', 'aneis'], ['engren.', 'engren']].forEach(([n, k2]) => { const l = clamp(th.lam[k2], 0, 5.9), yy = 0.004 + 0.12 * TH.contact(l) + 0.0015 * l; x.fillStyle = SEL; x.beginPath(); x.arc(q.X(l), q.Y(yy), 4, 0, 7); x.fill(); lab(n, q.X(l) + 6, q.Y(yy) - 8, 'left', 9, SEL); });
    // viscosidade × temperatura (ASTM D341) dos graus, com o ponto atual
    const p3 = panel(r.x, r.y + r.h * 0.55, r.w * 0.5, r.h * 0.45, 'VISCOSIDADE × TEMPERATURA');
    const Ts = []; for (let T = -10; T <= 150; T += 5) Ts.push(T);
    const ser = Object.entries(TH.OILS).map(([k2, o]) => ({ ys: Ts.map(T => Math.log10(TH.nu(o, T + 273.15))), col: k2 === inp.oil ? SEL : 'rgba(143,187,230,0.45)', w: k2 === inp.oil ? 2 : 1 }));
    const q3 = plot(p3, Ts, ser, { x0: -10, x1: 150, y0: 0.5, y1: 3.6, xl: '°C', yl: 'log₁₀ cSt', yd: 1 });
    if (th) { const v = Math.log10(TH.nu(oil, th.oil + 273.15)); x.fillStyle = SEL; x.beginPath(); x.arc(q3.X(clamp(th.oil, -10, 150)), q3.Y(clamp(v, 0.5, 3.6)), 5, 0, 7); x.fill(); lab(`${oil.nome.split(' ·')[0]}: ${fmt(TH.nu(oil, th.oil + 273.15), 1)} cSt`, q3.X(clamp(th.oil, -10, 150)) + 8, q3.Y(clamp(v, 0.5, 3.6)) - 10, 'left', 9, SEL); }
    // desgaste
    const p4 = panel(r.x + r.w * 0.53, r.y + r.h * 0.55, r.w * 0.47, r.h * 0.45, 'DESGASTE (ARCHARD)');
    const parts = Object.entries(TH.PARTS), rh = (p4.h - 6) / parts.length;
    parts.forEach(([k2, p], i) => { const y = p4.y + i * rh + rh / 2, w = th ? th.wear[k2] : 0, f = w / (p.lim * 1e6), bw2 = p4.w - 170; txt(p.c, p4.x, y, 'left', 9, THIN); pen(THIN, 0.6); x.strokeRect(p4.x + 92, y - 5, bw2, 10); x.fillStyle = f > 0.7 ? BAD : f > 0.2 ? '#ffb020' : OK; x.fillRect(p4.x + 92, y - 5, Math.max(1, bw2 * clamp(f, 0, 1)), 10); txt(th ? `${fmt(w, w < 10 ? 2 : 0)} µm` : '–', p4.x + p4.w, y, 'right', 9, INK); });
    reserve(p4.x, p4.y, p4.w, p4.h);
    if (th && th.fail) lab('⚠ ' + th.fail, r.x + r.w / 2, r.y + r.h + 6, 'center', 11, BAD);
  }

  // ---------- prancha ----------
  function draw(cv, S, g, name, sheet = 'chamber') {
    const dpr = window.devicePixelRatio || 1, cw = cv.clientWidth, chh = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(chh * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr); }
    x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); W = cw; H = chh; x.lineJoin = 'round'; placed = [];
    frame();
    const L0 = 28, top = 70, sh = 96, bottomY = H - 28 - sh;                  // topo livre para a barra de botões
    reserve(0, 0, W, 50);
    stamp(S, g, name, sheet, W - 28 - Math.min(380, W * 0.48), bottomY, Math.min(380, W * 0.48), sh);
    const area = { x: L0, y: top, w: W - 2 * L0, h: bottomY - top - 24 };
    if (sheet === 'chamber') {
      const wl = Math.min(area.w * 0.56, area.h * 1.0);
      (g.rot ? sectionRot : section)(S, g, area.x, area.y + 16, wl, area.h - 16);
      const rx = area.x + wl + 18, rw = area.x + area.w - rx, rr = Math.max(46, Math.min(rw / 2 - 52, area.h * 0.13));
      timing(S, g, rx + rw / 2, area.y + rr + 34, rr);
      const y1 = area.y + 2 * rr + 96, hh = (area.y + area.h - y1 - 30) / 2;
      pvPanel(S, g, panel(rx, y1, rw, hh, 'P × V (CILINDRO 1)'));
      liftPanel(S, g, panel(rx, y1 + hh + 26, rw, hh, g.two ? 'JANELAS (ABERTURA)' : g.rot ? 'JANELAS (ABERTURA)' : 'LEVANTE DAS VÁLVULAS'));
    }
    else if (sheet === 'intake') intakeSheet(S, g, area);
    else if (sheet === 'exhaust') exhaustSheet(S, g, area);
    else if (sheet === 'turbo') turboSheet(S, g, area);
    else if (sheet === 'gearbox') gearboxSheet(S, g, area);
    else if (sheet === 'cooling') coolingSheet(S, g, area);
    else if (sheet === 'oil') oilSheet(S, g, area);
  }
  // histórico das temperaturas (chamado pela interface o tempo todo, não só com a prancha aberta)
  let lastRec = 0, sT = 0;
  function record(st, tk = 1) {
    const th = st && st.heat, now = performance.now(); if (!th || now - lastRec < 500) return;
    sT += (lastRec ? (now - lastRec) / 1000 : 0) * tk; lastRec = now;
    hist.push({ s: sT, cool: th.cool, oil: th.oil, head: th.head, pis: th.pis, lin: th.lin }); if (hist.length > 360) hist.shift();
  }
  return { draw, record };
})();
