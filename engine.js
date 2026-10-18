// Núcleo físico do simulador — roda no navegador, dentro do AudioWorklet e no node (check.js).
// Modelo 0D de enchimento/esvaziamento integrado no tempo (passo ~10 µs):
//  • câmara (cilindro 4T, cilindro 2T com cárter, ou face de rotor Wankel): massa + energia,
//    escoamento compressível pelas válvulas/janelas, Wiebe com chama turbulenta, Woschni, detonação
//    (Livengood-Wu/Douaud-Eyzat), variação ciclo a ciclo e falhas por diluição;
//  • válvulas com dinâmica de mola: acima do giro de projeto o came "foge" da válvula (flutuação)
//    e ela quica na sede; comando desmodrômico não flutua, mola pneumática (F1) quase não;
//  • admissão com volume do duto + guia de onda (efeito ram) e bolsão de gás revertido;
//    escape em guias de onda com junção N-em-1 (ou câmara de expansão no 2 tempos);
//  • turbo/supercharger, ECU (mapa calibrado pelo modelo, λ, bicos, limitador por corte de ignição
//    ou combustível, marcha lenta, mapa de estalos), ERS e limite de fluxo de combustível (F1);
//  • transmissão e veículo em drive.js.
function ENGINE_LIB() {
  'use strict';
  const CAT = (typeof ENGINE_CATALOG !== 'undefined' ? ENGINE_CATALOG : require('./catalog.js'))();
  const DRV = (typeof DRIVE_LIB !== 'undefined' ? DRIVE_LIB : require('./drive.js'))();
  const TH = (typeof THERMAL_LIB !== 'undefined' ? THERMAL_LIB : require('./thermal.js'))();
  const { ENGINES, FUELS, EXH, PORTS } = CAT;
  const R = 287, PAMB = 101325, TAMB = 298, TWALL = 450, DEG = Math.PI / 180, WG = 4096, WM = WG - 1;

  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const cross = (t0, t1, e, C) => (t0 < e && e <= t1) || (t0 < e + C && e + C <= t1);
  const rd = (b, x) => { const i = Math.floor(x), f = x - i; return b[i & WM] * (1 - f) + b[(i + 1) & WM] * f; };
  function overlap(a0, a1, b0, b1, C) {
    let s = 0;
    for (const k of [-C, 0, C]) s += Math.max(0, Math.min(a1 + k, b1) - Math.max(a0 + k, b0));
    return s;
  }
  function fidx(ax, v) {
    if (v <= ax[0]) return 0;
    for (let i = 1; i < ax.length; i++) if (v <= ax[i]) return i - 1 + (v - ax[i - 1]) / (ax[i] - ax[i - 1]);
    return ax.length - 1;
  }
  function lift(th, o, c, L, ex) { if (th <= o || th >= c) return 0; const f = (th - o) / (c - o); return L * Math.pow(4 * f * (1 - f), ex); }
  // área efetiva: cortina (π·d·L) limitada pela garganta; em levante baixo o jato descola e o Cd cai (bancada de fluxo)
  const vArea = (l, d, cd, nv) => nv * cd * Math.min(1, 0.4 + 2.4 * l / d) * Math.min(Math.PI * d * l, Math.PI / 4 * (0.9 * d) ** 2);

  // escoamento isentrópico por orifício (kg/s), pu ≥ pd
  const gas = k => ({ k1: 2 * k / (k - 1), ik: 1 / k, crit: Math.pow(2 / (k + 1), k / (k - 1)), choke: Math.sqrt(k) * Math.pow(2 / (k + 1), (k + 1) / (2 * (k - 1))) });
  const GA = gas(1.4), GE = gas(1.33);
  function orifice(A, pu, Tu, pd, G) {
    const pr = pd / pu;
    let psi = G.choke;
    if (pr > G.crit) { const x = Math.pow(pr, G.ik); psi = Math.sqrt(Math.max(0, G.k1 * x * (x - pr))); }
    return A * pu * psi / Math.sqrt(R * Tu);
  }
  // válvula em série com a impedância acústica Z do duto: Δp = (ṁ/C)² + Z·ṁ, resolvido exato
  function vflow(A, pu, Tu, pd, Z, G) {
    const F = orifice(A, pu, Tu, pd, G);
    if (F <= 0) return 0;
    const dp = pu - pd, q = 2 * dp / F;
    return 2 * dp / (Z + Math.sqrt(Z * Z + q * q));
  }

  function build(cfg) {
    const E = cfg.over ? Object.assign({}, ENGINES[cfg.eng], cfg.over) : ENGINES[cfg.eng];   // a configuração pronta pode ajustar o motor
    const n = cfg.cyl, rot = E.fam === 'rotary', two = E.fam === 'two', C = rot ? 1080 : two ? 360 : 720;
    const lay = CAT.layout(E, n), vd = cfg.cc * 1e-6 / n, vd0 = E.cc * 1e-6 / E.cyl, sz = C * 2;
    const g = { E, n, rot, two, cyc: C, lay, nch: lay.length, vd, cc: cfg.cc, cr: cfg.cr, vc: vd / (cfg.cr - 1), idle: E.idle,
      veh: Object.assign({}, E.veh, cfg.veh || {}), ivo: E.ivo, ivc: E.ivc, evo: E.evo, evc: E.evc, ports: cfg.ports || 'std',
      Ai: new Float32Array(sz), Ae: new Float32Array(sz), Li: new Float32Array(sz), Le: new Float32Array(sz) };
    g.trans = g.veh.prop ? 'prop' : cfg.trans && cfg.trans !== 'prop' ? cfg.trans : g.veh.car ? 'manual' : 'seq';
    if (rot) { // Wankel: V = Vmin + Vd/2·(1 − cos(2θ/3)), janelas laterais (preparação muda abertura e área)
      const s = Math.cbrt(vd / vd0), d = (PORTS[g.ports] || PORTS.std).d;
      Object.assign(g, { e: E.e * s, Rg: E.Rg * s, w: E.w * s, B: 0.08 * s, S: 0.06 * s, limit: Math.round(E.limit / s / 100) * 100,
        ivo: E.ivo + d[0], ivc: E.ivc + d[1], evo: E.evo + d[4], tbA: Math.PI / 4 * (E.tbD * s) ** 2 * d[2], hA: Math.PI / 4 * (E.hdrD * s) ** 2 * d[3],
        flame: 0.35 * Math.sqrt(3) * E.Rg * s, Aw: 2.5 * Math.sqrt(3) * E.Rg * E.w * s * s, pumpA: 270, pumpB: 810, injT: 360, mbt50: 12 });
      for (let i = 0; i < sz; i++) {
        g.Li[i] = Math.min(1, 1.6 * lift(i / 2, g.ivo, g.ivc, 1, 1)); g.Le[i] = Math.min(1, 1.6 * lift(i / 2, g.evo, g.evc, 1, 1));
        g.Ai[i] = g.Li[i] * E.iA * s * s * d[2]; g.Ae[i] = g.Le[i] * E.eA * s * s * d[3];
      }
    } else {
      const S = Math.cbrt(4 * vd / (Math.PI * E.bs * E.bs)), S0 = Math.cbrt(4 * vd0 / (Math.PI * E.bs * E.bs)), B = E.bs * S, a = S / 2;
      Object.assign(g, { B, S, a, L: a * E.rod, Ap: Math.PI * B * B / 4, limit: Math.round(E.limit * S0 / S / 100) * 100,
        tbA: Math.PI / 4 * (E.tb * B) ** 2, hA: Math.PI / 4 * (E.hdr * B) ** 2, flame: (E.plugs === 2 ? 0.36 : 0.55) * B, Ah: 2.3 * Math.PI * B * B / 4, mbt50: 8 }); // 2 velas: 2 frentes de chama
      if (two) { // 2 tempos: janelas na parede do cilindro descobertas pelo pistão; cárter bombeia a mistura
        const xp = th => { const t = th * DEG, s = Math.sin(t); return a + g.L - a * Math.cos(t) - Math.sqrt(g.L * g.L - a * a * s * s); };
        const hE = xp(E.epo), hT = xp(E.tpo);
        Object.assign(g, { ivo: E.tpo, ivc: 360 - E.epo, evo: E.epo, evc: 360 - E.epo, tpc: 360 - E.tpo, pumpA: 0, pumpB: 0, injT: 360,
          Vcc0: vd * E.ccv, reedA: E.reedA * g.Ap, pipe: E.pipe, xp });
        for (let i = 0; i < sz; i++) {
          const th = i / 2, x = xp(th);
          g.Le[i] = th > E.epo && th < 360 - E.epo ? Math.max(0, x - hE) : 0; g.Li[i] = th > E.tpo && th < 360 - E.tpo ? Math.max(0, x - hT) : 0;
          g.Ae[i] = E.cd * E.exW * B * g.Le[i]; g.Ai[i] = E.cd * E.trW * B * g.Li[i];
        }
      } else {
        Object.assign(g, { ivo: 360 - E.ivo, ivc: 540 + E.ivc, evo: 180 - E.evo, evc: 360 + E.evc, ivd: E.ivD * B, evd: E.evD * B, pumpA: 180, pumpB: 540, injT: 720 });
        g.ivl = E.ivL * g.ivd; g.evl = E.evL * g.evd;
        for (let i = 0; i < sz; i++) {
          g.Li[i] = lift(i / 2, g.ivo, g.ivc, g.ivl, 1.5); g.Le[i] = lift(i / 2, g.evo, g.evc, g.evl, 1.5);
          g.Ai[i] = vArea(g.Li[i], g.ivd, E.cd, E.nv); g.Ae[i] = vArea(g.Le[i], g.evd, E.cd, E.nv);
        }
      }
    }
    if (cfg.limit) g.limit = cfg.limit;
    if (!rot && !two) { // molas: k/m para a flutuação começar em vf × corte (pneumática: bem acima; desmo: nunca)
      const vf = E.pneumatic ? 1.35 : E.vf || 1.12;
      const spring = tab => {
        const d1 = new Float32Array(sz), d2 = new Float32Array(sz); let Lm = 0, sm = 0;
        for (let i = 0; i < sz; i++) { const p = tab[(i + sz - 1) % sz], q = tab[i], r = tab[(i + 1) % sz]; d1[i] = r - p; d2[i] = (r - 2 * q + p) / 0.25; Lm = Math.max(Lm, q); }
        const x0 = 0.6 * Lm, k2 = (180 / Math.PI) ** 2;
        for (let i = 0; i < sz; i++) if (tab[i] > 0) sm = Math.max(sm, -d2[i] * k2 / (tab[i] + x0));
        const wf = vf * g.limit * Math.PI / 30;
        return { tab, d1, d2, x0, km: E.desmo ? Infinity : sm * wf * wf };
      };
      g.vsI = spring(g.Li); g.vsE = spring(g.Le); g.floatRpm = E.desmo ? 0 : vf * g.limit;
    }
    g.Vr = E.vr * vd; g.hB = 3.26 * Math.pow(g.B, -0.2); g.Vf = vd * g.nch * (two ? 2 : 720 / C); // cilindrada "4 tempos" equivalente
    g.tw = E.tw || TWALL; g.etac = E.etac || 0.97;                              // parede (arrefecido a ar = mais quente), eficiência de queima
    g.plen = E.plenum ? E.plenum * vd * n : 0;                                   // coletor (plenum) com borboleta única
    g.thrA = g.plen ? Math.PI / 4 * E.tbD ** 2 * cfg.cc / E.cc : g.tbA;
    g.iac0 = 0.01 * (g.plen ? g.Vf : g.Vf / n);                                  // ar de marcha lenta ~10 mm² por litro servido
    g.J = E.J * Math.pow(cfg.cc / E.cc, 0.8) * (1 + 0.8 / (n * n)) / (1 + 0.8 / (E.cyl * E.cyl));
    if (g.veh.prop) g.J += (g.veh.Jp || 5) * Math.pow(g.veh.red || 1, 2);       // a hélice gira junto com o virabrequim
    const ng = Math.max(...lay.map(c => c.grp)) + 1;
    g.grp = [];
    for (let k = 0; k < ng; k++) { // junção N-em-1: reflexão própria (rS) e cruzada (rX)
      const m = rot ? n : lay.filter(c => c.grp === k).length, S2 = g.hA * (m + (m === 1 ? 6 : 0.5 + 0.5 * m));
      g.grp.push({ rS: 2 * g.hA / S2 - 1, rX: 2 * g.hA / S2 });
    }
    g.fi = sizeFI(g, cfg);
    return g;
  }
  // Dimensiona turbo/supercharger para a pressão alvo (rotor do compressor, turbina, inércia)
  function sizeFI(g, cfg) {
    if (!cfg.fi || cfg.fi === 'na') return null;
    const PRt = 1 + cfg.boost * 1e5 / PAMB, rpmD = (cfg.fi === 'turbo' ? 0.7 : 1) * g.limit;
    const md = PRt * 1.18 * g.Vf * rpmD / 120 * 0.95, fl = 0.61, PR0 = 1 + (1.06 * PRt - 1) / fl;
    const Ud = Math.sqrt((Math.pow(PR0, 0.2857) - 1) * 1005 * TAMB / 0.675), rc = 1.4 * Math.sqrt(md / (1.2 * 150 * Math.PI));
    const F = { type: cfg.fi, target: cfg.boost * 1e5, md, rc, Nd: Ud / rc, mch: md / Math.sqrt(1 - fl), Jt: 3e-5 * (rc / 0.026) ** 4 };
    F.ratio = F.Nd / (g.limit * Math.PI / 30);
    if (cfg.fi === 'turbo') { // turbina com 25% de folga de potência no ponto de projeto (a wastegate regula)
      const Te = 1150, me = md * 1.07, po = PAMB + 15e3, Pc = md * 1005 * TAMB * (Math.pow(PRt, 0.2857) - 1) / 0.72;
      const x = Math.min(0.6, 1.25 * Pc / (0.7 * me * 1157 * Te)), pt = po / Math.pow(1 - x, 1 / 0.2481);
      F.At = me / orifice(1, pt, Te, po, GE); F.Awg = F.At;
    }
    return F;
  }
  function vol(g, th) {
    if (g.rot) return g.vc + g.vd / 2 * (1 - Math.cos(th * DEG * 2 / 3));
    const t = th * DEG, s = Math.sin(t);
    return g.vc + g.Ap * (g.a + g.L - g.a * Math.cos(t) - Math.sqrt(g.L * g.L - g.a * g.a * s * s));
  }
  function dvol(g, th) { // dV/dθ por radiano do virabrequim/eixo excêntrico
    if (g.rot) return g.vd / 3 * Math.sin(th * DEG * 2 / 3);
    const t = th * DEG, s = Math.sin(t);
    return g.Ap * g.a * s * (1 + g.a * Math.cos(t) / Math.sqrt(g.L * g.L - g.a * g.a * s * s));
  }
  const mkTrace = C => { const o = {}; for (const k of ['p', 'v', 'T', 'X', 'mi', 'me', 'li', 'le']) o[k] = new Float32Array(C); return o; };

  class Engine {
    constructor(cfg) {
      const g = this.g = build(cfg), E = g.E, C = g.cyc;
      this.cfg = cfg;
      this.inp = { tps: 0, clutch: 0, brake: 0, starter: false, ign: false, sparkMode: 'map', sparkOff: 0, sparkMan: 30,
        lamMode: 'auto', lam: 0.9, inj: E.inj, eoi: g.rot ? 500 : g.two ? 200 : 300, exh: cfg.exh || 'stock', qs: true, lim: 'fuel', crackle: !!cfg.crackle,
        cool: cfg.cool || E.cool || 'liquid', coolant: 'glicol', oil: cfg.oil || E.oil || (E.grupo === 'Motos' ? '10w40' : E.grupo === 'Fórmula 1' ? '0w20' : '5w30'),
        oilLvl: 1, gearOil: g.trans === 'auto8' ? 'atf' : g.trans === 'cvt' ? 'cvtf' : '75w90', gearLvl: 1, Tamb: 25, tk: 1, warm: true };
      this.setFuel(cfg.fuel || 'e0_95');
      this.ecu = null; this.fixed = false; this.noCut = false; this.seed = 12345;
      this.th = 0; this.w = 0; this.v = 0; this.ww = 0; this.gear = 0; this.k = 0; this.t = 0; this.stT = 0; this.lastFire = -9;
      this.mAir = 0; this.mEx = 0; this.Teg = 700; this.fmep = 0.5e5; this.fIn = 0; this.vvt = 0; this.pops = 0;
      this.cut = false; this.dfco = false; this.qsT = 0; this.iacI = 0; this.iacA = g.iac0;
      this.pp = PAMB; this.Tp = TAMB; this.Xp = 0; this.mp = PAMB * (g.plen || 1) / (R * TAMB);
      this.tq = 0; this.sndE = 0; this.sndI = 0; this.sndB = 0; this.fs = (675e-6 / g.Vf) ** 2;
      this.pab = PAMB; this.Tab = TAMB; this.pexM = PAMB; this.wt = 1500; this.wg = 0; this.wgE = 0; this.bov = 0;
      this.pt = PAMB; this.Pc = 0; this.PR = 1; this.T2 = TAMB; this.scT = 0; this.fiN = 0;
      this.soc = E.ers ? 4e6 : 0; this.ersP = 0;
      // temperaturas: paredes da câmara (cabeçote, pistão, camisa) vêm da rede térmica; ajuste do sensor de detonação
      this.therm = new TH.Thermal(g, this.inp); this.thAcc = 0; this.qH = 0; this.qP = 0; this.qL = 0; this.qPort = 0; this.pfAcc = 0; this.kr = 0;
      this.twH = g.tw; this.twP = g.tw + 40; this.twL = g.tw - 60; this.fMul = 1; this.Tamb = TAMB; this.pmaxL = 3e6;
      this.ev = new Float32Array(192); this.evN = 0;                     // eventos para o som
      this.tr = mkTrace(C); this.trL = mkTrace(C);
      this.gsum = g.grp.map(() => 0);
      this.dl = new DRV.Driveline(g.veh, g.trans, { idle: g.idle, limit: g.limit, peak: E.ref.rpmP * g.limit / E.limit, Tmax: E.ref.nm * cfg.cc / E.cc, Prated: E.ref.cv * 735.5 * cfg.cc / E.cc });
      const port = grp => ({ rm: PAMB * g.Vr / (R * TAMB), rT: TAMB, rX: 0, rp: PAMB, f: new Float32Array(WG), b: 0, acc: 0, dc: 0, fD: 0, grp,
        dmOut: 0, dmBack: 0, hBack: 0, xBack: 0, pk: 0, pkX: 0, fromPk: 0 });
      this.ips = []; this.eps = [];
      this.cyl = g.lay.map((l, i) => { // no rotativo as 3 faces de um rotor compartilham as janelas
        const key = g.rot ? l.rotor : i;
        const ip = this.ips[key] || (this.ips[key] = port(0)), ep = this.eps[key] || (this.eps[key] = port(l.grp));
        const th = (C - l.off) % C, V = vol(g, th);
        const c = { i, off: l.off, ip, ep, V, m: PAMB * V / (R * TAMB), T: TAMB, X: 0, dme: 0,
          closed: th >= g.ivc || th < g.evo, comb: false, fired: false, xb: 0, since: 0, dth: 0, thd: 0, Q: 0,
          spk: 0, adv: 0, ma: 0, mf: 0, pw: 0, lam: 0, cool: 0, I: 0, kI: 0, kn: 0, hm: 1,
          pivc: PAMB, Tivc: TAMB, Vivc: V, Xivc: 0, Tsp: TAMB, psp: PAMB, vy: [0, 0], vv: [0, 0], vc: [1, 1], flt: 0, bnc: 0, del: 0,
          W: 0, Wp: 0, pmax: 0, apmax: 0, Tmax: 0, eH: 0, eM: 0, last: null };
        if (g.two) { const Vc = g.Vcc0 + g.Ap * (g.S - g.xp(th)); c.cc = { V: Vc, m: PAMB * Vc / (R * TAMB), T: TAMB, X: 0 }; }
        return c;
      });
    }
    rand() { let x = this.seed; x ^= x << 13; x ^= x >> 17; x ^= x << 5; this.seed = x; return (x >>> 0) / 4294967296; }
    setFuel(k) { this.fuelKey = k; this.fuel = FUELS[k]; this.onF = Math.pow(this.fuel.ron / 100, 3.402); }
    event(type, amp, i) { const k = (this.evN % 64) * 3; this.ev[k] = type; this.ev[k + 1] = amp; this.ev[k + 2] = i; this.evN++; }
    shift(d) {
      const was = this.dl.gear;
      if (!this.dl.shift(d)) return;
      if (d > 0 && was > 0 && (this.g.trans === 'seq' || this.g.trans === 'manual') && this.inp.qs && this.inp.clutch < 0.3 && this.inp.tps > 0.2)
        this.qsT = this.g.veh.race ? 0.012 : 0.07;                                // quickshifter (F1: troca sem corte)
      this.gear = this.dl.gear;
    }
    thArea(t) { const a0 = 7 * DEG, a = a0 + t * (Math.PI / 2 - a0); return this.g.thrA * (1 - Math.cos(a) / Math.cos(a0) + 3e-4); }
    lookup(key, rpm, tps) {
      const e = this.ecu; if (!e) return 20;
      const n = e.tps.length, t = e[key], x = fidx(e.rpm, rpm), y = fidx(e.tps, tps);
      const i = Math.min(x | 0, e.rpm.length - 2), j = Math.min(y | 0, n - 2), u = x - i, v = y - j;
      return (t[i * n + j] * (1 - u) + t[(i + 1) * n + j] * u) * (1 - v) + (t[i * n + j + 1] * (1 - u) + t[(i + 1) * n + j + 1] * u) * v;
    }

    step(dt) {
      const g = this.g, E = g.E, inp = this.inp, C = g.cyc, rpm = this.w * 30 / Math.PI, Sp = g.S * rpm / 30, dth = this.w * dt / DEG;
      this.t += dt; this.dtL = dt;
      // motor de arranque desliga sozinho quando o motor pega (ou após 4 s)
      if (inp.starter) { this.stT += dt; if ((rpm > 0.6 * g.idle && this.t - this.lastFire < 0.15) || this.stT > 4) inp.starter = false; } else this.stT = 0;
      this.tRun = inp.starter ? 0 : (this.tRun || 0) + dt;                       // tempo desde que o motor pegou
      // ECU: limitador (corte de ignição/combustível ou desligado), corte em desaceleração, quickshifter, marcha lenta
      if (!this.noCut) {
        if (inp.lim !== 'off' && rpm > g.limit) this.cut = true; else if (rpm < g.limit - 250 || inp.lim === 'off') this.cut = false;
        if (inp.tps < 0.02 && rpm > g.idle + Math.max(1000, 0.6 * g.idle) && this.t > 3 && !inp.crackle) this.dfco = true; else if (inp.tps >= 0.02 || rpm < g.idle + 400 || inp.crackle) this.dfco = false;
      }
      if (this.qsT > 0) this.qsT -= dt;
      if (inp.tps < 0.03 && !this.fixed && rpm > 0.4 * g.idle) {
        // marcha lenta acelerada com o motor frio (como a ECU faz) e mais ar disponível para vencer o óleo grosso
        const cold = clamp((60 - this.therm.coolC) / 70, 0, 1), tgt = g.idle * (1 + 0.45 * cold), e = tgt - rpm;
        this.iacI = clamp(this.iacI + e * dt * 2e-3 * g.iac0, -0.4 * g.iac0, (3 + 4 * cold) * g.iac0);
        this.iacA = clamp(g.iac0 * (1 + 1.5e-3 * e) + this.iacI, (this.dfco ? 0.8 : 0.3) * g.iac0, (4 + 5 * cold) * g.iac0); // dashpot na desaceleração
      }
      if (++this.fiN >= 8) { this.fiN = 0; this.fiStep(8 * dt); }
      // variador de fase do comando de admissão: atrasa em carga baixa (menos cruzamento → marcha lenta limpa)
      if (E.vvt) this.vvt += (E.vvt * clamp(1 - inp.tps / 0.35, 0, 1) * clamp(1.6 - 2 * rpm / g.limit, 0, 1) - this.vvt) * Math.min(1, dt / 0.15);
      const thA = this.thArea(inp.tps), Ath = 0.85 * (thA + this.iacA);
      // de onde os dutos puxam: caixa de ar pela borboleta (ITB) ou o plenum (que a borboleta única alimenta)
      const up = g.plen ? this.pp : this.pab, Tu = g.plen ? this.Tp : this.Tab, Ain = g.plen ? 0.9 * g.tbA : Ath;
      // guias de onda: atraso de ida e volta; reflexão na borboleta (aberta ≈ ponta aberta)
      const ai = Math.sqrt(1.4 * R * this.ips[0].rT), Teh = 0.8 * this.Teg, ae = Math.sqrt(1.33 * R * Teh);
      const di = clamp(2 * E.lin / ai / dt, 1, WG - 2), de = clamp(2 * E.lex / ae / dt, 1, WG - 2);
      const fr = g.plen ? 1 : Math.min(1, thA / g.tbA), ri = E.wli * (0.3 - 1.15 * fr), Zi = ai / g.tbA, Ze = ae / g.hA;
      let sE = 0, sI = 0;
      for (const p of this.ips) { p.b = ri * rd(p.f, this.k - di); p.acc = 0; sI += rd(p.f, this.k - di / 2); }
      if (g.two) { // câmara de expansão: difusor devolve depressão (ajuda a lavar), cone de retorno devolve pressão (tampa a janela)
        const pp = g.pipe, dd = clamp(2 * pp.ld / ae / dt, 1, WG - 2), db = clamp(2 * pp.lb / ae / dt, 1, WG - 2);
        for (const p of this.eps) { p.b = E.wle * (pp.rd * rd(p.f, this.k - dd) + pp.rb * rd(p.f, this.k - db)); p.acc = 0; sE += 0.45 * rd(p.f, this.k - db / 2); }
      } else {
        this.gsum.fill(0);
        for (const p of this.eps) { p.fD = rd(p.f, this.k - de); this.gsum[p.grp] += p.fD; sE += g.grp[p.grp].rX * rd(p.f, this.k - de / 2); p.acc = 0; }
        for (const p of this.eps) { const G = g.grp[p.grp]; p.b = E.wle * (G.rS * p.fD + G.rX * (this.gsum[p.grp] - p.fD)); }
      }
      this.sndE = sE; this.sndI = sI * Math.min(1, thA / g.thrA) * 0.6;
      let Tg = 0, mt = 0, me = 0, sB = 0;
      for (const c of this.cyl) { Tg += this.cylStep(c, dt, dth, rpm, Sp, this.pexM, Teh, Zi, Ze); me += Math.max(0, c.dme); sB += c.dp; }
      this.sndB = sB;
      let hb = 0, mo = 0, mb = 0, xb = 0;
      for (const p of this.ips) { // duto de admissão (volume entre borboleta/plenum e válvula) com bolsão de gás revertido
        const dmt = (up > p.rp ? orifice(Ain, up, Tu, p.rp, GA) : -orifice(Ain, p.rp, p.rT, up, GA)) * dt;
        let dEr = dmt > 0 ? dmt * (1004.5 * Tu - 717.5 * p.rT) : dmt * R * p.rT;
        if (dmt > 0) mo += dmt; else { mb -= dmt; hb -= dmt * 1004.5 * p.rT; xb -= dmt * p.rX; }
        dEr += -p.dmOut * R * p.rT + p.hBack - p.dmBack * 717.5 * p.rT;
        const rm1 = Math.max(p.rm + dmt - p.dmOut + p.dmBack, 1e-9);
        const pk1 = Math.max(0, p.pk - p.fromPk + p.dmBack);                           // o gás que voltou fica perto da válvula e volta primeiro
        p.pkX = pk1 > 0 ? clamp((p.pkX * (p.pk - p.fromPk) + p.xBack) / pk1, 0, 1) : 0;
        const bm0 = p.rm - p.pk, bm1 = Math.max(rm1 - pk1, 1e-9);
        p.rX = clamp((p.rX * (bm0 - (p.dmOut - p.fromPk) - Math.max(0, -dmt)) + (g.plen ? Math.max(0, dmt) * this.Xp : 0)) / bm1, 0, 1);
        p.pk = pk1;
        if (p.pk > 0.5 * rm1) { const sp = p.pk - 0.5 * rm1; p.rX = clamp((p.rX * bm1 + sp * p.pkX) / (bm1 + sp), 0, 1); p.pk -= sp; }
        p.rT = clamp(p.rT + dEr / (p.rm * 717.5), 220, 1500); p.rm = rm1; p.rp = rm1 * R * p.rT / g.Vr;
        p.dmOut = p.dmBack = p.hBack = p.xBack = p.fromPk = 0; mt += dmt;
      }
      if (g.plen) { // plenum: entra pela borboleta, sai pelos dutos
        const pab = this.pab, Tab = this.Tab, dmi = (pab > this.pp ? orifice(Ath, pab, Tab, this.pp, GA) : -orifice(Ath, this.pp, this.Tp, pab, GA)) * dt;
        let dEp = dmi > 0 ? dmi * (1004.5 * Tab - 717.5 * this.Tp) : dmi * R * this.Tp;
        dEp += -mo * R * this.Tp + hb - mb * 717.5 * this.Tp;
        const m1 = Math.max(this.mp + dmi - mo + mb, 1e-9);
        this.Xp = clamp((this.Xp * (this.mp - mo - Math.max(0, -dmi)) + xb) / m1, 0, 1); // gás de escape que reverteu
        this.Tp = clamp(this.Tp + dEp / (this.mp * 717.5), 220, 900); this.mp = m1; this.pp = m1 * R * this.Tp / g.plen;
        mt = dmi;
      }
      // ondas que saem das válvulas; a média da pressão acústica é removida (a média vem do
      // volume do duto e da contrapressão do escape — a onda carrega só a parte oscilante)
      for (const p of this.ips) { p.f[this.k & WM] = p.b + p.acc; p.dc += (2 * p.b + p.acc - p.dc) * dt / 0.1; }
      for (const p of this.eps) { p.f[this.k & WM] = p.b + p.acc; p.dc += (2 * p.b + p.acc - p.dc) * dt / 0.1; }
      this.k++;
      this.mAir += (mt / dt - this.mAir) * dt / 0.02; this.mEx += (me / dt - this.mEx) * dt / 0.02;
      this.tq = Tg;
      if (!this.fixed) {
        const Tl = this.dl.step(dt, this.w, rpm, inp);
        let Tf = this.fmep * g.Vf / (4 * Math.PI) * Math.tanh(this.w / 2);
        if (this.therm.seized) Tf += 6 * this.dl.P.Tmax * Math.tanh(this.w / 0.5);       // travou: nem o motor de arranque gira
        this.thermStep(dt, me, Tf);
        const Ts = inp.starter ? Math.max(0, 60 * Math.pow(g.Vf / 675e-6, 0.8) * (1 - rpm / 500)) : 0;
        let Te = 0;                                                              // ERS (MGU-K) da F1 híbrida
        if (E.ers) {
          this.ersP = this.soc > 0 && inp.tps > 0.95 && this.dl.gear && this.w > 100 ? E.ers * 1e3 : inp.brake > 0.1 && this.dl.v > 5 ? -E.ers * 1e3 * inp.brake : 0;
          if (this.ersP > 0) { Te = this.ersP / this.w; this.soc -= this.ersP * dt; } else if (this.ersP < 0) this.soc = Math.min(4e6, this.soc - this.ersP * dt * 0.8);
        }
        this.w = Math.max(0, this.w + (Tg - Tf - Tl + Ts - this.scT + Te) / g.J * dt);
        this.v = this.dl.v; this.ww = this.dl.ww; this.gear = this.dl.gear;
      }
      this.th = (this.th + dth) % C;
    }

    thermStep(dt, me, Tf) { // acumula o calor do passo e, a cada 2 ms, avança a rede térmica (arrefecimento, óleo, desgaste)
      const inp = this.inp, T = this.therm, dl = this.dl, g = this.g;
      this.Tamb = (inp.Tamb != null ? inp.Tamb : 25) + 273.15;
      this.qPort += 0.05 * me * 1157 * Math.max(0, this.Teg - T.T.head);              // ~5% da entalpia do escape fica no pórtico
      this.pfAcc += Tf * this.w * dt; this.thAcc += dt;
      if (this.thAcc < 2e-3) return;
      const a = this.thAcc, rpm = this.w * 30 / Math.PI, Esh = dl.Esh; dl.Esh = 0;
      this.kr = Math.max(0, this.kr - 1.5 * a);                                        // sensor de detonação devolve o avanço aos poucos
      this.egtD = (this.egtD || this.Teg) + (this.Teg - (this.egtD || this.Teg)) * Math.min(1, a / 0.8);   // termopar: ~0,8 s de inércia
      T.step(a, inp, { rpm, v: dl.type === 'prop' ? dl.vAir : Math.abs(dl.v), acc: dl.acc, Qh: this.qH / a, Ql: this.qL / a, Qp: this.qP / a, Qport: this.qPort / a, Pf: this.pfAcc / a,
        pmax: this.pmaxL, Sp: g.S * rpm / 30, wt: this.wt, Teg: this.Teg, wIn: dl.ww * dl.ratio() / (g.trans === 'seq' || g.trans === 'manual' ? g.veh.primary : 1),
        Tg: Math.abs(dl.Tc), Pgear: 0.02 * Math.abs(dl.Tw * dl.ww), Pclutch: dl.Pslip || 0, Eshift: Esh, mix: this.fuel.oil || 0, fuelOn: inp.ign && !this.dfco && !this.cut });
      this.twH = T.twH; this.twP = T.twP; this.twL = T.twL; this.fMul = T.fmepMul;
      this.thAcc = this.qH = this.qP = this.qL = this.qPort = this.pfAcc = 0;
    }

    fiStep(dt) { // caixa de ar / compressor / turbina
      const F = this.g.fi, inp = this.inp, ma = Math.max(0, this.mAir), fast = this.fixed ? 0.1 : 1, X = EXH[inp.exh] || EXH.stock;
      const p1 = PAMB + 0.36 * this.v * this.v - 2.5e5 * this.fs * ma * ma, muff = PAMB + X.k * this.fs * this.mEx * this.mEx;
      if (!F) { this.pab = p1; this.Tab = this.Tamb; this.pexM = muff; return; }
      const N = F.type === 'sc' ? this.w * F.ratio : this.wt, U = N * F.rc, shut = inp.tps < 0.05;
      // blow-off: borboleta fecha com pressão → alivia para o compressor não entrar em surge
      if (shut && !this.bov && this.pab > PAMB + 15e3) { this.bov = 1; this.event(5, (this.pab - PAMB) / 1e5, 0); }
      else if (!shut) this.bov = 0;
      const Ta = this.Tamb, PR0 = Math.pow(1 + 0.675 * U * U / (1005 * Ta), 3.5); // Euler: Δh = σ·η·U²
      const mc = Math.max(ma, this.bov * F.md * 0.5), mch = F.mch * Math.max(0.05, N / F.Nd);
      const PR = 1 + (PR0 - 1) * Math.max(0, 1 - (mc / mch) ** 2);             // linha de rotação até o choke
      const T2 = Ta * (1 + (Math.pow(PR, 0.2857) - 1) / 0.72);
      this.Pc = mc * 1005 * (T2 - Ta); this.PR = PR; this.T2 = T2; this.mc = mc;
      const p2 = p1 * PR - 1e4 * (mc / F.md) ** 2;                               // perda no intercooler/tubos
      this.pab += ((this.bov ? p1 + (p2 - p1) * 0.1 : p2) - this.pab) * Math.min(1, dt / (0.04 * fast));
      this.Tab = T2 - 0.75 * (T2 - Ta);                                           // intercooler 75%
      if (F.type === 'sc') { this.scT = this.Pc / Math.max(this.w, 30) / 0.92; this.pexM = muff; return; }
      const err = this.pab - PAMB - F.target;                                     // wastegate (PI)
      this.wg = clamp(this.wg + err * dt * 2e-5, 0, 1);
      const wg = this.wgE = clamp(this.wg + err * 2e-5, 0, 1), Ag = F.At + F.Awg * wg, me = Math.max(this.mEx, 1e-4), Te = Math.max(500, this.Teg);
      let lo = muff, hi = 10 * PAMB;                                              // pressão antes da turbina
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (orifice(Ag, mid, Te, muff, GE) > me) hi = mid; else lo = mid; }
      this.pt = this.pexM = (lo + hi) / 2;
      const Pt = 0.7 * me * (F.At / Ag) * 1157 * Te * (1 - Math.pow(muff / this.pt, 0.2481));
      this.wt = Math.max(800, this.wt + ((Pt - this.Pc) / Math.max(this.wt, 1000) - 2e-6 * this.wt) * dt / (F.Jt * (this.fixed ? 0.02 : 1)));
    }

    valve(c, s, V, j, wd, dt) { // levante real da válvula (m): segue o came ou voa/quica quando a mola não dá conta
      const L = V.tab[j];
      if (V.km === Infinity) return (c.vy[s] = L);
      if (c.vc[s]) {
        if (L > 0 && V.d2[j] * wd * wd < -V.km * (L + V.x0)) { c.vc[s] = 0; c.vv[s] = V.d1[j] * wd; } // o came desacelera mais do que a mola consegue
        else { c.vv[s] = V.d1[j] * wd; return (c.vy[s] = L); }
      }
      let y = c.vy[s], v = c.vv[s];
      v += (-V.km * (y + V.x0) - 0.1 * Math.sqrt(V.km) * v) * dt; y += v * dt;
      if (y <= L) {
        if (L <= 1e-5 && v < -0.05) { y = 0; v = -0.35 * v; this.event(7, Math.min(1, -v / 2), c.i); c.bnc++; } // bate na sede e quica
        else { y = L; v = V.d1[j] * wd; c.vc[s] = 1; }
      }
      c.vy[s] = y; c.vv[s] = v;
      if (y - L > c.flt) c.flt = y - L;
      return y;
    }

    cylStep(c, dt, dth, rpm, Sp, pex, Teh, Zi, Ze) {
      const g = this.g, E = g.E, C = g.cyc, ip = c.ip, ep = c.ep, t0 = (this.th - c.off + C) % C, t1r = t0 + dth, t1 = t1r % C;
      if (cross(t0, t1r, (g.ivc + this.vvt) % C, C)) this.ivc(c, rpm, Sp);
      if (cross(t0, t1r, c.spk, C)) this.spark(c, rpm, Sp);
      if (cross(t0, t1r, g.evo, C)) this.evo(c);
      const V0 = c.V, V1 = vol(g, t1), p = c.m * R * c.T / V0, T0 = c.T, j = (t1 * 2) | 0;
      let ai, ae, li = g.Li[j], le = g.Le[j];
      if (g.vsI) { // válvulas com dinâmica de mola
        const wd = this.w / DEG, ji = ((((t1 - this.vvt) % C) + C) % C * 2) | 0;
        li = this.valve(c, 0, g.vsI, ji, wd, dt); le = this.valve(c, 1, g.vsE, j, wd, dt);
        ai = li > 0 ? vArea(li, g.ivd, E.cd, E.nv) : 0; ae = le > 0 ? vArea(le, g.evd, E.cd, E.nv) : 0;
      } else { ai = g.Ai[g.rot ? ((((t1 - this.vvt) % C) + C) % C * 2) | 0 : j]; ae = g.Ae[j]; }
      let dmi = 0, dme = 0, Tin = 0, Xin = 0, dmr = 0, pcc = 0, Vc1 = 0;  // + entra no cilindro / + sai para o escape
      if (g.two) { // cárter: palheta (só entra) e transferência para o cilindro
        const cc = c.cc; Vc1 = g.Vcc0 + g.Ap * (g.S - g.xp(t1)); pcc = cc.m * R * cc.T / cc.V;
        if (ip.rp > pcc) dmr = Math.min(orifice(g.reedA * Math.min(1, (ip.rp - pcc) / 15e3) + 1e-7, ip.rp, ip.rT, pcc, GA) * dt, 0.5 * (ip.rp - pcc) * cc.V / (R * cc.T));
        if (ai > 0) { const lim = 0.5 * Math.abs(pcc - p) * V0 / (R * c.T); dmi = clamp((pcc > p ? orifice(ai, pcc, cc.T, p, GA) : -orifice(ai, p, c.T, pcc, GE)) * dt, -lim, lim); }
        Tin = cc.T - c.cool; Xin = cc.X;
      } else if (ai > 0) {
        const pp = ip.rp + 2 * ip.b - ip.dc, lim = 0.5 * Math.abs(pp - p) * V0 / (R * c.T);
        dmi = clamp((pp > p ? vflow(ai, pp, ip.rT, p, Zi, GA) : -vflow(ai, p, c.T, pp, Zi, GE)) * dt, -lim, lim);
        // ar entra aquecido pelo pórtico (menos tempo de contato em alta), resfriado pela evaporação; o bolsão revertido volta primeiro
        Tin = Math.max(200, ip.rT + (this.twH - 50 - ip.rT) * 0.35 / (1 + Sp / 15) - c.cool);   // pórtico quente aquece a carga
        if (dmi > 0) { const take = Math.min(dmi, Math.max(0, ip.pk - ip.fromPk)); Xin = (take * ip.pkX + (dmi - take) * ip.rX) / dmi; ip.fromPk += take; }
      }
      if (ae > 0) {
        const pp = pex + 2 * ep.b - ep.dc, lim = 0.5 * Math.abs(p - pp) * V0 / (R * c.T);
        dme = clamp((p > pp ? vflow(ae, p, c.T, pp, Ze, GE) : -vflow(ae, pp, Teh, p, Ze, GE)) * dt, -lim, lim);
      }
      // combustão (Wiebe a=5, m=2); detonação queima o resto da mistura em ~2°
      let dQc = 0;
      if (c.comb) {
        c.since += dth;
        const u = (c.since - c.thd) / c.dth;
        let xb = u > 0 ? 1 - Math.exp(-5 * u * u * u) : 0;
        if (c.kn > 0) xb = Math.max(xb, c.xb + (1 - c.xb) * Math.min(1, dth / 2));
        if (c.xb < 0.5 && xb >= 0.5) { this.event(2, c.Q / (g.vd * 4e6), c.i); this.lastFire = this.t; }
        dQc = c.Q * (xb - c.xb); c.xb = xb; c.X = c.Xivc + (1 - c.Xivc) * xb;
        if (xb > 0.9999) c.comb = false;
        // detonação: integral de Livengood-Wu no gás ainda não queimado, comprimido pela frente de chama.
        // Na partida e no 1,5 s seguinte não integra: o modelo adiabático do gás final não perde calor e,
        // com a queima lenta da partida, acusaria detonação que não existe num motor de verdade.
        if (xb < 0.97 && rpm > 0.75 * this.g.idle && (this.tRun > 1.5 || this.fixed)) {
          const Tu = c.Tsp * Math.pow(p / c.psp, 0.2424);
          if (Tu > 650) c.I += dt / (17.68e-3 * this.onF * Math.pow(p / PAMB, -1.7) * Math.exp(3800 / Tu));
          c.kI = c.I;
          if (c.I >= 1 && !c.kn && xb > 0.01) { c.kn = 0.1 * (1 - xb) * p / 1e5; c.hm = 1 + Math.min(2, 0.3 * c.kn); this.event(4, c.kn, c.i); if (!this.fixed) this.kr = Math.min(12, this.kr + 2); }
        }
      }
      // calor (Woschni)
      let wq = (ai > 0 || ae > 0 ? 6.18 : 2.28) * Sp + 0.3;
      if (c.fired && c.closed) wq += 3.24e-3 * g.vd * c.Tivc / (c.pivc * c.Vivc) * Math.max(0, p - c.pivc * Math.pow(c.Vivc / V0, 1.32));
      // paredes: cabeçote, coroa do pistão (ou face do rotor) e camisa exposta, cada uma na sua temperatura
      const aH = g.rot ? 0.4 * g.Aw : g.Ah - g.Ap, aP = g.rot ? 0.35 * g.Aw : g.Ap, aL = g.rot ? 0.25 * g.Aw : 4 * V0 / g.B;
      const hc = g.hB * Math.pow(p * 1e-3 * wq, 0.8) * Math.pow(c.T, -0.55) * c.hm * dt;
      const qH = hc * aH * (c.T - this.twH), qP = hc * aP * (c.T - this.twP), qL = hc * aL * (c.T - this.twL), dQw = qH + qP + qL;
      this.qH += qH; this.qP += qP; this.qL += qL;
      // 1ª lei (γ varia com T e com a fração queimada)
      const k = 1.385 - 7.5e-5 * c.T + c.X * (1e-5 * c.T - 0.025), cv = R / (k - 1);
      let dE = dQc - dQw - p * (V1 - V0);
      dE += dmi > 0 ? dmi * (1004.5 * Tin - cv * c.T) : dmi * R * c.T;
      dE += dme > 0 ? -dme * R * c.T : -dme * (1157 * Teh - cv * c.T);
      const m1 = Math.max(c.m + dmi - dme, 1e-9);
      if (!c.comb) { // 2T: a lavagem é estratificada — o gás que sai pela janela é mais queimado que a média (fração^0,4)
        const xo = g.two && dme > 0 && c.X > 0 ? Math.pow(c.X, 0.4) : c.X;
        c.X = clamp((c.X * (c.m - Math.max(0, -dmi)) - xo * Math.max(0, dme) + Math.max(0, dmi) * Xin + Math.max(0, -dme)) / m1, 0, 1);
      }
      c.T = clamp(c.T + dE / (c.m * cv), 200, 3500); c.m = m1;
      if (g.two) { // cárter: volume varia com o pistão (bomba), recebe pela palheta, entrega pela transferência
        const cc = c.cc, ccv = 717.5;
        let dEc = -pcc * (Vc1 - cc.V) + dmr * (1004.5 * ip.rT - ccv * cc.T);
        dEc += dmi > 0 ? -dmi * R * cc.T : -dmi * (1157 * T0 - ccv * cc.T);
        const mc1 = Math.max(cc.m + dmr - dmi, 1e-9);
        cc.X = clamp((cc.X * (cc.m - Math.max(0, dmi)) + Math.max(0, -dmi) * c.X) / mc1, 0, 1);
        cc.T = clamp(cc.T + dEc / (cc.m * ccv), 220, 1200); cc.m = mc1; cc.V = Vc1;
        ip.dmOut += dmr; c.del += dmr; this.fIn += dmr; ip.acc -= Zi * dmr / dt;
      } else {
        if (dmi > 0) { ip.dmOut += dmi; this.fIn += dmi; } else if (dmi < 0) { ip.dmBack -= dmi; ip.hBack -= dmi * 1157 * T0; ip.xBack -= dmi * c.X; }
        ip.acc -= Zi * dmi / dt;
      }
      ep.acc += Ze * dme / dt;
      // acumuladores do ciclo
      const dW = p * (V1 - V0);
      c.W += dW; if (t1 >= g.pumpA && t1 < g.pumpB) c.Wp += dW;
      if (p > c.pmax) { c.pmax = p; c.apmax = t1; }
      if (c.T > c.Tmax) c.Tmax = c.T;
      if (dme > 0) { c.eH += dme * c.T; c.eM += dme; }
      c.dme = dme; c.dp = (c.m * R * c.T / V1 - p);                             // variação de pressão: ruído de combustão pelo bloco
      if (c.i === 0) { const b = t1 | 0, tr = this.tr; tr.p[b] = p * 1e-5; tr.v[b] = V0 * 1e6; tr.T[b] = c.T; tr.X[b] = c.X; tr.mi[b] = dmi / dt * 1e3; tr.me[b] = dme / dt * 1e3; tr.li[b] = li; tr.le[b] = le; }
      c.V = V1;
      return (p - PAMB) * dvol(g, t1);
    }

    evo(c) { // abertura do escape: o que não queimou vai para o escape quente e pode estourar (estalos/"pipocos")
      c.closed = false;
      const p = c.m * R * c.T / c.V;
      this.event(3, Math.max(0, p / PAMB - 1) / 6, c.i);
      if (c.mf > 0 && (!c.fired || c.xb < 0.9)) {
        const u = c.fired ? 1 - c.xb : 1, hot = clamp((this.Teg - 680) / 300, 0, 1) * (this.inp.crackle || this.cut ? 1 : 0.25);
        if (this.rand() < hot) { this.event(6, Math.min(1.5, u * c.ma / this.fuel.afr * this.fuel.lhv / (this.g.vd * 2.5e6)), c.i); this.pops++; }
        c.comb = false;
      }
    }

    ivc(c, rpm, Sp) { // fechamento da admissão (2T: da janela de escape): fecha o ciclo anterior e decide combustível e avanço
      const g = this.g, E = g.E, C = g.cyc, inp = this.inp, f = this.fuel, p = c.m * R * c.T / c.V, tps = inp.tps;
      c.last = { W: c.W, Wp: c.Wp, pmax: c.pmax, apmax: c.apmax, Tmax: c.Tmax, ma: c.ma, mf: c.mf, X: c.Xivc, dth: c.dth, thd: c.thd,
        adv: c.adv, kI: c.kI, kn: c.kn, egt: c.eM > 0 ? c.eH / c.eM : 0, fired: c.fired, pw: c.pw, flt: c.flt, bnc: c.bnc, del: c.del, lam: c.lam };
      this.fmep += (1e5 * (0.5 + 0.004 * c.pmax * 1e-5 + 0.055 * Sp + 0.001 * Sp * Sp) * (g.two ? 0.7 : 1) * this.fMul - this.fmep) * 0.2; // Chen-Flynn + acessórios (2T: sem comando) × óleo
      this.pmaxL = c.pmax;
      if (c.last.egt > 0) this.Teg += (c.last.egt - this.Teg) * 0.2;
      if (c.i === 0) { const t = this.trL; this.trL = this.tr; this.tr = t; }
      Object.assign(c, { W: 0, Wp: 0, pmax: 0, Tmax: 0, eH: 0, eM: 0, I: 0, kI: 0, kn: 0, hm: 1, fired: false, comb: false, xb: 0, since: 0, dth: 0, thd: 0, closed: true, flt: 0, bnc: 0, del: 0 });
      c.pivc = p; c.Tivc = c.T; c.Vivc = c.V; c.Xivc = c.X; c.ma = c.m * (1 - c.X);
      const crank = rpm < 0.6 * g.idle, bst = (this.pab - PAMB) / 1e5, crack = inp.crackle && tps < 0.03 && rpm > g.idle + 600;
      let lam = inp.lamMode === 'manual' ? inp.lam : tps >= 0.7 ? 0.87 : tps <= 0.25 ? 1 : 1 - (tps - 0.25) / 0.45 * 0.13;
      if (inp.lamMode !== 'manual' && bst > 0.1) lam = Math.min(lam, 0.87 - 0.08 * Math.min(bst, 1.2)); // rica sob pressão
      if (crank) lam = Math.min(lam, 0.85);                                      // enriquecimento de partida
      if (crack) lam = 0.82;                                                      // mapa de estalos: combustível na desaceleração
      const q = inp.inj / 60 * f.rho * 1e-3, tc = g.injT / (6 * Math.max(rpm, 30));
      let mf = c.ma / (f.afr * lam), pw = mf / q + 5e-4;
      if (pw > 0.98 * tc) { pw = 0.98 * tc; mf = (pw - 5e-4) * q; }             // bico saturado → mistura pobre
      if (E.ffl) { const mx = E.ffl / 3600 / Math.max(1, rpm * 6 / C * g.nch); if (mf > mx) { mf = mx; pw = mf / q + 5e-4; } } // F1: fluxo ≤ 100 kg/h
      if (!inp.ign || (this.cut && inp.lim === 'fuel') || this.dfco || rpm < 50) { mf = 0; pw = 0; }
      c.mf = mf; c.pw = pw; c.lam = mf > 0 ? c.ma / (mf * f.afr) : 0;
      // evaporação do combustível rouba calor do ar: muito mais se o jato pega a válvula aberta
      const pd = pw * 6 * rpm;
      c.cool = mf > 0 ? Math.min(60, (0.15 + 0.35 * overlap(inp.eoi - pd, inp.eoi, g.ivo, g.ivc, C) / Math.max(pd, 1e-9)) * f.hvap / (1004.5 * f.afr * c.lam)) : 0;
      let adv = inp.sparkMode === 'manual' ? inp.sparkMan : this.lookup('adv', rpm, tps) + inp.sparkOff - this.kr;  // kr: atraso do sensor de detonação
      if (crank) adv = 5;
      else if (tps < 0.05 && (g.plen ? this.pp : c.ip.rp) > 0.75 * PAMB) adv = Math.min(adv, 8); // pós-partida: coletor ainda cheio com borboleta fechada
      if (crack) adv = -35;                                                       // queima tardia: termina no escape
      c.adv = adv; c.spk = (2 * C - adv) % C;
    }

    spark(c, rpm, Sp) {
      const inp = this.inp, f = this.fuel;
      if (!inp.ign || (this.cut && inp.lim !== 'off') || this.qsT > 0) return;
      if (c.mf <= 0 || c.lam < 0.45 || c.lam > 1.8 || c.fired) return;
      if (this.rand() < Math.max(0, (c.X - 0.5) * 1.5)) return;                   // falha: mistura diluída demais
      const p = c.m * R * c.T / c.V, phi = 1 / c.lam, l = c.lam;
      // chama laminar (Metghalchi-Keck) → turbulenta (u' ∝ vel. do pistão); a frente avança ~4× S_T
      const SL = Math.max(0.05, 0.305 - 0.549 * (phi - 1.21) ** 2) * f.sl * Math.pow(c.T / 298, 2.18 - 0.8 * (phi - 1))
        * Math.pow(p / PAMB, -0.16 + 0.22 * (phi - 1)) * Math.max(0.15, 1 - 2.06 * Math.pow(c.X, 0.77));
      const ST = SL + 0.82 * (0.75 * Sp * (this.g.E.tum || 1) + 0.5);             // S_T ≈ S_L + C·u' (tum: intensidade do tumble da câmara)
      c.dth = clamp(6 * rpm * this.g.flame / (4 * ST) * (1 + (0.05 + 0.6 * Math.max(0, c.X - 0.2)) * (this.rand() * 2 - 1)), 15, 160); // + variação ciclo a ciclo
      c.thd = 0.2 * c.dth;
      const H = l >= 1 ? 1 / l : 1 + 0.6 * (1 - l) - 2 * (1 - l) ** 2;           // rica: limitada pelo O₂
      c.Q = this.g.etac * c.ma / f.afr * f.lhv * H;
      c.comb = c.fired = true; c.since = 0; c.xb = 0; c.Tsp = c.T; c.psp = p;
      this.event(1, 1, c.i);
    }

    report() {
      const g = this.g, f = this.fuel, C = g.cyc, rpm = this.w * 30 / Math.PI, n = g.nch, F = g.fi;
      let W = 0, Wp = 0, ma = 0, mf = 0, pmax = 0, Tmax = 0, kI = 0, kn = 0, egt = 0, X = 0, dth = 0, thd = 0, adv = 0, pw = 0, fired = 0, rp = 0, ap = 0, flt = 0, bnc = 0, del = 0, lams = 0;
      for (const p of this.ips) rp += p.rp / this.ips.length;
      if (g.plen) rp = this.pp;
      for (const c of this.cyl) {
        const l = c.last; if (!l) continue;
        W += l.W; Wp += l.Wp; ma += l.ma; mf += l.mf; pmax = Math.max(pmax, l.pmax); Tmax = Math.max(Tmax, l.Tmax);
        kI = Math.max(kI, l.kI); kn = Math.max(kn, l.kn); egt += l.egt; X += l.X; dth += l.dth; thd += l.thd; adv += l.adv; pw += l.pw; ap += l.apmax;
        fired += l.fired ? 1 : 0; flt = Math.max(flt, l.flt); bnc += l.bnc; del += l.del; lams += l.lam;
      }
      const vd = g.vd * n, tq = W / (C * DEG) - this.fmep * g.Vf / (4 * Math.PI) - this.scT, kw = tq * this.w / 1000, cps = rpm * 6 / C;
      const fk = (g.two ? del / Math.max(lams / n, 0.6) / f.afr : mf) * cps, rho = PAMB / (R * TAMB);  // 2T: o que escapa direto também gasta
      // pressão ao longo do header (onda que vai + onda refletida) para o desenho do escape
      const ep = this.eps[0], ae = Math.sqrt(1.33 * R * 0.8 * this.Teg), dts = this.dtL || 1e-5, Lx = g.E.lex, ew = [];
      for (let i = 0; i < 24; i++) { const x = i / 23 * Lx; ew.push((rd(ep.f, this.k - x / ae / dts) + g.E.wle * (g.grp[0] ? g.grp[0].rS : -0.5) * rd(ep.f, this.k - (2 * Lx - x) / ae / dts)) / 1000); }
      return {
        rpm, kmh: this.v * 3.6, gear: this.dl.gear, tps: this.inp.tps, map: rp / 1000, starter: this.inp.starter, w: this.w, ww: this.ww, clutch: this.inp.clutch,
        slip: Math.abs(this.ww * g.veh.wheel - this.v) * 3.6, dl: this.dl.state(),
        lam: mf > 0 ? ma / (mf * f.afr) : 0, afr: mf > 0 ? ma / mf : 0, pw: pw / n * 1000, duty: pw / n * 6 * rpm / g.injT * 100,
        adv: adv / n, mbt: this.ecu ? this.lookup('mbt', rpm, this.inp.tps) : 0, kI, kn,
        pmax: pmax / 1e5, apmax: ap / n, Tmax, egt: (this.fixed || !this.egtD ? (egt > 0 ? egt / n : this.Teg) : this.egtD) - 273, xres: X / n * 100, dth: dth / n, thd: thd / n,
        imep: W / vd / 1e5, pmep: -Wp / vd / 1e5, fmep: this.fmep / 1e5, bmep: (W / vd - this.fmep * g.Vf / vd) / 1e5,
        tq, kw, cv: kw * 1.35962, ve: ma / n / (rho * g.vd) * 100, mair: ma / n * 1e6, mfuel: mf / n * 1e6,
        lph: fk * 3600 / f.rho, bsfc: kw > 1 ? fk * 3.6e6 / kw : 0, eta: kw > 0 && fk > 0 ? kw * 1000 / (fk * f.lhv) * 100 : 0,
        th: this.th, fired, cut: this.cut, ign: this.inp.ign, limit: g.limit, vvt: this.vvt, flt: flt * 1000, bnc, floatRpm: g.floatRpm || 0,
        dr: g.two ? del / n / (rho * g.vd) * 100 : 0, te: g.two && del > 0 ? Math.min(100, ma / del * 100) : 0, pops: this.pops,  // TE>100: carga retida de ciclo falhado ("4 tempos")
        heat: this.therm.report(), kr: this.kr, Tamb: this.Tamb - 273.15,   // (th = ângulo do virabrequim)
        fi: F ? F.type : 'na', boost: (this.pab - PAMB) / 1000, Tab: this.Tab - 273, T2: this.T2 - 273, PR: this.PR, mc: this.mc || 0,
        trpm: F ? (F.type === 'sc' ? this.w * F.ratio : this.wt) * 30 / Math.PI : 0, pt: this.pexM / 1000, wg: this.wgE * 100,
        Pc: this.Pc / 1000, scKw: this.scT * this.w / 1000, bov: this.bov, ers: this.ersP / 1000, soc: this.soc / 4e4, ew,
      };
    }
  }

  // regime permanente a rotação fixa (dinamômetro de freio) — passo em graus
  function steady(eng, rpm, tps, cycles, deg) {
    eng.fixed = true; eng.w = rpm * Math.PI / 30; eng.inp.tps = tps; eng.inp.ign = true;
    const dt = deg * DEG / eng.w;
    for (let i = 0, n = Math.round(cycles * eng.g.cyc / deg); i < n; i++) eng.step(dt);
    return eng.report();
  }
  function dyno(cfg, ecu, inp, fuel) {
    const eng = new Engine(cfg), lim = eng.g.limit, st = Math.max(100, Math.round(lim / 60 / 50) * 50), r0 = Math.max(1000, Math.round(lim * 0.15 / st) * st);
    Object.assign(eng.inp, inp, { starter: false, crackle: false }); eng.ecu = ecu; eng.setFuel(fuel);
    const out = [];
    steady(eng, r0, 1, eng.g.fi ? 10 : 4, 0.5);
    for (let r = r0; r <= lim; r += st) { const s = steady(eng, r, 1, 3, 0.5); out.push({ rpm: r, tq: s.tq, cv: s.cv, kn: s.kn, lam: s.lam, boost: s.boost }); }
    return out;
  }
  // "Dyno de calibração": por célula rpm × borboleta acha o MBT (50% queimado logo após o PMS)
  // e atrasa até a integral de detonação ficar < 0,8 com o combustível escolhido.
  function* calibrate(cfg, fuel, inp) {
    const g = build(cfg), rpm = [], tps = [0, 0.02, 0.05, 0.1, 0.2, 0.35, 0.6, 1], N = tps.length, stp = g.limit > 10000 ? 1000 : 500;
    for (let r = 1000; r < g.limit + stp; r += stp) rpm.push(r);
    const adv = new Float32Array(rpm.length * N), mbt = new Float32Array(rpm.length * N);
    const eng = new Engine(cfg);
    Object.assign(eng.inp, inp, { sparkMode: 'manual', starter: false, crackle: false }); eng.setFuel(fuel); eng.noCut = true;
    const run = (r, t, a, cyc) => { eng.inp.sparkMan = a; return steady(eng, r, t, cyc, 1); };
    for (let i = 0; i < rpm.length; i++) {
      for (let j = 0; j < N; j++) {
        let a = 25, s;
        for (let it = 0; it < 3; it++) { s = run(rpm[i], tps[j], a, it ? 2 : 3); if (!s.fired) break; a = clamp(0.517 * s.dth + s.thd - g.mbt50, -5, 60); }
        const m = a;
        if (run(rpm[i], tps[j], a, 2).kI > 0.8) {
          let lo = m - 35, hi = m;
          for (let it = 0; it < 6; it++) { const mid = (lo + hi) / 2; if (run(rpm[i], tps[j], mid, 2).kI > 0.8) hi = mid; else lo = mid; }
          a = lo;
        }
        mbt[i * N + j] = m; adv[i * N + j] = a;
      }
      yield (i + 1) / rpm.length;
    }
    return { rpm, tps, adv, mbt, fuel };
  }

  return { ENGINES, PRESETS: CAT.PRESETS, FUELS, EXH, TRANS: CAT.TRANS, PORTS, DEG, DRV, TH, build, vol, Engine, steady, dyno, calibrate };
}
const EngineLib = ENGINE_LIB();
if (typeof module !== 'undefined') module.exports = EngineLib;
