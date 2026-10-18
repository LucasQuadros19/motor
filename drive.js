// Transmissões e veículo: sequencial (moto/corrida), manual de carro (H), automático de 8 marchas
// com 4 trens planetários + conversor de torque, e CVT (polias variáveis). Inclui pneu com
// escorregamento, arrasto, sustentação negativa (F1) e freio. Função serializável (AudioWorklet).
function DRIVE_LIB() {
  'use strict';
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

  // Automático de 8 marchas (arranjo do ZF 8HP, reconstruído resolvendo as 8 relações publicadas):
  // entrada = portador P2; solares S1=S2 (freio A); coroa R1 (freio B); portador P1 = coroa R4;
  // coroa R2 = solar S3; portadores P3 = P4 = saída. Embreagens: C liga S4 à entrada, D liga R3 a S4,
  // E liga S4 a R2. Cada marcha fecha 3 dos 5 elementos.
  const ZF = { S: [48, 48, 69, 23], R: [96, 96, 111, 85], shift: ['ABD', 'ABC', 'ABE', 'BCE', 'BDE', 'BCD', 'CDE', 'ACD', 'ADE'],
    names: ['S1', 'P1', 'R1', 'S2', 'P2', 'R2', 'S3', 'P3', 'R3', 'S4', 'P4', 'R4'] };
  const mb = (t, k) => k * 3 + 'SCR'.indexOf(t);
  const PERM = [[mb('S', 0), mb('S', 1)], [mb('C', 0), mb('R', 3)], [mb('R', 1), mb('S', 2)], [mb('C', 2), mb('C', 3)]];
  const ELEM = { A: { b: mb('S', 0) }, B: { b: mb('R', 0) }, C: { c: [mb('S', 3), mb('C', 1)] }, D: { c: [mb('R', 2), mb('S', 3)] }, E: { c: [mb('S', 3), mb('R', 1)] } };
  const IN = mb('C', 1), OUT = mb('C', 3);
  // velocidades dos 12 membros (S,P,R de cada trem) na marcha gi (0 = ré, 1..8) para entrada win
  function zf(gi, win) {
    const par = Array.from({ length: 12 }, (_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i])), u = (a, b) => { par[f(a)] = f(b); };
    for (const g of PERM) u(g[0], g[1]);
    const br = [];
    for (const ch of ZF.shift[gi]) { const e = ELEM[ch]; if (e.b !== undefined) br.push(e.b); else u(e.c[0], e.c[1]); }
    const roots = [...new Set(par.map((_, i) => f(i)))], ix = {}; roots.forEach((r, i) => { ix[r] = i; });
    const n = roots.length, rows = [], rhs = [];
    for (let k = 0; k < 4; k++) { const r = new Array(n).fill(0); r[ix[f(mb('S', k))]] += ZF.S[k]; r[ix[f(mb('R', k))]] += ZF.R[k]; r[ix[f(mb('C', k))]] -= ZF.S[k] + ZF.R[k]; rows.push(r); rhs.push(0); }
    for (const b of br) { const r = new Array(n).fill(0); r[ix[f(b)]] = 1; rows.push(r); rhs.push(0); }
    const r = new Array(n).fill(0); r[ix[f(IN)]] = 1; rows.push(r); rhs.push(win);
    const M = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    rows.forEach((row, i) => { for (let a = 0; a < n; a++) { for (let b = 0; b < n; b++) M[a][b] += row[a] * row[b]; M[a][n] += row[a] * rhs[i]; } });
    for (let c = 0; c < n; c++) {
      let p = c; for (let q = c + 1; q < n; q++) if (Math.abs(M[q][c]) > Math.abs(M[p][c])) p = q;
      [M[c], M[p]] = [M[p], M[c]];
      for (let q = 0; q < n; q++) if (q !== c) { const k = M[q][c] / M[c][c]; for (let j = c; j <= n; j++) M[q][j] -= k * M[c][j]; }
    }
    return par.map((_, i) => M[ix[f(i)]][n] / M[ix[f(i)]][ix[f(i)]]);
  }
  const ZF_R = ZF.shift.map((_, gi) => 1 / zf(gi, 1)[OUT]); // [ré, 1ª..8ª]

  class Driveline {
    constructor(veh, type, P) { // P: { idle, limit, peak, Tmax }
      const V = this.veh = veh;
      this.type = type; this.P = P; this.gear = 0; this.mode = 'D'; this.ww = 0; this.v = 0; this.time = 0;
      this.shT = 0; this.pend = 0; this.last = -9; this.lock = 0; this.sr = 0; this.Tc = 0; this.Tw = 0; this.Pslip = 0; this.Esh = 0; this.acc = 0;
      const gs = V.gears || [1], top = (V.primary || 1) * gs[gs.length - 1] * (V.final || 1);
      this.final = type === 'auto8' ? top / ZF_R[8] : V.final * V.primary;          // auto: mesma relação final em 8ª
      this.gears = type === 'auto8' ? ZF_R.slice(1) : gs;
      this.rMax = (V.primary || 1) * gs[0] * (V.final || 1) * 1.05; this.rMin = top * 0.85; this.r = this.rMax;  // CVT
      this.cp = (P.Tmax || 100) / Math.pow(2400 * Math.PI / 30, 2);                 // conversor: estol ~2.400 rpm
      this.rev = V.car && type !== 'seq' ? V.rev || 3.4 : 0;                         // relação da ré (caixa manual: engrenagem intermediária)
      if (type === 'prop') { // hélice de passo fixo: absorve ~95% da potência nominal na rotação de potência máxima (P = kq·ω³)
        const red = V.red || 1, wp = (P.peak || P.limit) * Math.PI / 30 * red;
        this.kq = 0.95 * (P.Prated || 1e5) / Math.pow(wp, 3); this.gear = 1; this.vAir = 0; this.thrust = 0; this.wp = 0;
      }
    }
    ratio() { // motor → roda (negativa na ré)
      const g = this.gear;
      if (this.type === 'prop') return 1 / (this.veh.red || 1);
      if (!g) return 0;
      if (g < 0) return this.type === 'auto8' ? ZF_R[0] * this.final : this.type === 'cvt' ? -this.rMax : -this.rev * this.final;
      return this.type === 'cvt' ? this.r : this.gears[g - 1] * this.final;
    }
    shift(d) { // ré: só parado e a partir do neutro (carros; motos não têm)
      if (this.type === 'prop') return false;                                      // hélice: sem marchas
      const n = this.type === 'cvt' ? 1 : this.gears.length, cur = this.pend || this.gear;
      let ng = cur + d;
      if (ng < 0) { if (!this.rev || cur !== 0 || Math.abs(this.v) > 1.5) return false; ng = -1; }
      if (cur < 0 && d > 0) ng = 0;
      ng = Math.min(ng, n);
      if (ng === this.gear && !this.pend) return false;
      if (this.type === 'auto8' && cur > 0 && d) this.mode = 'M';
      if (this.type === 'auto8' && this.gear > 0 && ng > 0) this.go(ng);
      else { this.setGear(ng); this.pend = 0; this.shT = 0; if (ng <= 0) this.mode = 'D'; }
      return true;
    }
    setGear(ng) { // energia que o sincronizador/embreagem dissipa para igualar as velocidades do eixo de entrada
      const r0 = this.ratio(); this.gear = ng; const dw = this.ww * (this.ratio() - r0);
      if (r0 && this.gear) this.Esh += 0.5 * (this.veh.car ? 0.03 : 0.012) * dw * dw;
    }
    go(g) { this.pend = g; this.shT = 0.28; this.last = this.time; }
    step(dt, w, rpm, inp) {
      const V = this.veh, P = this.P, t = this.type;
      this.time += dt;
      if (t === 'prop') { // hélice: torque ∝ ω² e cai com o avanço (J = v/nD); empuxo pela teoria do momento
        const red = V.red || 1, wp = w * red, n = wp / (2 * Math.PI), D = V.propD || 2, A = Math.PI * D * D / 4, rho = 1.2;
        const J = this.v / Math.max(0.5, n * D), cpJ = clamp(1 - (J / 1.1) ** 2, 0.15, 1);
        const Tp = this.kq * wp * Math.abs(wp) * cpJ, Pabs = Math.max(0, Tp * wp);
        const Tst = Math.cbrt(2 * rho * A * Math.pow(0.75 * Pabs, 2));                  // empuxo estático
        const thrust = this.thrust = Pabs > 0 ? Math.min(Tst, 0.82 * Pabs / Math.max(this.v, 1)) : 0;
        const a = (thrust - 0.6 * V.cda * this.v * this.v - (this.v < 30 ? V.crr * V.mass * 9.81 : 0) - inp.brake * 0.4 * V.mass * 9.81 * (this.v > 0.1 ? 1 : 0)) / V.mass;
        this.v = Math.max(0, this.v + a * dt); this.acc += (a - this.acc) * Math.min(1, dt / 0.2);
        this.vAir = Math.sqrt(this.v * this.v + 2 * thrust / (rho * A));                   // vento da hélice (esfria os cilindros)
        this.wp = wp; this.ww = wp; this.Tc = Tp * red; this.Tw = thrust; this.Pslip = 0;
        return Tp * red;
      }
      if (t === 'auto8') { // troca: metade do tempo enchendo o novo elemento, conversor destravado
        if (this.shT > 0) { this.shT -= dt; if (this.shT < 0.14 && this.pend) { this.setGear(this.pend); this.pend = 0; } }
        else if (this.mode === 'D' && this.gear > 0 && this.time - this.last > 0.7) {
          const g = this.gear, rs = this.gears, at = k => rpm * rs[k - 1] / rs[g - 1];
          const up = P.idle + 900 + Math.pow(inp.tps, 1.3) * (P.limit * 0.97 - P.idle - 900);
          const dn = P.idle * 1.3 + inp.tps * inp.tps * (P.limit * 0.55 - P.idle);
          if (g < 8 && rpm > up && at(g + 1) > P.idle * 1.3) this.go(g + 1);
          else if (g > 1 && rpm < dn && at(g - 1) < P.limit * 0.9) this.go(g - 1);
        }
      }
      if (t === 'cvt' && this.gear > 0) { // controle da CVT: segura o motor na rotação alvo (alta no acelerador cheio)
        const tgt = P.idle * 1.5 + Math.pow(inp.tps, 1.1) * (Math.min(P.peak, P.limit * 0.93) - P.idle * 1.5);
        this.r = clamp(this.r * (1 - (rpm - tgt) / tgt * dt * 3), this.rMin, this.rMax);
      }
      const r = this.ratio(), wt = this.ww * r;
      let Tl = 0, Tw = 0, slip = false;
      if (r !== 0) {
        if (t === 'seq' || t === 'manual' || (t === 'cvt' && !V.car)) {
          let cl = inp.clutch;
          if ((V.race || (t === 'cvt' && !V.car)) && Math.abs(this.v) < 4) // embreagem automática de largada (centrífuga / F1)
            cl = Math.max(cl, 1 - clamp((rpm - 1.4 * P.idle) / ((V.race ? 0.55 : 0.45) * P.limit - 1.4 * P.idle), 0, 1));
          const cap = V.clutch * (1 - cl) ** 2;
          Tl = Tw = clamp(0.14 * V.clutch * (w - wt), -cap, cap);
          slip = cl > 0.02 || Math.abs(Tl) > 0.97 * cap;                                // fechada e sem chegar no limite = colada (sem calor)
        } else { // conversor de torque + embreagem de travamento
          const want = t === 'auto8' ? this.gear >= 2 && this.shT <= 0 && this.v > 8 && inp.tps < 0.95 : this.v > 6;
          this.lock += ((want ? 1 : 0) - this.lock) * Math.min(1, dt / 0.25);
          const sr = this.sr = wt / Math.max(w, 1), Tp = this.cp * (w - wt) * Math.max(Math.abs(w), Math.abs(wt));
          const TR = sr >= 0 && sr < 0.85 ? 2 - sr / 0.85 : 1, cap = V.clutch * this.lock;
          const Tlu = clamp(0.14 * V.clutch * (w - wt), -cap, cap);
          Tl = Tp + Tlu; Tw = Tp * TR + Tlu; slip = true;
          if (this.shT > 0) Tw *= 0.6;                                               // alívio de torque na troca
        }
      }
      this.Tc = Tl; this.Tw = Tw * r; this.Pslip = slip ? Math.abs(Tl * (w - wt)) : 0; // calor no disco / conversor
      // roda motriz, pneu (escorregamento), arrasto, sustentação negativa, freio
      const Rw = V.wheel, dn = 0.6 * (V.cla || 0) * this.v * this.v, g9 = V.mass * 9.81;
      const Fmax = (V.race ? 1.0 : V.car ? 0.8 : 1.0) * g9 + (V.race ? 0.9 : 0.5) * dn;
      const Ft = clamp(8000 * (this.ww * Rw - this.v), -Fmax * 1.15, Fmax * 1.15), sw = Math.sign(this.ww), sv = Math.sign(this.v);
      const Tb = Math.abs(this.ww) > 0.1 ? sw * inp.brake * (V.race ? 1.6 * (g9 + dn) : (V.car ? 0.95 : 1.1) * g9) * Rw : 0;
      this.ww += (this.Tw * 0.95 - Ft * Rw - Tb) / (V.car ? 2.5 : 1) * dt;
      if (inp.brake > 0.5 && Math.abs(this.ww) <= 0.1) this.ww *= 0.5;          // freio segura a roda parada
      const a = (Ft - 0.6 * V.cda * this.v * Math.abs(this.v) - (Math.abs(this.v) > 0.05 ? sv * V.crr * g9 : 0)) / V.mass;
      this.v += a * dt; this.acc += (a - this.acc) * Math.min(1, dt / 0.2);
      return Tl;
    }
    state() {
      const r = this.ratio(), V = this.veh;
      return { type: this.type, gear: this.gear, mode: this.mode, r, lock: this.lock, sr: this.sr, shift: this.shT > 0, pend: this.pend, rev: this.rev, thrust: this.thrust || 0, vAir: this.vAir || 0,
        wIn: this.ww * r / (this.type === 'seq' || this.type === 'manual' ? V.primary : 1),   // eixo de entrada do câmbio
        wOut: this.ww * (this.type === 'auto8' ? this.final : V.final), cvt: this.r, Tw: this.Tw };
    }
  }

  return { ZF, zf, ZF_R, Driveline };
}
if (typeof module !== 'undefined') module.exports = DRIVE_LIB;
