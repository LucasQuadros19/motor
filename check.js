// Autoteste da física: `node check.js` (alguns minutos). Falha se algo sair do realista ou virar NaN.
const L = require('./engine.js'), assert = require('assert');
const inp = { lamMode: 'auto', eoi: 300, exh: 'stock' };
const cal = (cfg, fuel, extra = {}) => { const g = L.calibrate(cfg, fuel, Object.assign({ inj: L.ENGINES[cfg.eng].inj }, inp, extra)); let r; while (!(r = g.next()).done); return r.value; };
const finite = r => Object.values(r).every(v => typeof v !== 'number' || Number.isFinite(v));

// 1) potência e torque de cada motor contra os números publicados
for (const [k, E] of Object.entries(L.ENGINES)) {
  const cfg = { eng: k, cyl: E.cyl, cc: E.cc, cr: E.cr, fi: E.fi, boost: E.boost }, fuel = E.fam === 'two' ? 'mix2t' : E.fuelRef || (E.grupo === 'Fórmula 1' ? 'race' : 'e0_95');
  const i2 = Object.assign({}, inp, { inj: E.inj * 1.3, eoi: E.fam === 'two' ? 200 : 300 });                      // bico com folga, como na interface
  const d = L.dyno(cfg, cal(cfg, fuel, i2), i2, fuel), pk = f => d.reduce((m, p) => p[f] > m[f] ? p : m);
  const P = pk('cv'), T = pk('tq');
  console.log(`${E.nome.padEnd(44)} ${P.cv.toFixed(0).padStart(4)} cv @ ${P.rpm} (real ${E.ref.cv})  ${T.tq.toFixed(0).padStart(4)} N·m (real ${E.ref.nm})`);
  assert(Math.abs(P.cv / E.ref.cv - 1) < 0.15, k + ': potência fora do realista');
  assert(Math.abs(T.tq / E.ref.nm - 1) < 0.25, k + ': torque fora do realista');
}

// motor de teste em tempo real (configuração pronta)
function mk(key, extra = {}, sr = 48000) {
  const P = L.PRESETS[key], E = L.ENGINES[P.eng];
  const cfg = { eng: P.eng, cyl: P.cyl || E.cyl, cc: P.cc || E.cc, cr: P.cr || E.cr, fi: P.fi || E.fi, boost: P.boost || E.boost, ports: P.ports, limit: P.limit, veh: P.veh, trans: P.trans, over: P.over, cool: P.cool };
  const fuel = P.fuel || (E.fam === 'two' ? 'mix2t' : 'e0_95'), i2 = Object.assign({}, inp, { inj: E.inj * 1.3, eoi: E.fam === 'two' ? 200 : 300, exh: P.exh || 'stock' }, extra);
  const e = new L.Engine(cfg); e.ecu = cal(cfg, fuel, i2); Object.assign(e.inp, i2); e.setFuel(fuel); e.therm.reset(e.inp);
  const dt = 1 / sr; e.run = (s, f) => { for (let i = 0, n = Math.round(s / dt); i < n; i++) { f && f(i * dt); e.step(dt); } };
  e.inp.ign = e.inp.starter = true; let kn = 0, seen = 0;
  e.run(2.5, () => { while (seen < e.evN) { if (e.ev[(seen % 64) * 3] === 4) kn++; seen++; } });
  e.knStart = kn;
  return e;
}

// 2) partida, marcha lenta, sem detonação falsa na partida, 0–100
{
  const e = mk('daytona', {}, 96000), idle = e.report().rpm;
  console.log(`marcha lenta ${idle.toFixed(0)} rpm · arranque desligou: ${!e.inp.starter} · detonações na partida: ${e.knStart}`);
  assert(idle > 1100 && idle < 1700 && !e.inp.starter, 'partida/marcha lenta');
  assert(e.knStart === 0, 'detonação falsa na partida');
  e.inp.clutch = 1; e.shift(1); e.inp.tps = 0.6; e.run(0.4);
  let t = 0, t100 = 0, ls = 0;
  e.run(8, (tt) => { t = tt; e.inp.tps = 1; e.inp.clutch = Math.max(0, 1 - tt / 0.6); if (e.w * 30 / Math.PI > 14000 && tt - ls > 0.3) { e.shift(1); ls = tt; } if (!t100 && e.v * 3.6 >= 100) t100 = tt; });
  console.log(`0–100 km/h: ${t100.toFixed(2)} s (real ≈ 3,3 s)`);
  assert(t100 > 2.5 && t100 < 4.5, 'aceleração fora do realista');
  assert(finite(e.report()), 'NaN no relatório');
}
// 3) ré (carro manual): só a partir do N, parado; o carro anda para trás
{
  const e = mk('mustang'); e.shift(-1); assert(e.dl.gear === -1, 'ré não engatou');
  e.inp.clutch = 1; e.run(2, tt => { e.inp.clutch = Math.max(0, 1 - tt / 1.2); e.inp.tps = 0.3; });
  const v = e.report().kmh; console.log(`ré: ${v.toFixed(1)} km/h`); assert(v < -3, 'a ré não move o carro para trás');
}
// 4) temperaturas a plena carga na estrada (tempo térmico ×30)
{
  const e = mk('mustang', { warm: true, tk: 30 }); e.inp.clutch = 1; e.shift(1);
  e.run(2, tt => { e.inp.clutch = Math.max(0, 1 - tt / 1.2); e.inp.tps = 0.5; }); e.inp.tps = 1;
  for (let g = 2; g <= 6; g++) { e.run(2.5); e.shift(1); }
  e.run(8); const h = e.report().heat;
  console.log(`plena carga: líquido ${h.cool.toFixed(0)} · óleo ${h.oil.toFixed(0)} · pistão ${h.pis.toFixed(0)} · válv. escape ${h.ev.toFixed(0)} °C · ${h.pOil.toFixed(1)} bar`);
  assert(h.cool > 80 && h.cool < 110 && h.oil > 90 && h.oil < 140 && h.pis > 200 && h.pis < 330 && h.ev > 500 && h.ev < 850 && !h.seized, 'temperaturas fora do realista');
}
// 5) sem arrefecimento: superaquece e engripa; sem óleo: a bronzina funde
{
  const e = mk('m3', { warm: true, tk: 30, cool: 'none' }); e.inp.clutch = 1; e.shift(1);
  e.run(2, tt => { e.inp.clutch = Math.max(0, 1 - tt / 1.2); e.inp.tps = 0.5; });
  let t = 0; while (!e.therm.seized && t < 30) { e.run(1, () => { e.inp.tps = 0.4; }); t++; }
  console.log(`sem arrefecimento: ${e.therm.fail} (≈ ${(t * 30 / 60).toFixed(0)} min térmicos)`); assert(e.therm.seized, 'sem arrefecimento deveria engripar');
  const o = mk('civic', { warm: true }); o.inp.oilLvl = 0; t = 0;
  while (!o.therm.seized && t < 60) { o.run(1, () => { o.inp.tps = o.w * 30 / Math.PI > 4000 ? 0.05 : 0.3; }); t++; }
  console.log(`sem óleo a ~4.000 rpm: ${o.therm.fail} em ${t} s`); assert(o.therm.seized && t > 8 && t < 50, 'sem óleo deveria fundir a bronzina em segundos');
}
// 6) 2 tempos sem óleo na gasolina perde a película
{
  const e = mk('rd350', { warm: true }); e.setFuel('e0_95'); e.run(20, () => { e.inp.tps = e.w * 30 / Math.PI > 7000 ? 0.1 : 0.5; });
  const h = e.report().heat; console.log(`2T sem óleo na mistura: película ${(h.film * 100).toFixed(0)}% · bronzinas ${h.brg.toFixed(0)} °C`);
  assert(h.film < 0.1, '2 tempos sem óleo deveria perder a película');
}
console.log('ok');
