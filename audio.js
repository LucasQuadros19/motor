// Som gerado pela simulação, que roda dentro do AudioWorklet. Um único relógio:
// `ts` (escala de tempo) desacelera a física inteira — em câmera lenta você ouve cada evento
// no instante em que acontece no motor (faísca, explosão, abertura do escape, estalo, quique de válvula).
// Tempo real: soma de fontes físicas, cada uma filtrada pelo caminho por onde o som passa:
//  • escape: onda de pressão do header → catalisador → ressonador (anti-ronco) → abafador (câmaras)
//    → ponteira (ressonância de 1/4 de onda) → radiação (derivada); sem abafador a onda se
//    "empina" (não linear) e o som fica rasgado; turbina come parte dos pulsos;
//  • estalos/pipocos: queima no escape injetada ANTES do abafador (abafado no original, tiro no reto);
//  • admissão: onda do duto + chiado proporcional à vazão instantânea;
//  • bloco: dp/dt da combustão filtrado pela estrutura (passa-alta + modos do bloco);
//  • mecânico: tique das válvulas, quique (flutuação), engrenagens do câmbio (dente reto em corrida),
//    corrente/correia da CVT, motor de arranque (induzido + pinhão/cremalheira), MGU-K (F1);
//  • turbo (assobio + ruído de pás), supercharger, blow-off.
function SYNTH_LIB(L) {
  // biquad (RBJ): lp, bp, notch, hp
  function BQ(type, f, Q, sr) {
    const w = 2 * Math.PI * Math.min(f, 0.45 * sr) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
    else { b0 = 1; b1 = -2 * c; b2 = 1; }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * c / a0, a2: (1 - al) / a0, z1: 0, z2: 0 };
  }
  const run = (q, x) => { const y = q.b0 * x + q.z1; q.z1 = q.b1 * x - q.a1 * y + q.z2; q.z2 = q.b2 * x - q.a2 * y; return y; };
  const TAU = 2 * Math.PI;

  return class Synth {
    constructor(sr) {
      this.sr = sr; this.dtP = 1 / (2 * sr); this.cpuT = 0; this.cpuN = 0; this.load = 0; this.eng = null; this.vol = 0.8; this.ts = 1; this.acc = 0; this.simAcc = 0;
      this.tp = new Float32Array(4096); this.ti = 0; this.yp = 0; this.ip = 0; this.i1 = 0;
      this.env = 0; this.pk = 0; this.nz = 22222; this.evR = 0; this.fPrev = 0; this.q = 0; this.wn = 0; this.wn2 = 0;
      this.kA = 0; this.kPh = 0; this.sPh = 0; this.sPh2 = 0; this.tPh = 0; this.gPh = 0; this.ePh = 0; this.bovA = 0; this.pop = 0; this.bS = 0;
      this.vo = Array.from({ length: 32 }, () => ({ on: false, type: 0, t: 0, amp: 0, e1: 0, e2: 0, e3: 0, f1: 0, f2: 0, n: 0, n2: 0, k: 0, rt: false }));
      this.xa = 1; this.rEx = 1; this.rIn = 1; this.pPh = 0; this.rv = new Float32Array(8192); this.ri = 0; this.rl = 0;
      this.mon = null; // node: medição das fontes (calibração do mix)
    }
    msg(d) {
      if (d.cfg) { this.eng = new L.Engine(d.cfg); this.evR = 0; this.fPrev = 0; this.env = 20; this.setup(); }
      const e = this.eng;
      if (d.vol !== undefined) this.vol = d.vol;
      if (d.ts !== undefined) this.ts = d.ts;
      if (!e) return;
      if (d.ecu) e.ecu = d.ecu;
      if (d.fuel) e.setFuel(d.fuel);
      if (d.inp) { const ex = e.inp.exh; Object.assign(e.inp, d.inp); if (e.inp.exh !== ex) this.setup(); }
      if (d.shift) e.shift(d.shift);
      if (d.mode) e.dl.mode = d.mode;
      if (d.rebuild) e.therm.reset(e.inp);                                     // remontar: peças novas, temperaturas do início
    }
    setup() { // filtros do caminho do som para este motor/escape
      const e = this.eng, sr = this.sr, X = L.EXH[e.inp.exh] || L.EXH.stock, B = e.g.B, tur = e.g.fi && e.g.fi.type === 'turbo';
      this.X = X;
      this.fCat = BQ('lp', 3800, 0.6, sr);
      this.fRes = BQ('notch', 135, 1.1, sr); this.fRes2 = BQ('lp', 2600, 0.6, sr);
      this.fM = [BQ('lp', X.fc, 0.75, sr), BQ('lp', X.fc * 1.6, 0.6, sr), BQ('lp', X.fc * 0.8, 0.7, sr), BQ('lp', X.fc * 1.3, 0.6, sr)];
      this.fT = BQ('lp', 1400, 0.7, sr); this.tur = tur;
      this.D = Math.round(sr * (X.muff ? 0.9 : 0.6) / 520);                    // ponteira: atraso de ida e volta
      this.fB = [BQ('hp', 900, 0.5, sr), BQ('lp', 5000, 0.5, sr)];               // bloco: banda larga, sem ressonância (ressonância = "apito")
      this.fI = BQ('lp', 320, 0.7, sr); this.fW = BQ('bp', 900, 0.8, sr);
      this.fCk = BQ('hp', 2500, 0.5, sr); this.fTk = BQ('bp', 2000, 0.9, sr);
      this.fTb = BQ('bp', 3000, 8, sr); this.fBo = BQ('bp', 2400, 1.2, sr); this.fP = BQ('lp', 1800, 0.7, sr);
      this.fPr = BQ('bp', 700, 0.6, sr); this.fAb = BQ('bp', 420, 0.8, sr);       // hélice: vórtices da ponta; F1: ronco da caixa de ar
      this.fk = 1.84 * 900 / (Math.PI * B);                                       // modo acústico da câmara (detonação)
      this.fKn = BQ('bp', this.fk, 2.5, sr);                                       // excitado por ruído: "tlec" curto, não apito
    }
    noise() { let x = this.nz; x ^= x << 13; x ^= x >> 17; x ^= x << 5; this.nz = x; return x / 2147483648; }
    spawn(type, amp, rt) {
      const v = this.vo.find(o => !o.on) || this.vo[0], e = this.eng, sr = this.sr, VfL = e.g.Vf * 1000;
      v.on = true; v.type = type; v.t = 0; v.amp = amp; v.e1 = v.e2 = v.e3 = 1; v.n = v.n2 = 0; v.rt = rt;
      // k: polo do filtro de ruído (frequência de corte); d1/d3: decaimento por amostra (corpo / estalo)
      if (type === 2) { v.k = 1 - Math.exp(-TAU * (90 + 140 * Math.pow(0.675 / VfL, 0.25)) / sr); v.f1 = Math.exp(-1 / (0.07 * sr)); v.f2 = Math.exp(-1 / (0.004 * sr)); }
      if (type === 3) { v.k = 1 - Math.exp(-TAU * Math.min(this.X.fc, 2500) / sr); v.f1 = Math.exp(-1 / (0.045 * sr)); }
      if (type === 6) { v.k = 1 - Math.exp(-TAU * (this.X.muff ? 900 : 3000) / sr); v.f1 = Math.exp(-1 / (0.03 * sr)); v.f2 = Math.exp(-1 / (0.006 * sr)); }
    }
    voice(v, sr) {
      v.t++;
      let s = 0;
      if (v.type === 1) { // faísca
        s = v.amp * 160 * this.noise() * v.e1; v.e1 *= 0.97;
        if (v.e1 < 1e-3) v.on = false;
      } else if (v.type === 2) { // explosão: estrondo grave (ruído filtrado, sem tom puro) + estalo curto
        const n = this.noise(); v.n += (n - v.n) * v.k; v.n2 += (v.n - v.n2) * v.k;
        s = v.amp * (6000 * v.n2 * v.e1 * (1 - v.e2) + 260 * n * v.e2);       // (1 − e2): ataque de ~4 ms
        v.e1 *= v.f1; v.e2 *= v.f2;
        if (v.e1 < 2e-3) v.on = false;
      } else if (v.type === 3) { // sopro do escape: ruído pelo abafador
        v.n += (this.noise() - v.n) * v.k; v.n2 += (v.n - v.n2) * v.k;
        s = v.amp * 1100 * v.n2 * v.e1 * Math.min(1, v.t / (0.003 * sr)); v.e1 *= v.f1;
        if (v.e1 < 2e-3) v.on = false;
      } else if (v.type === 6) { // estalo no escape: pressão da queima tardia (vai para o caminho do escape)
        const n = this.noise(); v.n += (n - v.n) * v.k; v.n2 += (v.n - v.n2) * 0.02;
        s = v.amp * (v.n * 2.2 * v.e2 + v.n2 * 14 * v.e1);
        v.e1 *= v.f1; v.e2 *= v.f2;
        if (v.e1 < 2e-3) v.on = false;
      } else if (v.type === 7) { // quique da válvula na sede (flutuação): clique metálico curto
        s = v.amp * this.noise() * v.e1; v.e1 *= 0.93;
        if (v.e1 < 1e-3) v.on = false;
      }
      return s;
    }
    render(out) { // preenche out; devolve true quando é hora de mandar um relatório (~30 Hz)
      const e = this.eng, sr = this.sr, t0 = Date.now();
      if (!e) { out.fill(0); return false; }
      const X = this.X, ts = this.ts, rt = ts > 0.99, g0 = e.g, F = g0.fi, dl = e.dl, mon = this.mon;
      const qRef = 1.18 * g0.Vf * g0.limit / 120, kq = 1 - Math.exp(-TAU * 120 / sr);
      // parâmetros que mudam devagar: calculados uma vez por bloco
      const w = Math.max(0, e.w), V = dl.veh, race = V.race, Tm = dl.P.Tmax || 100;
      let fG = 0, aG = 0;
      if (dl.type === 'cvt') { const u = (dl.rMax - dl.r) / Math.max(1e-6, dl.rMax - dl.rMin), rp = 0.03 + 0.04 * u; fG = w * rp / 0.0018 / TAU; aG = V.car ? 0.5 : 0; }
      else if (dl.type === 'prop') { if ((V.red || 1) < 1) { fG = w * 22 / TAU; aG = 0.3; } }           // avião: só o zunido da redução
      else if (dl.gear) { const tooth = 13 + 3 * dl.gear; fG = w / (V.car ? 1 : V.primary) * tooth / TAU; aG = (race ? 3 : dl.type === 'auto8' ? 0.35 : 0.6); }
      aG *= 0.15 + Math.min(1.2, Math.abs(dl.Tc) / Tm);
      const fE = w * 3.3 * 8 / TAU, aE = F ? 0 : Math.min(1, Math.abs(e.ersP || 0) / 120e3);  // MGU-K
      const fS = (w * 11 * 18) / TAU + 40, fS2 = w * 9.5 / TAU;                    // arranque: comutador e pinhão
      // hélice: tom da passagem das pás (BPF = nº de pás × rotação); quanto mais perto de Mach 1 na ponta, mais harmônicos
      let pF = 0, pA = 0, pP = 2;
      if (dl.type === 'prop') { const np = w * (V.red || 1) / TAU, Mt = Math.PI * (V.propD || 2) * np / 340, load = Math.min(1.5, (dl.thrust || 0) / (0.25 * V.mass * 9.81 + 1));
        pF = (V.blades || 2) * np; pA = (0.15 + load) * (0.2 + 2 * Mt * Mt); pP = 2.4 - 1.8 * Math.min(1, Mt); }
      const abox = V.car && race ? 0.3 : 0;                                       // F1: o piloto fica logo à frente da caixa de ar
      const ft = F ? (F.type === 'sc' ? w * F.ratio * 1.5 : e.wt * 2.5) / TAU : 0, aT = F ? Math.min(1.5, Math.max(0, e.PR - 1)) : 0;
      for (let i = 0; i < out.length; i++) {
        this.simAcc += ts / sr;
        let bS = 0, eS = 0, iS = 0, nS = 0;
        while (this.simAcc >= this.dtP * 0.999) { e.step(this.dtP); bS += e.sndB; eS += e.sndE; iS += e.sndI; nS++; this.simAcc -= this.dtP; }
        if (nS) { eS /= nS; iS /= nS; } else { eS = e.sndE; iS = e.sndI; }  // média dos sub-passos = filtro anti-serrilhado
        // eventos do motor → vozes
        if (e.evN - this.evR > 64) this.evR = e.evN - 64;
        while (this.evR < e.evN) {
          const k = (this.evR % 64) * 3, type = e.ev[k], amp = Math.min(1.5, e.ev[k + 1]);
          this.evR++;
          if (type === 4) this.kA = Math.min(3000, this.kA + 1000 * amp);
          else if (type === 5) this.bovA = Math.min(1.5, amp);
          else if (type === 6) this.spawn(6, rt ? 9e3 * amp : 600 * Math.sqrt(amp), rt);
          else if (type === 7) this.spawn(7, rt ? 40 * amp : 200 * Math.sqrt(amp), rt);
          else if (!rt) this.spawn(type, Math.sqrt(amp), rt);                      // câmera lenta: comprime a dinâmica                               // câmera lenta: comprime a dinâmica
        }
        let s = 0, sEx = 0, sIn = 0, sBl = 0, sMe = 0, sTu = 0, pop = 0, mech = 0;
        for (const v of this.vo) if (v.on) { const y = this.voice(v, sr); if (v.type === 6 && v.rt) pop += y; else if (v.rt) mech += y; else s += y; }
        if (rt) {
          // escape: header → (turbina) → cat → ressonador → abafador → ponteira → radiação
          // turbulência do jato: ruído que pulsa junto com cada pulso de pressão (passa pelo mesmo abafador)
          let x = eS + run(this.fP, pop) + this.noise() * Math.max(0, eS) * 0.12;
          if (this.tur) x = 0.55 * run(this.fT, x) + 0.15 * x;
          if (X.cat) x = 0.85 * run(this.fCat, x);
          if (X.res) x = run(this.fRes2, run(this.fRes, x));
          for (let m = 0; m < X.muff; m++) x = run(this.fM[2 * m + 1], run(this.fM[2 * m], x)) * 0.8;
          this.xa += (Math.abs(x) - this.xa) * 2e-4;                                // nível típico do pulso (para a distorção não depender do tamanho do motor)
          if (!X.muff) x += (X.cat ? 0.35 : 0.6) * x * Math.abs(x) / Math.max(3 * this.xa, 1e-3);   // onda empinada (sem miolo): mais forte nos picos
          const y = x - 0.6 * X.fb * this.tp[(this.ti - this.D) & 4095]; this.tp[this.ti++ & 4095] = y;
          sEx = (y - this.yp) * X.g; this.yp = y;
          // admissão: onda do duto + chiado da vazão instantânea
          this.i1 = run(this.fI, iS); sIn = (this.i1 - this.ip) * (V.car ? 0.15 : 0.25); this.ip = this.i1;
          this.q += ((e.fIn - this.fPrev) / (ts / sr) / qRef - this.q) * kq; this.fPrev = e.fIn;
          sIn += run(this.fW, this.noise()) * Math.min(1.5, Math.max(0, this.q)) * 10;
          this.rEx += (Math.abs(sEx) - this.rEx) * 1e-4; this.rIn += (Math.abs(sIn) - this.rIn) * 1e-4;
          if (abox) sIn = sIn * Math.min(400, Math.max(1, abox * this.rEx / Math.max(this.rIn, 1e-6))) + run(this.fAb, this.noise()) * abox * this.rEx * Math.min(1.5, Math.max(0, this.q));  // ouvinte junto à admissão
          // bloco: dp/dt da combustão pela estrutura
          sBl = run(this.fB[1], run(this.fB[0], bS)) * 3e-4 * (g0.two ? 1.4 : 1);
          // mecânico: tiques/quiques + engrenagens + MGU-K
          sMe = run(this.fCk, mech);
          if (aG > 0) { this.gPh = (this.gPh + Math.min(fG, 0.45 * sr) / sr) % 1; sMe += Math.sin(TAU * this.gPh) * 4 * aG; }
          if (aE > 0) { this.ePh = (this.ePh + Math.min(fE, 0.45 * sr) / sr) % 1; sMe += Math.sin(TAU * this.ePh) * 25 * aE; }
          if (pF > 0) { // hélice
            this.pPh = (this.pPh + Math.min(pF, 0.45 * sr) / sr) % 1; let h = 0;
            for (let k = 1; k <= 8; k++) h += Math.sin(TAU * k * this.pPh) / Math.pow(k, pP);
            sMe += (h + run(this.fPr, this.noise()) * 0.8) * pA * this.rEx;
          }
          s += sEx + sIn + sBl + sMe;
        } else this.fPrev = e.fIn;
        if (this.kA > 1) { s += run(this.fKn, this.noise()) * this.kA * 2.5; this.kA *= 0.9945; }   // detonação: ~4 ms de chiado metálico
        if (this.bovA > 0.01) { s += run(this.fBo, this.noise()) * 2500 * this.bovA; this.bovA *= 0.99992; }
        if (F && aT > 0) { // turbo: assobio (pás) + chiado de ar no rotor; supercharger: zunido
          this.tPh = (this.tPh + Math.min(ft, 0.45 * sr) / sr) % 1;
          const fl = Math.min(1, Math.max(0, this.q) * 1.5 + 0.15);
          sTu = (Math.sin(TAU * this.tPh) * (F.type === 'sc' ? 40 : 22) + (F.type === 'sc' ? 0 : run(this.fTb, this.noise()) * 160)) * aT * fl;
          s += sTu;
        }
        if (e.inp.starter) { // induzido zunindo + pinhão batendo na cremalheira (velocidade real do virabrequim)
          this.sPh = (this.sPh + Math.min(fS, 0.45 * sr) / sr) % 1; this.sPh2 = (this.sPh2 + fS2 / sr) % 1;
          s += (Math.sin(TAU * this.sPh) * 0.12 + run(this.fTk, this.noise()) * 1.6 + (this.sPh2 < 0.08 ? 0.8 : 0)) * 10;
        }
        // reflexões no chão e em paredes próximas (atrasos curtos, perdem os agudos): som menos "seco"
        this.rv[this.ri & 8191] = s; this.rl += (this.rv[(this.ri - (sr * 0.0061 | 0)) & 8191] * 0.3 + this.rv[(this.ri - (sr * 0.0117 | 0)) & 8191] * 0.18 + this.rv[(this.ri - (sr * 0.019 | 0)) & 8191] * 0.12 + this.rv[(this.ri - (sr * 0.031 | 0)) & 8191] * 0.08 - this.rl) * 0.35; this.ri++;
        s += this.rl;
        if (mon) { mon.ex += sEx * sEx; mon.in += sIn * sIn; mon.bl += sBl * sBl; mon.me += sMe * sMe; mon.tu += sTu * sTu; mon.n++; }
        // ganho: AGC lento (preserva o caráter dos pulsos e parte da diferença lenta→cheio) + limitador de pico
        let g = 0.03 * this.vol;
        if (rt) {
          const a = Math.abs(s); this.env += (a - this.env) * (a > this.env ? 4e-4 : 5e-5);
          g *= Math.pow(Math.max(this.env, 2), -0.6);
        } else g *= 0.075;
        let y = s * g; const ay = Math.abs(y);
        this.pk = ay > this.pk ? ay : this.pk * 0.9997;
        if (this.pk > 0.95) y *= 0.95 / this.pk;
        out[i] = Math.tanh(y * 1.1) / 1.1;
      }
      // carga de CPU do áudio: se a thread não der conta o som picota (fica metálico); então a física passa
      // a dar 1 passo por amostra (≈ metade do custo, diferença de 1–3% nos resultados) até sobrar folga
      this.cpuT += Date.now() - t0; this.cpuN += out.length;
      if (this.cpuN >= sr) {
        this.load = this.cpuT / 1000 / (this.cpuN / sr); this.cpuT = this.cpuN = 0;
        if (this.load > 0.55 && this.dtP < 0.9 / sr) this.dtP = 1 / sr;
        else if (this.load < 0.2 && this.dtP > 0.9 / sr) this.dtP = 1 / (2 * sr);
      }
      this.acc += out.length;
      if (this.acc < sr / 30) return false;
      this.acc = 0;
      return true;
    }
    report() {
      const e = this.eng, r = e.report(), t = e.trL;
      r.tr = { p: t.p.slice(), v: t.v.slice(), T: t.T.slice(), X: t.X.slice(), mi: t.mi.slice(), me: t.me.slice(), li: t.li.slice(), le: t.le.slice() };
      r.ts = this.ts; r.simT = e.t; r.wt = e.wt; r.cpu = this.load; r.hq = this.dtP < 0.9 / this.sr;
      return r;
    }
  };
}

function WORKLET() {
  const Synth = SYNTH_LIB(ENGINE_LIB());
  registerProcessor('motor', class extends AudioWorkletProcessor {
    constructor() { super(); this.s = new Synth(sampleRate); this.port.onmessage = e => this.s.msg(e.data); }
    process(_, outs) {
      const o = outs[0];
      if (this.s.render(o[0])) this.port.postMessage(this.s.report());
      for (let c = 1; c < o.length; c++) o[c].set(o[0]);
      return true;
    }
  });
}

// Liga o áudio. Preferência: AudioWorklet (thread de áudio); reserva: ScriptProcessor (thread principal).
const Sound = {
  ctx: null,
  post() {},
  async start(onReport) {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    let node;
    try {
      const src = [ENGINE_CATALOG, DRIVE_LIB, THERMAL_LIB, ENGINE_LIB, SYNTH_LIB, WORKLET].join('\n') + '\nWORKLET();';
      await ctx.audioWorklet.addModule('data:text/javascript;charset=utf-8,' + encodeURIComponent(src)); // data: funciona até em file://
      node = new AudioWorkletNode(ctx, 'motor', { numberOfInputs: 0, outputChannelCount: [2] });
      node.port.onmessage = e => onReport(e.data);
      this.post = m => node.port.postMessage(m);
    } catch (err) {
      console.warn('AudioWorklet indisponível, simulando na thread principal:', err);
      const s = new (SYNTH_LIB(EngineLib))(ctx.sampleRate);
      node = ctx.createScriptProcessor(2048, 0, 2);
      node.onaudioprocess = ev => { const b = ev.outputBuffer, l = b.getChannelData(0); if (s.render(l)) onReport(s.report()); b.getChannelData(1).set(l); };
      this.post = m => s.msg(m);
    }
    node.connect(ctx.destination);
    this.node = node;
  },
};
if (typeof module !== 'undefined') module.exports = { SYNTH_LIB };
