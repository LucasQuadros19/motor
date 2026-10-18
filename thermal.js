// Temperaturas, arrefecimento, óleo e desgaste — rede térmica concentrada alimentada pelo calor que a
// simulação calcula (Woschni nas paredes de cada câmara, gás de escape no pórtico, potência de atrito,
// deslizamento da embreagem/conversor, perdas no câmbio). Função serializável (roda no AudioWorklet).
//  • nós: cabeçote, válvulas de escape, pistões, cilindros (camisas), bloco, líquido, óleo do motor,
//    óleo do câmbio, embreagem, mancal do turbo; cada um com massa × calor específico;
//  • arrefecimento a líquido: bomba ∝ rpm, válvula termostática (abre 87→100 °C), radiador pelo método
//    ε-NTU (fluxo cruzado) com ar de impacto + ventoinha; tampa pressurizada, fervura e perda de líquido;
//    a ar: aletas com h(v) de convecção forçada; ar+óleo: radiador de óleo;
//  • óleo: viscosidade por grau SAE (ASTM D341 / Walther, a partir de ν40 e ν100), pressão da bomba
//    limitada pela válvula de alívio, aeração com nível baixo, película em cada par de peças
//    (Sommerfeld nos mancais, EHL no comando e nas engrenagens, anéis na camisa) → regime de Stribeck
//    (λ = película/rugosidade) → atrito extra e desgaste de Archard; folga do pistão pela dilatação.
function THERMAL_LIB() {
  'use strict';
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, C2K = 273.15;
  // ν em cSt a 40 e 100 °C (valores típicos de catálogo), densidade
  const OILS = {
    '0w20':  { nome: '0W-20 · fino (econômico, motores modernos)', v40: 44, v100: 8.6, rho: 840 },
    '5w30':  { nome: '5W-30 · padrão',                              v40: 64, v100: 10.9, rho: 850 },
    '10w40': { nome: '10W-40 · médio',                              v40: 92, v100: 14.2, rho: 860 },
    '20w50': { nome: '20W-50 · grosso (motores antigos/a ar)',      v40: 155, v100: 18.6, rho: 870 },
    '10w60': { nome: '10W-60 · competição',                         v40: 165, v100: 23.5, rho: 860 },
  };
  const GEAROILS = {
    '75w90':  { nome: '75W-90 · óleo de câmbio',            v40: 105, v100: 15, rho: 880 },
    '75w140': { nome: '75W-140 · câmbio pesado/competição', v40: 180, v100: 25, rho: 890 },
    'atf':    { nome: 'ATF · fluido de automático',         v40: 33, v100: 7.2, rho: 850 },
    'cvtf':   { nome: 'CVTF · fluido de CVT',               v40: 35, v100: 7.5, rho: 850 },
  };
  // calor específico, densidade, ebulição com a tampa de 1,1 bar
  const COOLANTS = {
    glicol: { nome: 'Água + aditivo (50% etilenoglicol)', cp: 3500, rho: 1070, Tb: 129 + C2K },
    agua:   { nome: 'Água pura',                         cp: 4180, rho: 1000, Tb: 121 + C2K },
  };
  const COOLING = {
    liquid: 'Líquido (radiador, termostática, ventoinha)',
    air:    'A ar (aletas)',
    oilair: 'Ar + óleo (radiador de óleo)',
    none:   'Desligado (sem líquido / sem ar forçado)',
  };
  // ASTM D341: log10(log10(ν + 0,7)) = A − B·log10(T)
  function walther(o) {
    if (o.B) return o;
    const f = v => Math.log10(Math.log10(v + 0.7)), t1 = Math.log10(313.15), t2 = Math.log10(373.15);
    o.B = (f(o.v40) - f(o.v100)) / (t2 - t1); o.A = f(o.v40) + o.B * t1;
    return o;
  }
  const nu = (o, T) => { walther(o); return Math.pow(10, Math.pow(10, o.A - o.B * Math.log10(clamp(T, 233, 600)))) - 0.7; }; // cSt
  const mu = (o, T) => nu(o, T) * o.rho * 1e-6;                                                                    // Pa·s
  const contact = lam => Math.exp(-1.5 * lam * lam);                       // fração da carga nas rugosidades (Stribeck)
  const regime = lam => lam < 1 ? 'limite' : lam < 3 ? 'misto' : 'hidrodinâmico';

  // peças que se desgastam: dureza H (Pa), folga/limite de desgaste (m)
  const PARTS = {
    // k: coeficiente de desgaste de Archard em lubrificação limite (com aditivo antidesgaste); a seco é ~300× maior
    biela:   { nome: 'Bronzinas de biela', c: 'Bronz. biela', H: 3e8, lim: 25e-6, k: 2e-8 },
    mancal:  { nome: 'Bronzinas de mancal', c: 'Bronz. mancal', H: 3e8, lim: 30e-6, k: 2e-8 },
    comando: { nome: 'Comando e tuchos', c: 'Comando', H: 6e9, lim: 150e-6, k: 5e-9 },
    aneis:   { nome: 'Anéis e cilindro', c: 'Anéis/cilindro', H: 3e9, lim: 120e-6, k: 2e-9 },
    turbo:   { nome: 'Mancal do turbo', c: 'Turbo', H: 3e8, lim: 20e-6, k: 2e-8 },
    engren:  { nome: 'Engrenagens do câmbio', c: 'Engrenagens', H: 6e9, lim: 200e-6, k: 5e-9 },
    sincro:  { nome: 'Sincronizadores / dentes de engate', c: 'Sincroniz.', H: 2e9, lim: 400e-6 },
    embreag: { nome: 'Disco de embreagem / conversor', c: 'Embreagem', H: 1e9, lim: 1.5e-3 },
  };

  class Thermal {
    constructor(g, inp) {
      this.g = g; const n = g.nch, rot = g.rot, Vt = g.cc / 1000, Bs = g.B / 0.086;     // litros, escala do diâmetro
      this.n = n; this.Vt = Vt;
      // capacidades térmicas (J/K)
      this.C = {
        head: (6 * Math.pow(Vt, 0.8) + 1) * 900, ev: n * (g.E.nv || 1) * 0.05 * Bs * Bs * 460, pis: n * 0.45 * Bs * Bs * Bs * 900,
        lin: (3 * Math.pow(Vt, 0.8) + 0.5) * 500, blk: (15 * Math.pow(Vt, 0.8) + 3) * 900, clu: (g.veh.car ? 9 : 2.5) * 460, tb: 0.6 * 460,
        brg: n * 0.3 * 500,                                                                        // bronzinas + moentes (região do filme)
      };
      this.Vc = 2.5 * Math.pow(Vt, 0.7) + 1.0; this.Vo = 1.5 * Math.pow(Vt, 0.7) + 1.5; this.Vg = g.veh.car ? 2.0 : 0;   // litros
      const kw = (g.E.ref ? g.E.ref.cv * 0.7355 : 100) * g.cc / g.E.cc;                                 // potência de projeto
      this.Ar = (0.002 * kw + 0.05) * (g.veh.car ? 1 : 0.6); this.UA = 4500 * this.Ar;                // radiador: área frontal, UA
      this.Afin = n * 0.5 * Math.pow(g.vd / 5e-4, 0.667);                                                // aletas (motor a ar)
      this.reset(inp);
    }
    reset(inp) {
      const Ta = (inp.Tamb != null ? inp.Tamb : 25) + C2K, w = inp.warm;
      this.T = { head: Ta, ev: Ta, pis: Ta, lin: Ta, blk: Ta, cool: Ta, oil: Ta, gbo: Ta, clu: Ta, tb: Ta, brg: Ta };
      if (w) Object.assign(this.T, { head: 105 + C2K, ev: 300 + C2K, pis: 150 + C2K, lin: 100 + C2K, blk: 92 + C2K, cool: 90 + C2K, oil: 95 + C2K, gbo: 75 + C2K, clu: 60 + C2K, tb: 110 + C2K, brg: 100 + C2K });
      this.lvlC = 1; this.boil = 0; this.fan = false; this.thermo = 0; this.pOil = 0; this.lam = {}; this.wear = {}; this.rate = {};
      this.film = w ? 0.8 : 0.3;                                                       // parado, o óleo escorre para o cárter
      for (const k in PARTS) { this.wear[k] = 0; this.rate[k] = 0; this.lam[k] = 9; }
      this.fail = ''; this.seized = false; this.knockDmg = 0; this.Q = {};
    }
    // dt: tempo real simulado (s); s: fontes de calor médias no intervalo (W) e estado do motor
    step(dt, inp, s) {
      const g = this.g, T = this.T, C = this.C, tk = inp.tk || 1, dte = dt * tk, n = this.n, rpm = s.rpm, w = rpm * Math.PI / 30;
      const Ta = (inp.Tamb != null ? inp.Tamb : 25) + C2K, v = Math.abs(s.v), car = !!g.veh.car;
      const type = inp.cool || 'liquid', fl = COOLANTS[inp.coolant] || COOLANTS.glicol, oil = OILS[inp.oil] || OILS['5w30'];
      const lvlO = clamp(inp.oilLvl != null ? inp.oilLvl : 1, 0, 1.2), go = GEAROILS[inp.gearOil] || GEAROILS[g.trans === 'auto8' ? 'atf' : g.trans === 'cvt' ? 'cvtf' : '75w90'];
      // ---------- óleo: viscosidade, bomba, válvula de alívio, aeração ----------
      const muO = mu(oil, T.oil), idle = g.idle;
      const slosh = Math.min(0.35, Math.abs(s.acc || 0) / 9.81 * 0.25);                // aceleração/frenagem joga o óleo para longe do pescador
      const air = clamp((0.42 + slosh - lvlO) / 0.25, 0, 1);                            // fração de ar sugado
      const pPump = 1.2e5 * (rpm / idle) * Math.pow(muO / 0.0093, 0.8) * (1 - air);     // vazão × viscosidade (fuga laminar nos mancais)
      const pOil = this.pOil = g.two ? 0 : Math.min(pPump, 5.2e5 * (1 - air));          // alívio a ~5 bar
      // película residual: sem pressão o óleo que ficou nas peças some em ~8 s.
      // 2 tempos: sem bomba — o óleo vem misturado na gasolina (névoa no cárter); sem óleo na mistura, nada lubrifica
      const sup = g.two ? clamp((s.mix || 0) / 0.02, 0, 1.5) * (s.fuelOn ? 1 : 0.3) : clamp(pOil / 0.7e5, 0, 1);
      const tFill = 0.4 * Math.sqrt(clamp(muO / 0.0093, 1, 400));                       // óleo frio e grosso demora a subir pelas galerias
      this.film += ((lvlO > 0.02 && !g.two ? Math.max(sup, 0.05) : Math.min(1, sup)) - this.film) * Math.min(1, dte / (sup > this.film ? tFill : 8));
      const oilMass = Math.max(0.05, lvlO) * this.Vo * oil.rho / 1000, Coil = oilMass * 2000;
      // ---------- calor ----------
      const Qh = s.Qh || 0, Ql = s.Ql || 0, Qp = s.Qp || 0, Pf = Math.max(0, s.Pf || 0);
      const Qport = s.Qport || 0;                                                      // gás de escape aquecendo o pórtico
      const Qev = 0.12 * Qh + 0.25 * Qport;                                             // válvulas de escape: face no gás e no jato
      const Gev = n * (g.E.nv || 1) * 0.8 * (0.3 + 0.7 * this.film);                    // sede + guia (lubrificada) → cabeçote
      const Gpl = n * 7 * Math.pow(g.B / 0.086, 2), Gpo = n * 6 * Math.pow(g.B / 0.086, 2) * (0.2 + 0.8 * sup);    // pistão → camisa (anéis), → óleo (jato)
      const Ghb = 150 * this.Vt + 15, Glb = 200 * this.Vt + 20, Gob = (120 * Math.pow(this.Vt, 0.7) + 20) * (0.3 + 0.7 * sup);  // óleo → bloco/trocador
      let Ghc = 0, Glc = 0, Gbc = 0, Qrad = 0, Qfin = 0, Qocool = 0;
      const vAirFin = v + 0.8 + (g.E.fan ? 14 * Math.min(1, rpm / g.limit) : 0);          // vento (ou vento da hélice) + convecção natural + ventoinha do motor (m/s)
      const hFin = 8 + 7 * Math.pow(vAirFin, 0.75);
      if (type === 'liquid' && this.lvlC > 0) {
        const lv = Math.pow(this.lvlC, 1.5), pump = 0.25 * rpm / 1000 * Math.sqrt(this.Vt / 2 + 0.2);        // kg/s
        const flow = clamp(pump / 0.5, 0.15, 1);
        const filmBoil = T.head > fl.Tb + 40 ? 0.3 : 1;                                // vapor isola a parede
        Ghc = (230 * this.Vt + 20) * Math.pow(flow, 0.5) * lv * filmBoil; Glc = (250 * this.Vt + 20) * Math.pow(flow, 0.5) * lv; Gbc = (120 * this.Vt + 15) * lv;
        // termostática + radiador (ε-NTU, fluxo cruzado sem mistura)
        this.thermo = clamp((T.cool - 87 - C2K) / 13, 0, 1);
        if (T.cool > 98 + C2K) this.fan = true; else if (T.cool < 94 + C2K) this.fan = false;
        const mC = pump * (0.05 + 0.95 * this.thermo) * this.lvlC, vAir = Math.max(this.fan ? 5 : 0.6, 0.35 * v);
        const Cc = mC * fl.cp, Ca = 1.2 * this.Ar * vAir * 1006, Cmin = Math.min(Cc, Ca), Cmax = Math.max(Cc, Ca);
        if (Cmin > 1) { const Cr = Cmin / Cmax, NTU = this.UA * Math.pow(vAir / 8, 0.5) / Cmin, eps = 1 - Math.exp(Math.pow(NTU, 0.22) / Cr * (Math.exp(-Cr * Math.pow(NTU, 0.78)) - 1)); Qrad = eps * Cmin * (T.cool - Ta); }
        this.vAir = vAir; this.mC = mC;
      } else if (type === 'air' || type === 'oilair') {
        Qfin = hFin * this.Afin * ((T.head - Ta) * 0.55 + (T.lin - Ta) * 0.45);
        this.thermo = 0; this.fan = false;
        if (type === 'oilair') { const Co = 0.08 * rpm / 1000 * 2000 * sup, Ca = 1.2 * this.Ar * 0.5 * Math.max(0.6, 0.35 * v) * 1006, Cmin = Math.min(Co, Ca); if (Cmin > 1) Qocool = 0.6 * Cmin * (T.oil - Ta); }
      } else { this.thermo = 0; this.fan = false; }                                      // desligado: só o bloco troca calor com o ar
      const Gair = (8 + 1.5 * v) * (0.3 + this.Vt);                                     // superfície externa do bloco/cárter
      const Qhb = Ghb * (T.head - T.blk), Qlb = Glb * (T.lin - T.blk);
      const Qhc = Ghc * (T.head - T.cool), Qlc = Glc * (T.lin - T.cool), Qbc = Gbc * (T.blk - T.cool);
      const Qe = Gev * (T.ev - T.head), Qpl = Gpl * (T.pis - T.lin), Qpo = Gpo * (T.pis - T.oil), Qob = Gob * (T.oil - T.blk);
      const PfOil = 0.35 * Pf, PfLin = 0.5 * Pf, PfHead = 0.15 * Pf;                   // atrito: bronzinas → óleo; anéis e saia → camisa; comando → cabeçote
      // câmbio: perdas no engrenamento e agitação, deslizamento da embreagem/conversor
      const Ploss = Math.max(0, s.Pgear || 0), Pclu = Math.max(0, s.Pclutch || 0);
      const muG = mu(go, T.gbo), Pchurn = car ? 40 * Math.pow(muG / 0.02, 0.3) * Math.pow(Math.abs(s.wIn || 0) / 300, 1.5) : 0;
      const Ggb = car ? 25 * (1 + 0.1 * v) : 0, Qgb = Ggb * (T.gbo - Ta), Qgc = g.trans === 'auto8' || g.trans === 'cvt' ? 80 * (T.gbo - T.cool) * (type === 'liquid' ? 1 : 0) : 0;
      // embreagem: seca no carro manual (volante + platô ao ar); na moto é banhada a óleo; no automático/CVT de carro o calor vai para o fluido
      const wet = !car && g.trans !== 'cvt', toFluid = car && (g.trans === 'auto8' || g.trans === 'cvt');
      const Qclu = wet ? 60 * (T.clu - T.oil) : (18 + 3.6 * v) * (T.clu - Ta);
      const dT = {
        head: (Qh + Qport + PfHead - Qev + Qe - Qhb - Qhc - Qfin * 0.55) / C.head,
        ev: (Qev - Qe) / C.ev,
        pis: (Qp - Qpl - Qpo) / C.pis,
        lin: (Ql + PfLin + Qpl - Qlb - Qlc - Qfin * 0.45) / C.lin,
        blk: (Qhb + Qlb + Qob - Qbc - Gair * (T.blk - Ta)) / C.blk,
        oil: (PfOil + Qpo - Qob - Qocool - 15 * (1 + 0.15 * v) * (T.oil - Ta) + (car ? 0 : Ploss + Pchurn) + (wet ? Qclu : 0)) / Coil,
      };
      const Ccool = Math.max(0.05, this.lvlC) * this.Vc * fl.rho / 1000 * fl.cp;
      dT.cool = type === 'liquid' ? (Qhc + Qlc + Qbc + Qgc - Qrad) / Ccool : 0;
      dT.gbo = car ? (Ploss + Pchurn + (toFluid ? Pclu : 0) - Qgb - Qgc) / (this.Vg * go.rho / 1000 * 2000) : 0;
      dT.clu = toFluid ? (T.gbo - T.clu) / 5 : (Pclu - Qclu) / C.clu;
      if (g.fi && g.fi.type === 'turbo') dT.tb = (3 * ((s.Teg || 700) - T.tb) - 10 * sup * (T.tb - T.oil)) / C.tb;
      for (const k in dT) T[k] += dT[k] * dte;
      if (type !== 'liquid') T.cool = T.blk;
      if (!(g.fi && g.fi.type === 'turbo')) T.tb = T.oil;
      // fervura: acima do ponto de ebulição (com tampa) o excesso vira vapor e sai pela tampa
      this.boil = 0;
      if (type === 'liquid' && T.cool > fl.Tb && this.lvlC > 0) { const ex = (T.cool - fl.Tb) * Ccool, mv = ex / 2.26e6; this.lvlC = Math.max(0, this.lvlC - mv / (this.Vc * fl.rho / 1000)); T.cool = fl.Tb; this.boil = 1; }
      if (type === 'none') this.lvlC = 0;
      this.Q = { rad: Qrad, fin: Qfin, ocool: Qocool, hc: Qhc, lc: Qlc, gb: Qgb };
      // ---------- lubrificação e desgaste ----------
      const film = this.film, dry = lvlO < 0.02 && film < 0.1, B = g.B, a = g.a || 0.04, Ap = Math.PI * B * B / 4, mRec = 0.5 * Math.pow(B / 0.086, 3);
      // carga média na bronzina (~35% do pico do ciclo): combustão menos inércia, ou só inércia no alto giro
      const Fi = mRec * a * w * w * 1.25, Fg = (s.pmax || 3e6) * Ap, Frod = 0.35 * Math.max(Fg - Fi, Fi, 1500), rj = 0.28 * B, Lb = 0.25 * B, cl = 0.001 * rj;
      const bearing = (F, muB, Ns) => { // Sommerfeld → excentricidade → película mínima / rugosidade composta (0,3 µm)
        const P = F / (2 * rj * Lb), S = muB * Ns / P * Math.pow(rj / cl, 2), ecc = 1 / (1 + 4 * S);
        return cl * (1 - ecc) / 0.25e-6;
      };
      const Ns = Math.max(rpm, 1) / 60;
      // película de cada par: o óleo na temperatura da própria peça (bronzina, cabeçote, camisa, turbo)
      const lamsFor = (o, fm, Tb, Th, Tl, Tt) => ({
        biela: bearing(g.rot ? Fg * 0.28 : Frod, mu(o, Tb), Ns) * fm,
        mancal: bearing(g.rot ? Fg * 0.21 : Frod * 0.6, mu(o, Tb), Ns) * fm,
        comando: g.two || g.rot ? 9 : 1.7 * Math.pow(mu(o, Th) * w / 2 * 0.016 / (0.0093 * 1.5), 0.7) * fm,
        aneis: 2.2 * Math.sqrt(mu(o, Tl) * Math.max(0.5, (s.Sp || 1)) / (0.006 * 10)) * Math.pow((s.pmax || 3e6) / 5e6, -0.5) * fm,
        turbo: g.fi && g.fi.type === 'turbo' ? 6 * Math.sqrt(mu(o, Tt) / 0.006) * fm : 9,
      });
      const lamT = Object.assign(lamsFor(oil, film, (T.brg + T.oil) / 2 + 10, T.head - 20, T.lin, T.tb), {
        engren: car ? 1.5 * Math.pow(muG * Math.max(0.1, Math.abs(s.wIn || 0) * 0.04) / (0.03 * 10), 0.7) * Math.pow(Math.max(1, Math.abs(s.Tg || 1)) / 200, -0.13) : 1.5 * Math.pow(muO * Math.max(0.1, Math.abs(s.wIn || 0) * 0.04) / (0.03 * 10), 0.7) * film,
        sincro: 9, embreag: 9,
      });
      const lamR = lamsFor(OILS['5w30'], 1, 383, 363, 393, 393);                         // referência: 5W-30 quente e com pressão
      // Archard: taxa de desgaste = k · (fração em contato) · pressão · velocidade de deslizamento / dureza
      const kx = dry ? 300 : 1 + 2 * clamp((T.oil - 403) / 40, 0, 1);                  // a seco ×300; aditivo antidesgaste perde efeito acima de ~130 °C
      const vs = {
        biela: w * rj, mancal: w * rj, comando: w / 2 * 0.016, aneis: (s.Sp || 0), turbo: (s.wt || 0) * 0.004, engren: Math.abs(s.wIn || 0) * 0.04 * 0.1,
      };
      const pn = { biela: Frod / (2 * rj * Lb), mancal: 0.6 * Frod / (2 * rj * Lb), comando: 5e8, aneis: 1.5e6 + 0.1 * (s.pmax || 0), turbo: 2e6, engren: 1e9 * Math.min(2, Math.abs(s.Tg || 0) / 300) };
      for (const k of ['biela', 'mancal', 'comando', 'aneis', 'turbo', 'engren']) {
        const lam = this.lam[k] = Math.max(0, lamT[k]);                                 // sem óleo: a película residual (film) some em ~8 s
        const kk = PARTS[k].k * (k === 'engren' && car ? (inp.gearLvl != null && inp.gearLvl < 0.05 ? 300 : 1) : kx), f = k === 'aneis' ? Math.max(contact(lam), 0.12) : contact(lam);
        const H = PARTS[k].H, r = k === 'turbo' && !(g.fi && g.fi.type === 'turbo') ? 0 : kk * f * pn[k] * vs[k] / H;       // m/s
        this.rate[k] = r * 3.6e9;                                                                                   // µm/h
        this.wear[k] += r * dte;
      }
      // temperatura das bronzinas: atrito viscoso (Petroff) + contato metal-metal; o óleo que passa leva o calor embora
      const vj = w * rj, Pvis = n * mu(oil, (T.brg + T.oil) / 2 + 10) * vj * vj * 2 * Math.PI * rj * Lb / cl, Pcon = n * 0.12 * Frod * vj * contact(this.lam.biela);
      T.brg += (Pvis + Pcon - n * (2 + 25 * sup) * (T.brg - T.oil)) / C.brg * dte;
      this.Pbrg = Pcon;
      // engates e embreagem: energia dissipada (J) → desgaste
      const dSy = (s.Eshift || 0) * 2e-9 * (car ? 1 : 0.5) * (inp.gearLvl != null && inp.gearLvl < 0.05 ? 10 : 1);
      this.wear.sincro += dSy; this.rate.sincro += (dSy / Math.max(dte, 1e-6) * 3.6e9 - this.rate.sincro) * Math.min(1, dte / 20);   // média de 20 s
      const dCl = Pclu * 4e-12 * (T.clu > 300 + C2K ? 6 : 1);
      this.wear.embreag += dCl * dte; this.rate.embreag = dCl * 3.6e9;
      // folga da saia do pistão: alumínio dilata o dobro do ferro. Projeto: 25 µm a quente (saia 200 °C, camisa 130 °C);
      // se a saia esquenta mais que a camisa acompanha, a folga some → raspa → engripa
      const Tsk = T.lin + 0.4 * (T.pis - T.lin), clr = 25e-6 * B / 0.086 + B * (11e-6 * (T.lin - 130 - C2K) - 22e-6 * (Tsk - 200 - C2K));
      this.clr = clr;
      // ---------- falhas ----------
      if (!this.seized) {
        if (T.brg > 245 + C2K) this.die('Bronzina fundiu: sem película de óleo o atrito metal-metal derreteu a liga (≈ 240 °C)');
        else if (this.wear.biela > PARTS.biela.lim) this.die('Bronzina de biela gasta além da folga — rodou no moente');
        else if (this.wear.mancal > PARTS.mancal.lim) this.die('Bronzina de mancal fundiu — o virabrequim travou');
        else if (clr < -10e-6 || T.lin > 330 + C2K) this.die('Pistão engripou no cilindro — dilatou mais que a folga (superaquecimento)');
        else if (this.wear.turbo > PARTS.turbo.lim && !this.fail) this.fail = 'Turbo danificado: mancal sem óleo (folga no eixo)';
        else if (T.head > 290 + C2K && !this.fail) this.fail = 'Cabeçote empenou / junta do cabeçote queimou';
        else if (T.ev > 920 + C2K && !this.fail) this.fail = 'Válvula de escape queimando (vermelha)';
      }
      // atrito extra: viscosidade (frio = grosso) e contato metal-metal (regime misto/limite)
      // (relativo ao óleo de referência: em condição normal o multiplicador é 1 — o atrito base já está no modelo de Chen-Flynn)
      const muRef = mu(OILS['5w30'], 373.15), visc = Math.pow(clamp(mu(oil, T.oil) / muRef, 0.3, 60), 0.35);
      const cx = k => Math.max(0, contact(this.lam[k]) - contact(lamR[k]));
      const bound = 0.5 * cx('biela') + 0.5 * cx('mancal') + 0.6 * cx('aneis') + 0.4 * cx('comando');
      this.fmepMul = (0.5 + 0.5 * visc) * (1 + 3 * bound + (clr < 0 ? -clr / 15e-6 * 2 : 0));
      return this;
    }
    die(msg) { this.seized = true; this.fail = msg; }
    get coolC() { return this.T.cool - C2K; }                                           // sensor de temperatura do motor (para a ECU)
    // para o motor: temperaturas das paredes da câmara (K)
    get twH() { return this.T.head + 25; } get twP() { return this.T.pis; } get twL() { return this.T.lin + 15; }
    report() {
      const T = this.T, k = x => x - C2K;
      return { head: k(T.head), ev: k(T.ev), pis: k(T.pis), lin: k(T.lin), blk: k(T.blk), cool: k(T.cool), oil: k(T.oil), gbo: k(T.gbo), clu: k(T.clu), tb: k(T.tb), brg: k(T.brg),
        lvlC: this.lvlC, boil: this.boil, fan: this.fan, thermo: this.thermo, pOil: this.pOil / 1e5, film: this.film, clr: this.clr * 1e6, fmepMul: this.fmepMul,
        lam: Object.assign({}, this.lam), wear: Object.fromEntries(Object.entries(this.wear).map(([a, b]) => [a, b * 1e6])), rate: Object.assign({}, this.rate),
        fail: this.fail, seized: this.seized, Q: this.Q, vAir: this.vAir || 0 };
    }
  }
  return { OILS, GEAROILS, COOLANTS, COOLING, PARTS, Thermal, nu, mu, regime, contact };
}
if (typeof module !== 'undefined') module.exports = THERMAL_LIB;
