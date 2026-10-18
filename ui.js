// Interface: controles, laço principal, métricas, temperaturas/desgaste, explicações (passe o mouse),
// gráficos, conta-giros, foco 3D e pranchas 2D.
const L = EngineLib, $ = id => document.getElementById(id);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const tick = () => new Promise(r => setTimeout(r, 0));
const fmt = (v, d) => Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
const cfg = { eng: 'i3_675', cyl: 3, cc: 675, cr: 13.1, fuel: 'e0_95', fi: 'na', boost: 0.6, trans: 'seq', ports: 'std' };
const inp = { tps: 0, clutch: 0, brake: 0, ign: false, sparkMode: 'map', sparkOff: 0, sparkMan: 30, lamMode: 'auto', lam: 0.9, inj: 260, eoi: 300, exh: 'stock', qs: true, lim: 'fuel', crackle: false,
  cool: 'liquid', coolant: 'glicol', Tamb: 25, oil: '5w30', oilLvl: 1, gearOil: '75w90', gearLvl: 1, warm: true, tk: 1 };
let preset = {}, sheet = 'chamber';   // preset: ajustes da configuração pronta (veículo, motor, corte)
let geo = L.build(cfg), ecu = null, st = null, tr = null, stT = 0, started = false, busy = false, pending = false, mode = '3d';
let tsBack = 0, dyn = [], dynPrev = null, pvMode = 0, kThr = 0, thv = 0, last = performance.now(), uiT = 0, bpT = 0, tachRpm = 0, knockT = 0;
const keys = {}, disp = {};
const send = m => Sound.post(m);
const say = (t, warn) => { $('status').innerHTML = t; $('status').className = warn ? 'warn' : ''; };

function opts(id, list, val) { $(id).innerHTML = list.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); $(id).value = val; }
const GRUPOS = ['Motos', 'Motos exóticas', 'Carros', 'Carros exóticos', 'Fórmula 1', 'Aviões'], grouped = (T, first = '') => first + GRUPOS.map(gr => `<optgroup label="${gr}">` + Object.entries(T).filter(([, e]) => e.grupo === gr)
  .map(([k, e]) => `<option value="${k}">${e.nome}</option>`).join('') + '</optgroup>').join('');
$('eng').innerHTML = grouped(L.ENGINES);
$('preset').innerHTML = grouped(L.PRESETS, '<option value="">— personalizado —</option>');
opts('trans', Object.entries(L.TRANS), cfg.trans);
opts('ports', Object.entries(L.PORTS).map(([k, p]) => [k, p.nome]), cfg.ports);
opts('fuel', Object.entries(L.FUELS).map(([k, f]) => [k, f.nome]), cfg.fuel);
opts('inj', [120, 160, 200, 260, 320, 400, 450, 550, 650, 800, 1000, 1200, 1600, 2000, 2500, 3000].map(v => [v, v + ' cc/min']), inp.inj);
opts('exh', Object.entries(L.EXH).map(([k, x]) => [k, x.nome]), inp.exh);
opts('cool', Object.entries(L.TH.COOLING), 'liquid');
opts('coolant', Object.entries(L.TH.COOLANTS).map(([k, c]) => [k, c.nome]), 'glicol');
opts('oil', Object.entries(L.TH.OILS).map(([k, o]) => [k, o.nome]), '5w30');
opts('gearOil', Object.entries(L.TH.GEAROILS).map(([k, o]) => [k, o.nome]), '75w90');
const uniq = a => [...new Set(a)].sort((p, q) => p - q);
function fillEngine() { // ao trocar o tipo de motor: opções coerentes com a família
  const E = L.ENGINES[$('eng').value], rot = E.fam === 'rotary';
  opts('cyl', E.cylOpts.map(n => [n, rot ? `${n} rotor${n > 1 ? 'es' : ''}` : `${n} cil.`]), E.cyl);
  const bike = E.grupo.startsWith('Motos'), air = !!E.veh.prop;
  const cc = rot ? [E.cc] : uniq((air ? [5920, 9010, 16140, 27020, 45950] : bike ? [125, 160, 250, 300, 400, 500, 600, 675, 750, 900, 1000, 1200, 1300, 1600, 1870, 2500] : [1000, 1300, 1600, 1800, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7300, 8000]).concat(E.cc));
  opts('cc', cc.map(v => [v, v + ' cc']), E.cc);
  opts('cr', uniq([7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, E.cr]).map(v => [v, String(v).replace('.', ',') + ' : 1']), E.cr);
  $('fi').value = E.fi; $('boost').value = E.boost; $('ports').value = 'std';
  opts('trans', Object.entries(L.TRANS).filter(([k]) => (k === 'prop') === air), air ? 'prop' : E.veh.car ? 'manual' : 'seq');   // avião: só hélice
  if (E.fam === 'two') $('fuel').value = cfg.fuel = 'mix2t'; else if (air) $('fuel').value = cfg.fuel = 'avgas'; else if (cfg.fuel === 'mix2t' || cfg.fuel === 'avgas') $('fuel').value = cfg.fuel = 'e0_95';
  $('cool').value = E.cool || 'liquid';
  $('oil').value = E.oil || (bike ? '10w40' : E.grupo === 'Fórmula 1' ? '0w20' : '5w30');
}
function put(id, v, label) { // seleciona v, criando a opção se a lista não tiver
  if (v == null) return;
  if (![...$(id).options].some(o => +o.value === +v)) $(id).add(new Option(label, v));
  $(id).value = v;
}
function applyPreset(k) { // configuração pronta: motor + sobrealimentação + câmbio + escape + veículo
  const P = L.PRESETS[k];
  if (!P) { preset = {}; $('pinfo').textContent = ''; return; }
  $('eng').value = P.eng; fillEngine();
  const E = L.ENGINES[P.eng];
  if (P.cyl) $('cyl').value = P.cyl;
  put('cc', P.cc, P.cc + ' cc'); put('cr', P.cr, String(P.cr).replace('.', ',') + ' : 1');
  if (P.fi) $('fi').value = P.fi; if (P.boost) $('boost').value = P.boost;
  $('trans').value = P.trans || $('trans').value; $('ports').value = P.ports || 'std'; $('exh').value = P.exh || 'stock';
  $('crackle').checked = !!P.crackle; $('fuel').value = cfg.fuel = P.fuel || (E.fam === 'two' ? 'mix2t' : 'e0_95');
  if (P.cool) $('cool').value = P.cool;
  preset = { veh: P.veh, over: P.over, limit: P.limit };
  $('pinfo').innerHTML = P.info || `${E.nome} · ${L.TRANS[$('trans').value].toLowerCase()} · ${L.EXH[$('exh').value].nome.toLowerCase()}`;
}
const show = (id, on) => { $(id).style.display = on ? '' : 'none'; };
function rangeFill() { document.querySelectorAll('input[type=range]').forEach(r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%')); }

function readInputs() {
  Object.assign(inp, { sparkMode: $('smode').value, sparkOff: +$('soff').value, sparkMan: +$('sman').value, lamMode: $('lmode').value,
    lam: +$('lam').value, inj: +$('inj').value, eoi: +$('eoi').value, exh: $('exh').value, qs: $('qs').checked, lim: $('lim').value, crackle: $('crackle').checked,
    cool: $('cool').value, coolant: $('coolant').value, Tamb: +$('Tamb').value, oil: $('oil').value, oilLvl: +$('oilLvl').value / 100,
    gearOil: $('gearOil').value, gearLvl: +$('gearLvl').value / 100, warm: $('warm').value === '1', tk: +$('tk').value });
  const man = inp.sparkMode === 'manual', car = !!geo.veh.car;
  show('fsoff', !man); show('fsman', man); show('flam', inp.lamMode === 'manual');
  show('fboost', $('fi').value !== 'na'); show('fports', L.ENGINES[$('eng').value].fam === 'rotary');
  show('fcoolant', inp.cool === 'liquid'); show('fgear', car); show('fgearL', car); show('foilLvl', !geo.two);
  $('oilnote').textContent = geo.two ? `2 tempos: sem bomba nem cárter de óleo — o óleo vai misturado na gasolina (${L.FUELS[cfg.fuel].oil ? Math.round(L.FUELS[cfg.fuel].oil * 100) + '%' : 'SEM ÓLEO na gasolina escolhida!'}).` : '';
  $('vboost').textContent = `${fmt(+$('boost').value, 2)} bar`;
  $('vsoff').textContent = (inp.sparkOff > 0 ? '+' : '') + inp.sparkOff + '°';
  $('vsman').textContent = inp.sparkMan + '° APMS';
  $('vlam').textContent = `${fmt(inp.lam, 2)} · AFR ${fmt(inp.lam * L.FUELS[cfg.fuel].afr, 1)}`;
  $('veoi').textContent = `${inp.eoi}° · ${inp.eoi > geo.ivo && inp.eoi < geo.ivc ? 'válv. aberta' : 'válv. fechada'}`;
  $('vthr').textContent = $('thr').value + '%';
  $('vvol').textContent = Math.round($('vol').value * 100) + '%';
  $('vTamb').textContent = inp.Tamb + ' °C'; $('voilLvl').textContent = Math.round(inp.oilLvl * 100) + '%'; $('vgearLvl').textContent = Math.round(inp.gearLvl * 100) + '%';
  rangeFill();
  if (View3D) View3D.setExhaust(inp.exh);
  send({ inp: { ...inp }, vol: +$('vol').value });
}

async function remap() {
  busy = true;
  const gen = L.calibrate(cfg, cfg.fuel, inp);
  let r;
  while (!(r = gen.next()).done) { say(`Calibrando a ECU no dinamômetro virtual… ${Math.round(r.value * 100)}%`); await tick(); }
  ecu = r.value; busy = false;
  send({ ecu });
  say(`ECU calibrada para <b>${L.FUELS[cfg.fuel].nome}</b>: avanço no ponto de máximo torque, atrasado onde detonaria.`);
}

async function applyEngine() {
  if (busy) { pending = true; return; }   // mudou durante a calibração: refaz no fim
  const E = L.ENGINES[$('eng').value];
  if (E.fam === 'rotary') { const cc = E.cc / E.cyl * +$('cyl').value; opts('cc', [[cc, cc + ' cc']], cc); }
  Object.assign(cfg, { eng: $('eng').value, cyl: +$('cyl').value, cc: +$('cc').value, cr: +$('cr').value, fi: $('fi').value, boost: +$('boost').value,
    trans: $('trans').value, ports: $('ports').value, veh: preset.veh, over: preset.over, limit: preset.limit, crackle: $('crackle').checked, cool: $('cool').value, oil: $('oil').value });
  geo = L.build(cfg);
  $('gearOil').value = cfg.trans === 'auto8' ? 'atf' : cfg.trans === 'cvt' ? 'cvtf' : '75w90';
  // bico proporcional ao ar por injetor (referência: o bico original deste motor)
  const k = cfg.fi !== 'na' ? 1 + 0.9 * cfg.boost : 1, k0 = E.fi !== 'na' ? 1 + 0.9 * E.boost : 1;
  const need = 1.25 * E.inj * Math.pow(cfg.cc / cfg.cyl / (E.cc / E.cyl), 2 / 3) * k / k0, list = [...$('inj').options].map(o => +o.value);   // ~25% de folga (duty ≤ ~80%)
  $('inj').value = list.find(v => v >= need * 0.95) || list[list.length - 1];
  $('eoi').max = geo.cyc - 5; $('eoi').value = geo.rot ? 500 : geo.two ? 200 : 300;
  $('geo').textContent = geo.rot ? `${geo.n} rotor(es) · ${fmt(geo.vd * 1e6, 0)} cm³ por face · R ${fmt(geo.Rg * 1000, 0)} mm · corte ${fmt(geo.limit, 0)} rpm`
    : `Ø ${fmt(geo.B * 1000, 1)} × ${fmt(geo.S * 1000, 1)} mm · ${fmt(geo.vd * 1e6, 0)} cc/cil. · corte ${fmt(geo.limit, 0)} rpm`;
  $('bturbo').hidden = $('sturbo').hidden = cfg.fi === 'na';
  document.querySelectorAll('[data-f="gearbox"],[data-s="gearbox"]').forEach(b => { b.textContent = cfg.trans === 'prop' ? 'Hélice' : 'Câmbio'; });
  if (sheet === 'turbo' && cfg.fi === 'na') setSheet('chamber');
  if (View3D) View3D.build(geo, { exh: $('exh').value, cool: $('cool').value });
  inp.ign = false;
  readInputs();
  await remap();
  send({ cfg: { ...cfg }, ecu, fuel: cfg.fuel, inp: { ...inp }, ts: +$('ts').value, rebuild: true });
  st = null; tr = null; dyn = []; dynPrev = null; drawDyno(); setFocus(null);
  if (pending) { pending = false; applyEngine(); }
}

function onReport(s) { st = s; stT = performance.now(); if (s.tr) tr = s.tr; }
async function start() {
  if (busy || !ecu) { say('Aguarde a calibração da ECU terminar…'); return; }
  if (st && st.heat && st.heat.seized) { say('O motor está travado — use <b>Remontar motor</b>.', true); return; }
  if (!started) {
    try { await Sound.start(onReport); } catch (e) { say('Não consegui iniciar o áudio: ' + e.message, true); return; }
    started = true;
    send({ cfg: { ...cfg }, ecu, fuel: cfg.fuel, inp: { ...inp }, vol: +$('vol').value, ts: +$('ts').value, rebuild: true });
  }
  if (Sound.ctx.state !== 'running') await Sound.ctx.resume();
  inp.ign = true;
  if (+$('ts').value < 1) { tsBack = +$('ts').value; send({ ts: 1 }); say('Partida em tempo real; a câmera lenta volta quando o motor pegar.'); }
  send({ inp: { ign: true, starter: true } });   // o motor de arranque desliga sozinho quando pega
}
function rebuild() { send({ inp: { ...inp }, rebuild: true }); $('fail').style.display = 'none'; say('Motor remontado: peças novas, temperaturas do início.'); }
$('start').onclick = start;
$('stop').onclick = () => { inp.ign = false; send({ inp: { ign: false, starter: false } }); };
$('rebuild').onclick = $('rebuild2').onclick = rebuild;
$('remap').onclick = () => { if (!busy) remap(); };
$('dyno').onclick = async () => {
  if (busy || !ecu) return;
  busy = true; say('Rodando o dinamômetro…'); await tick();
  dynPrev = dyn.length ? dyn : null;
  dyn = L.dyno(cfg, ecu, inp, cfg.fuel);
  busy = false; say(''); drawDyno();
};
$('eng').onchange = () => { $('preset').value = ''; applyPreset(''); fillEngine(); applyEngine(); };
$('preset').onchange = () => { applyPreset($('preset').value); applyEngine(); };
for (const id of ['cyl', 'cc', 'cr', 'fi', 'trans', 'ports']) $(id).onchange = applyEngine;
$('boost').onchange = applyEngine;
$('boost').oninput = () => { $('vboost').textContent = `${fmt(+$('boost').value, 2)} bar`; rangeFill(); };
$('fuel').onchange = () => {
  cfg.fuel = $('fuel').value; send({ fuel: cfg.fuel }); readInputs();
  if (ecu && ecu.fuel !== cfg.fuel) say(`O mapa da ECU ainda é o de <b>${L.FUELS[ecu.fuel].nome}</b>. Observe a detonação e use <b>Remapear ECU</b> para otimizar.`);
};
for (const id of ['smode', 'soff', 'sman', 'lmode', 'lam', 'inj', 'eoi', 'exh', 'qs', 'thr', 'vol', 'lim', 'crackle', 'cool', 'coolant', 'Tamb', 'oil', 'oilLvl', 'gearOil', 'gearLvl', 'tk'])
  $(id).oninput = $(id).onchange = readInputs;
$('cool').addEventListener('change', () => { if (View3D) View3D.setCooling($('cool').value); });
$('warm').onchange = () => { readInputs(); rebuild(); };
$('ts').onchange = () => { tsBack = 0; send({ ts: +$('ts').value }); };
$('pv').onclick = () => { pvMode ^= 1; $('pvName').textContent = pvMode ? 'P × θ' : 'P × V'; drawCycle(); };
function setMode(m) {
  mode = m; $('c3d').style.display = m === '3d' ? 'block' : 'none'; $('c2d').style.display = m === '2d' ? 'block' : 'none';
  $('v3d').classList.toggle('on', m === '3d'); $('v2d').classList.toggle('on', m === '2d'); document.querySelector('main').classList.toggle('m2d', m === '2d');
  $('tach').style.display = m === '3d' ? '' : 'none';
  if (m === '2d') setFocus(null);
}
$('v3d').onclick = () => setMode('3d'); $('v2d').onclick = () => setMode('2d');
const fold = (side, on) => { document.body.classList.toggle(side, on); try { localStorage.setItem(side, on ? '1' : ''); } catch (e) { } };
$('foldL').onclick = () => fold('noL', true); $('openL').onclick = () => fold('noL', false); $('foldR').onclick = () => fold('noR', true); $('openR').onclick = () => fold('noR', false);
try { for (const k of ['noL', 'noR']) if (localStorage.getItem(k)) document.body.classList.add(k); } catch (e) { }
function setSheet(s) { sheet = s; document.querySelectorAll('#viewbar [data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === s)); }
document.querySelectorAll('#viewbar [data-s]').forEach(b => { b.onclick = () => setSheet(b.dataset.s); });
document.querySelectorAll('#viewbar [data-f]').forEach(b => { b.onclick = () => { if (mode !== '3d') setMode('3d'); setFocus(b.dataset.f || null); }; });

// ---------- explicações ao parar o mouse ----------
const HELP_DELAY = 1500;                                                      // ms parado sobre o item (o "?" mostra na hora)
document.querySelectorAll('.lab[data-h]').forEach(l => {
  const q = document.createElement('span'); q.className = 'q'; q.textContent = '?'; q.dataset.hq = l.dataset.h;
  const b = l.querySelector('b'); if (b) l.insertBefore(q, b); else l.appendChild(q);
  l.parentElement.dataset.h = l.dataset.h;                                    // o campo inteiro (rótulo + controle) responde
});
let tipT = 0, tipFor = null;
function tipHTML(k) {
  const h = HELP[k]; if (!h) return '';
  return `<h4>${h.t}</h4>${h.d ? `<p>${h.d}</p>` : ''}${h.up ? `<p class="up">▲ ${h.up}</p>` : ''}${h.down ? `<p class="dn">▼ ${h.down}</p>` : ''}${h.ok ? `<p class="ok">● ${h.ok}</p>` : ''}`;
}
function showTip(el, k) {
  const html = tipHTML(k); if (!html) return;
  const tp = $('tip'); tp.innerHTML = html; tp.classList.add('on');
  const r = el.getBoundingClientRect(), w = tp.offsetWidth, h = tp.offsetHeight;
  let x = r.right + 12, y = r.top;
  if (x + w > innerWidth - 8) x = r.left - w - 12;
  y = clamp(y, 8, innerHeight - h - 8);
  tp.style.left = Math.max(8, x) + 'px'; tp.style.top = y + 'px';
}
function hideTip() { clearTimeout(tipT); tipFor = null; $('tip').classList.remove('on'); }
document.addEventListener('mouseover', e => {
  const q = e.target.closest('[data-hq]'), el = q || e.target.closest('[data-h]');
  if (!el) { hideTip(); return; }
  if (el === tipFor) return;
  hideTip(); tipFor = el;
  const k = q ? q.dataset.hq : el.dataset.h;
  tipT = setTimeout(() => showTip(el, k), q ? 0 : HELP_DELAY);
});
document.addEventListener('mousedown', e => { if (!e.target.closest('[data-hq]')) hideTip(); });
document.addEventListener('scroll', () => $('tip').classList.remove('on'), true);   // rolar só esconde; o temporizador do item sob o mouse continua

// ---------- foco (zoom numa peça) ----------
function setFocus(name) {
  const f = View3D ? View3D.focus(name) : null;
  if ((f === 'chamber' || f === 'exhaust') && started && +$('ts').value === 1) {
    $('ts').value = '0.02'; send({ ts: 0.02 });
    say(f === 'exhaust' ? 'Câmera lenta 1:50 para ver os pulsos de cada cilindro se encontrando no coletor — o som desacelera junto.' : 'Câmera lenta 1:50 ligada para acompanhar a câmara — o som desacelera junto.');
  }
  $('info').style.display = f ? 'block' : 'none';
  document.querySelectorAll('#viewbar [data-f]').forEach(b => b.classList.toggle('on', (b.dataset.f || null) === f));
  info();
}
if (View3D) View3D.onPick = name => { if (name) setFocus(name); };
// passar o mouse numa peça do 3D: depois de ~0,6 s parado aparece o que ela é e o que faz
const hov3 = { k: null, t: 0, on: false, x: 0, y: 0 };
function placeTip(x, y) { const tp = $('tip'), w = tp.offsetWidth, h = tp.offsetHeight; tp.style.left = clamp(x + 18, 8, innerWidth - w - 8) + 'px'; tp.style.top = clamp(y + 18, 8, innerHeight - h - 8) + 'px'; }
if (View3D) View3D.onHover = (k, x, y, same) => {
  hov3.x = x; hov3.y = y;
  if (same) { if (hov3.on) placeTip(x, y); return; }
  clearTimeout(hov3.t); if (hov3.on) { $('tip').classList.remove('on'); hov3.on = false; }
  hov3.k = k; if (!k) return;
  hov3.t = setTimeout(() => { const html = tipHTML('p_' + k); if (!html) return; const tp = $('tip'); tp.innerHTML = html; tp.classList.add('on'); hov3.on = true; placeTip(hov3.x, hov3.y); }, 600);
};
const LEG = list => list.map(([c, t]) => `<i style="background:${c}"></i>${t}`).join(' ');
function info() {
  const f = View3D && View3D.focusName; if (!f) return;
  const s = st || {}, F = L.FUELS[cfg.fuel], C = geo.cyc, tc = ((thv - geo.lay[0].off) % C + C) % C, b = tc | 0, th = s.heat || {};
  const ph = geo.rot ? ['expansão', 'escape', 'admissão', 'compressão'][Math.floor(tc / 270) % 4] : ['expansão', 'escape', 'admissão', 'compressão'][Math.floor(tc / 180) % 4];
  const T = tr ? tr.T[b] : 0, p = tr ? tr.p[b] : 0;
  let h = '';
  if (f === 'chamber') h = `<h3>Câmara de combustão · ${geo.rot ? 'rotor 1' : 'cilindro 1'}</h3>
    <p>${LEG([['#738cb3', 'N₂'], ['#59ccff', 'O₂'], ['#ff9e26', 'gasolina'], ['#66ff80', 'etanol'], ['#cc73ff', 'aditivos'], ['#8c807a', 'CO₂'], ['#cce6ff', 'H₂O']])}</p>
    <p>θ = ${fmt(tc, 0)}° · <b>${ph}</b> · p = ${fmt(p, 1)} bar · T = ${fmt(T, 0)} K</p>
    <p>λ ${fmt(s.lam, 2)} (AFR ${fmt(s.afr, 1)}) · ${F.nome}${F.eth ? ` · ${fmt(F.eth * 100, 0)}% etanol` : ''}</p>
    <p>Faísca ${fmt(s.adv, 1)}° antes do PMS · queima em ${fmt(s.dth, 0)}° · gases residuais ${fmt(s.xres, 1)}%</p>
    <p>Paredes: cabeçote ${fmt(th.head, 0)} °C · pistão ${fmt(th.pis, 0)} °C · camisa ${fmt(th.lin, 0)} °C</p>
    ${geo.two || geo.rot ? '' : `<p>${geo.E.desmo ? '<b>Desmodrômico</b>: não há mola — um came abre a válvula pelo balancim de cima e um segundo came (cobre, perfil "ao contrário") puxa o garfo sob o colar e fecha. Sem mola não há flutuação: a válvula segue o came em qualquer giro.' : geo.E.pneumatic ? '<b>Mola pneumática</b>: em vez da mola de aço, um pistão na haste comprime nitrogênio (azul) a ~200 bar. Quase sem massa, não ressoa — permite 18–20 mil rpm.' : geo.E.ohv ? '<b>Varetas e balancins (OHV)</b>: o comando fica no bloco; o tucho empurra a vareta, que gira o balancim no cabeçote e abre a válvula.' : 'Comando no cabeçote (DOHC): o came empurra o tucho de copo e a mola fecha a válvula.'}${geo.E.plugs === 2 ? ' <b>Duas velas</b> por cilindro (magnetos independentes): duas frentes de chama queimam a câmara grande mais rápido e uma falha não para o motor.' : ''}</p>`}
    <small>${geo.two ? 'No 2 tempos não há válvulas: o pistão descobre as janelas na parede. Descendo, ele comprime a mistura no cárter (a palheta fecha) e, ao descobrir as transferências, ela sobe para o cilindro empurrando o gás queimado pela janela de escape. Uma explosão por volta. ' : ''}${geo.rot ? 'No rotativo as três faces do rotor fazem os quatro tempos em sequência; as cores mostram a temperatura de cada câmara.' : 'Cada partícula é uma amostra do gás: a quantidade dentro do cilindro segue a massa simulada. As gotas de combustível evaporam ao entrar, a compressão aquece, a frente de chama (a partir da vela) transforma a mistura em CO₂ e H₂O, e o escape leva tudo embora.'} Use câmera lenta 1:200 para ver cada etapa.</small>`;
  else if (f === 'intake') h = `<h3>Admissão</h3><p>${LEG([['#738cb3', 'ar (N₂)'], ['#59ccff', 'O₂'], ['#ff9e26', 'combustível']])}</p>
    <p>Borboleta ${fmt(inp.tps * 100, 0)}% · MAP ${fmt(s.map, 0)} kPa · eficiência volumétrica ${fmt(s.ve, 0)}%</p>
    <p>Bico: ${fmt(s.pw, 2)} ms por ciclo · duty ${fmt(s.duty, 0)}% · fim da injeção ${inp.eoi}° · ar a ${fmt(s.Tamb, 0)} °C</p>
    <small>O ar entra pela tomada, passa pelo filtro, pela borboleta e pelos dutos. Quando a válvula abre ele acelera; a onda de pressão que volta do fim do duto empurra mais ar para dentro perto do fechamento (efeito ram).</small>`;
  else if (f === 'exhaust') {
    const X = L.EXH[inp.exh], parts = [geo.two ? 'câmara de expansão' : geo.rot ? 'coletor' : `coletor ${geo.grp.length > 1 ? geo.grp.length + ' bancadas' : geo.nch + '-em-1'}`];
    if (cfg.fi === 'turbo') parts.push('turbina'); if (X.cat) parts.push('catalisador'); if (X.res) parts.push('ressonador'); if (X.muff) parts.push(X.muff > 1 ? 'abafador de 2 câmaras' : 'abafador reto (fibra)');
    parts.push('ponteira');
    h = `<h3>Escape · ${X.nome}</h3><p>${parts.join(' → ')}</p><p>Gás a ${fmt(s.egt, 0)} °C · pressão no coletor ${fmt(s.pt, 0)} kPa · ${fmt(s.pmax ? p : 0, 1)} bar no cilindro agora</p>
    <p>${LEG([['#ff6b5b', 'cil. 1'], ['#ffc04d', 'cil. 2'], ['#6fe08a', 'cil. 3'], ['#5bc0ff', 'cil. 4'], ['#c48bff', '…']])}</p>
    <p>Estalos até agora: <b>${fmt(s.pops, 0)}</b>${inp.crackle ? ' · mapa de estalos ligado' : ''}</p>
    <small>Cada cor é o gás de um cilindro: os pulsos saem um de cada vez, na ordem de explosão, e se encontram no coletor. Os anéis claros são as ondas de pressão (som) indo para o coletor; ao chegar na junção uma parte volta como depressão (azul) e ajuda a puxar o próximo cilindro no cruzamento de válvulas — por isso o comprimento dos tubos muda a potência. ${geo.two ? 'No 2 tempos a câmara de expansão devolve primeiro uma depressão (cone divergente) e depois um pulso (cone convergente) que empurra a mistura de volta para o cilindro.' : 'O catalisador e o abafador seguram a pressão e cortam os agudos; sem eles a onda chega forte e "rasgada" na ponteira.'}</small>`;
  }
  else if (f === 'turbo') h = s.fi === 'sc' ? `<h3>Supercharger centrífugo</h3><p>Rotor a ${fmt(s.trpm, 0)} rpm (correia do virabrequim) · razão de pressão ${fmt(s.PR, 2)}</p>
    <p>Pressão ${fmt(s.boost, 0)} kPa · ar sai a ${fmt(s.T2, 0)} °C e entra no motor a ${fmt(s.Tab, 0)} °C</p><p>Custa ${fmt(s.scKw, 1)} kW do virabrequim.</p>
    <small>Sem atraso: a pressão sobe com o quadrado da rotação do motor.</small>`
    : `<h3>Turbo</h3><p>${LEG([['#ff8a3d', 'gás de escape'], ['#66b3ff', 'ar comprimido']])}</p><p>Eixo a ${fmt(s.trpm, 0)} rpm · razão de pressão ${fmt(s.PR, 2)} · pressão ${fmt(s.boost, 0)} kPa</p>
    <p>Ar sai do compressor a ${fmt(s.T2, 0)} °C → intercooler → ${fmt(s.Tab, 0)} °C · turbina recebe ${fmt(s.pt, 0)} kPa · wastegate ${fmt(s.wg, 0)}%</p>
    <p>Mancal do turbo ${fmt(th.tb, 0)} °C</p>
    <small>A turbina usa a energia do escape para girar o compressor; abaixo de certa vazão ela não tem força (turbo lag). A wastegate desvia o gás para segurar a pressão alvo e a válvula de alívio chia quando você fecha o acelerador. O eixo gira em óleo: desligar quente sem deixar esfriar carboniza o óleo no mancal.</small>`;
  else if (f === 'gearbox') {
    const d = s.dl || {}, g0 = s.gear || 0, rpmO = Math.abs(d.wOut || 0) * 30 / Math.PI, glued = s.clutch < 0.5 && (cfg.trans === 'seq' || cfg.trans === 'manual');
    const rpmI = glued ? (s.rpm || 0) / (geo.veh.car ? 1 : geo.veh.primary) : Math.abs(d.wIn || 0) * 30 / Math.PI;   // embreagem fechada: entrada gira com o motor
    if (cfg.trans === 'prop') {
      const V = geo.veh, red = V.red || 1, np = (s.rpm || 0) * red, tip = Math.PI * V.propD * np / 60, mach = Math.hypot(tip, Math.abs(s.kmh || 0) / 3.6) / 340;
      h = `<h3>Hélice · ${V.blades} pás · Ø ${fmt(V.propD, 2)} m</h3><p>${red < 1 ? `Redução ${fmt(1 / red, 2)} : 1 · ` : 'Acoplada direto no virabrequim · '}hélice a ${fmt(np, 0)} rpm · ponta das pás a ${fmt(tip, 0)} m/s (Mach ${fmt(mach, 2)})</p>
      <p>Tração ${fmt((d.thrust || 0) / 9.81, 0)} kgf · ar atrás da hélice a ${fmt((d.vAir || 0) * 3.6, 0)} km/h · avião a ${fmt(Math.abs(s.kmh || 0), 0)} km/h</p>
      <small>Cada pá é uma asa girando: o ângulo dela muda ao longo do raio (torção) porque a ponta anda muito mais rápido que a raiz — assim todo o comprimento "morde" o ar no mesmo ângulo. A potência que a hélice pede cresce com o cubo da rotação, e é ela que segura o giro do motor (não há câmbio). Parado, a tração vem da quantidade de movimento do ar acelerado (teoria do disco atuador); andando, a pá "escorrega" menos e a tração cai. Ponta acima de ~Mach 0,85 gera ondas de choque: ruído e perda — por isso motores grandes usam redução.</small>`;
    } else if (cfg.trans === 'auto8') {
      const els = g0 ? L.DRV.ZF.shift[g0 < 0 ? 0 : g0] : '';
      h = `<h3>Automático 8 marchas (planetário)</h3><p>${gearTxt(s)} · relação ${g0 ? fmt(L.DRV.ZF_R[g0 < 0 ? 0 : g0], 3) : '–'} · elementos fechados: <b>${els.split('').join(' + ') || '—'}</b>${d.shift ? ' · <b>trocando</b>' : ''}</p>
      <p>Conversor: turbina a ${fmt(d.sr * 100, 0)}% do motor · travamento ${fmt(d.lock * 100, 0)}% · ATF ${fmt(th.gbo, 0)} °C</p><p>Entrada ${fmt(rpmI, 0)} rpm · saída ${fmt(rpmO, 0)} rpm</p>
      <small>Quatro trens planetários (solar, satélites, coroa). Cada marcha fecha 3 de 5 elementos: freios A e B seguram peças na carcaça, embreagens C, D e E unem peças entre si. Trocar de marcha é soltar um elemento enquanto outro fecha, sem cortar a força. Na ré (A+B+D) a coroa do primeiro trem fica presa e a saída gira ao contrário. O conversor de torque multiplica o torque na arrancada e trava acima de ~8 m/s. <kbd>E</kbd>/<kbd>Q</kbd> passam para manual (M), <kbd>D</kbd> volta ao automático; parado em N, <kbd>Q</kbd> engata a ré.</small>`;
    } else if (cfg.trans === 'cvt') {
      h = `<h3>CVT · polias variáveis</h3><p>Relação ${fmt(Math.abs(d.cvt), 2)} : 1 (total) · ${g0 < 0 ? 'R' : g0 ? 'D' : 'N'}</p><p>Polia motora ${fmt(rpmI, 0)} rpm · saída ${fmt(rpmO, 0)} rpm</p>
      <small>Cada polia é feita de dois cones; aproximar os cones faz a correia subir (raio maior). A polia do motor fecha enquanto a de saída abre: a relação muda sem degraus e a ECU segura o motor no giro de potência máxima quando você pisa fundo. ${geo.veh.car ? 'Conversor de torque na saída do motor para arrancar.' : 'Embreagem centrífuga: as sapatas abrem com o giro e agarram o tambor.'}</small>`;
    } else {
      const r = g0 > 0 ? geo.veh.gears[g0 - 1] : g0 < 0 ? d.rev : 0;
      h = `<h3>Câmbio ${cfg.trans === 'manual' ? 'manual (H, sincronizado)' : 'sequencial (tambor + garfos)'}</h3><p>Marcha <b>${g0 < 0 ? 'R' : g0 || 'N'}</b>${g0 ? ` · relação ${fmt(r, 3)}` : ''} · embreagem ${s.clutch > 0.5 ? 'aberta' : 'fechada'} (${fmt(th.clu, 0)} °C)</p>
      <p>Eixo de entrada ${fmt(rpmI, 0)} rpm · saída ${fmt(rpmO, 0)} rpm${geo.veh.car ? ` · óleo ${fmt(th.gbo, 0)} °C` : ''}</p>
      <small>${cfg.trans === 'manual' ? 'O eixo de entrada gira o contra-eixo pelo par de entrada (sempre engrenado). Cada engrenagem do contra-eixo gira uma engrenagem solta no eixo de saída. A alavanca leva o trilho, o garfo desliza a luva: o anel de latão do sincronizador iguala as velocidades por atrito e os dentes da luva travam a engrenagem escolhida no eixo. Na marcha direta (1:1) a luva trava o eixo de entrada direto no de saída. Na ré a engrenagem intermediária desliza para dentro, entre o contra-eixo e o eixo de saída, e inverte o giro (parado em N, aperte <kbd>Q</kbd>). O caminho da força fica aceso.' : 'O pedal gira o tambor seletor um passo por vez (por isso não dá para pular marchas). Os pinos dos garfos correm nos canais do tambor e deslizam as engrenagens com dentes laterais (dogs), que travam na engrenagem vizinha. O quickshifter corta a ignição por milissegundos para aliviar os dentes.'}</small>`;
    }
  } else if (f === 'cooling') {
    const c = inp.cool, fl = L.TH.COOLANTS[inp.coolant];
    h = `<h3>Arrefecimento · ${L.TH.COOLING[c]}</h3>
    <p>${c === 'liquid' ? `Líquido ${fmt(th.cool, 0)} °C (ferve a ${fmt(fl.Tb - 273.15, 0)} °C) · nível ${fmt(th.lvlC * 100, 0)}% · termostática ${fmt(th.thermo * 100, 0)}% aberta · ventoinha ${th.fan ? 'ligada' : 'desligada'}${th.boil ? ' · <b style="color:var(--bad)">FERVENDO</b>' : ''}` : c === 'none' ? '<b style="color:var(--bad)">Sem arrefecimento</b>: o calor só sai pelo bloco para o ar.' : `Aletas trocando calor com o ar a ${fmt(Math.abs(s.kmh || 0), 0)} km/h`}</p>
    <p>Cabeçote ${fmt(th.head, 0)} · camisa ${fmt(th.lin, 0)} · pistão ${fmt(th.pis, 0)} · válvula de escape ${fmt(th.ev, 0)} °C</p>
    <p>Radiador tirando ${fmt((th.Q && th.Q.rad || 0) / 1000, 1)} kW · aletas ${fmt((th.Q && th.Q.fin || 0) / 1000, 1)} kW</p>
    <small>${LEG([['#3b82f6', 'frio'], ['#3ecf8e', 'normal'], ['#ffb020', 'quente'], ['#ff5252', 'perigo']])}<br>A combustão joga calor nas paredes da câmara (cabeçote, pistão, camisa). A bomba d'água (girando com o motor) leva o líquido pelas galerias do bloco e do cabeçote; frio, a válvula termostática manda o líquido de volta ao motor para aquecer rápido; quente, ela abre o caminho do radiador, onde o ar (do movimento ou da ventoinha) leva o calor embora. Sem líquido as paredes esquentam, a mistura detona, o pistão dilata mais que a folga e engripa.</small>`;
  } else if (f === 'oil') {
    const o = L.TH.OILS[inp.oil], lam = th.lam || {}, R = k => `${fmt(lam[k], 1)} (${L.TH.regime(lam[k] || 9)})`;
    h = `<h3>Lubrificação · ${o.nome}</h3>
    <p>Óleo ${fmt(th.oil, 0)} °C · ${fmt(L.TH.nu(o, (th.oil || 90) + 273.15), 1)} cSt · pressão ${fmt(th.pOil, 1)} bar · nível ${Math.round(inp.oilLvl * 100)}% · película ${fmt((th.film || 0) * 100, 0)}%</p>
    <p>Película λ (espessura ÷ rugosidade): bronzinas ${R('biela')} · comando ${R('comando')} · anéis ${R('aneis')}${cfg.fi === 'turbo' ? ` · turbo ${R('turbo')}` : ''}</p>
    <small>${LEG([['#3ecf8e', 'hidrodinâmico (λ>3)'], ['#ffb020', 'misto'], ['#ff5252', 'limite/seco']])}<br>A bomba puxa o óleo do cárter pelo pescador e manda para as galerias: bronzinas de mancal e de biela, comando no cabeçote, jatos sob os pistões e turbo. Com película inteira (λ > 3) as peças "flutuam" e quase não gastam; com película fina o metal toca (atrito e desgaste sobem). Óleo frio e grosso protege mas demora a chegar; quente e fino demais a película rompe. Sem pressão, a película que sobrou some em segundos e as bronzinas fundem.</small>`;
  }
  $('info').innerHTML = h + '<div class="row"><button onclick="setFocus(null)">Voltar à visão geral</button></div>';
}

// ---------- teclado ----------
const KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', Space: 'clutch' };
addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  hideTip();
  const k = KEYS[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyE' || e.code === 'ArrowRight') { send({ shift: 1 }); e.preventDefault(); }
  if (e.code === 'KeyQ' || e.code === 'ArrowLeft') { send({ shift: -1 }); e.preventDefault(); }
  if (e.code === 'KeyP') { if (inp.ign) send({ inp: { starter: true } }); else start(); }
  if (e.code === 'KeyD') send({ mode: 'D' });                                  // automático: volta do modo manual
});
addEventListener('keyup', e => { const k = KEYS[e.code]; if (k) keys[k] = false; });

// ---------- métricas ----------
const MET = [ // [chave, nome, unidade, casas, só aparece quando] · '#' = título de grupo
  ['#', 'Motor'], ['rpm', 'Rotação', 'rpm', 0], ['kmh', 'Velocidade', 'km/h', 0], ['map', 'MAP (coletor)', 'kPa', 0], ['ve', 'Efic. volumétrica', '%', 0],
  ['bmep', 'BMEP', 'bar', 2], ['eta', 'Rendimento', '%', 1], ['lph', 'Consumo', 'L/h', 2], ['kml', 'Consumo', 'km/L', 1], ['bsfc', 'BSFC', 'g/kWh', 0], ['egt', 'EGT', '°C', 0],
  ['#', 'Mistura e ignição'], ['lam', 'λ medido', '', 2], ['afr', 'AFR', ': 1', 1], ['pw', 'Pulso do bico', 'ms', 2], ['duty', 'Duty do bico', '%', 0],
  ['adv', 'Avanço', '° APMS', 1], ['mbt', 'MBT (mapa)', '° APMS', 1], ['kI', 'Índice detonação', '/1', 2], ['kn', 'Detonação', 'bar', 2], ['kr', 'Atraso p/ detonação', '°', 1],
  ['#', 'Ciclo'], ['pmax', 'Pressão máx.', 'bar', 0], ['apmax', 'Ângulo P. máx.', '° DPMS', 0], ['Tmax', 'Temp. máx. gás', 'K', 0], ['xres', 'Gases residuais', '%', 1],
  ['dth', 'Duração da queima', '°', 0], ['imep', 'IMEP', 'bar', 2], ['pmep', 'PMEP (bombeam.)', 'bar', 2], ['fmep', 'FMEP (atrito)', 'bar', 2], ['mair', 'Ar/ciclo/câmara', 'mg', 0], ['mfuel', 'Comb./ciclo', 'mg', 1],
  ['dr', 'Taxa de entrega', '%', 0, 'two'], ['te', 'Retenção', '%', 0, 'two'], ['flt', 'Flutuação válvula', 'mm', 2, 'vlv'], ['floatRpm', 'Flutua a partir de', 'rpm', 0, 'vlv'],
  ['#', 'Arrefecimento e óleo'], ['tCool', 'Temp. motor', '°C', 0], ['tOil', 'Temp. óleo', '°C', 0], ['pOil', 'Pressão do óleo', 'bar', 1], ['visc', 'Viscosidade', 'cSt', 1], ['lvlC', 'Nível do líquido', '%', 0, 'liq'],
  ['#', 'Sobrealimentação', 'fi'], ['boost', 'Pressão turbo', 'kPa', 0, 'fi'], ['trpm', 'Rotação turbo/SC', 'rpm', 0, 'fi'], ['T2', 'Ar após compressor', '°C', 0, 'fi'], ['wg', 'Wastegate', '%', 0, 'fi'],
  ['#', 'Híbrido (F1)', 'ers'], ['ers', 'MGU-K (ERS)', 'kW', 0, 'ers'], ['soc', 'Bateria', '%', 0, 'ers'],
  ['#', 'Hélice', 'prop'], ['thrust', 'Empuxo', 'kgf', 0, 'prop'], ['prpm', 'Rotação da hélice', 'rpm', 0, 'prop'], ['tip', 'Ponta da pá', 'Mach', 2, 'prop'],
  ['#', 'Transmissão', 'nprop'], ['ratio', 'Relação total', ': 1', 2, 'nprop'], ['sr', 'Conversor (turbina)', '%', 0, 'tc'], ['pops', 'Estalos no escape', '', 0], ['slip', 'Patinagem', 'km/h', 0, 'nprop'],
];
$('met').innerHTML = MET.map(([k, t, u, , tag]) => k === '#' ? `<div class="g" data-tag="${u || ''}">${t}</div>`
  : `<div class="m" data-tag="${tag || ''}" data-h="m_${k}"><span>${t}</span><b><em id="m_${k}" style="font-style:normal">–</em> <small>${u}</small></b></div>`).join('');
const ema = (k, v) => (disp[k] = disp[k] == null || !Number.isFinite(disp[k]) ? v : disp[k] + (v - disp[k]) * 0.35);
function metrics() {
  const E = L.ENGINES[cfg.eng], prop = !!geo.veh.prop, showT = { fi: cfg.fi !== 'na', two: geo.two, vlv: !geo.two && !geo.rot, ers: !!E.ers, tc: cfg.trans === 'auto8' || (cfg.trans === 'cvt' && geo.veh.car), liq: inp.cool === 'liquid', prop, nprop: !prop };
  document.querySelectorAll('.met [data-tag]').forEach(d => { const t = d.dataset.tag; d.style.display = !t || showT[t] ? '' : 'none'; });
  bars();
  if (!st) return;
  const th = st.heat || {}, o = L.TH.OILS[inp.oil];
  const s = { ...st, kmh: Math.abs(st.kmh), kml: st.lph > 0.05 && Math.abs(st.kmh) > 1 ? Math.abs(st.kmh) / st.lph : 0, apmax: st.apmax > geo.cyc / 2 ? st.apmax - geo.cyc : st.apmax,
    ratio: st.dl ? Math.abs(st.dl.r) : 0, sr: st.dl ? st.dl.sr * 100 : 0, floatRpm: geo.floatRpm || 0,
    tCool: th.cool, tOil: th.oil, pOil: th.pOil, visc: L.TH.nu(o, (th.oil || 25) + 273.15), lvlC: (th.lvlC || 0) * 100,
    thrust: st.dl ? st.dl.thrust / 9.81 : 0, prpm: Math.abs(st.ww || 0) * 30 / Math.PI, tip: Math.abs(st.ww || 0) * (geo.veh.propD || 0) / 2 / 340 };
  for (const [k, , , d] of MET) if (k !== '#') $('m_' + k).textContent = k === 'floatRpm' && !geo.floatRpm ? 'nunca' : fmt(k === 'pops' ? s[k] : ema(k, s[k]), d);
  $('m_kn').parentNode.style.color = $('m_kI').parentNode.style.color = st.kn > 0 ? 'var(--bad)' : '';
  $('m_flt').parentNode.style.color = st.flt > 0.2 ? 'var(--bad)' : '';
  $('m_pOil').parentNode.style.color = th.pOil < 0.5 && st.rpm > 300 ? 'var(--bad)' : '';
  $('bcv').textContent = fmt(Math.max(0, ema('cv', s.cv)), 1); $('btq').textContent = fmt(Math.max(0, ema('tq', s.tq)), 1);  // freio-motor não é potência
  // motor travado / avarias
  const fail = th.fail || '';
  if (th.seized) { $('failMsg').textContent = fail; $('fail').style.display = 'block'; }
  else if (fail && $('status').dataset.f !== fail) { $('status').dataset.f = fail; say('⚠ ' + fail, true); }
}
// barras de temperatura (cor pela faixa normal/perigo de cada peça) e de desgaste (fração do limite)
const TB = [ // chave, nome, normal até, perigo a partir de
  ['cool', 'Líquido', 105, 120, 'liq'], ['oil', 'Óleo', 125, 145], ['head', 'Cabeçote', 180, 260], ['lin', 'Cilindro', 170, 260], ['pis', 'Pistão', 300, 360],
  ['ev', 'Válv. escape', 760, 900], ['brg', 'Bronzinas', 150, 220], ['gbo', 'Óleo câmbio', 110, 150, 'car'], ['clu', 'Embreagem', 180, 300], ['tb', 'Turbo', 250, 380, 'turbo'],
];
const heatCol = (v, ok, bad) => v < 40 ? '#3b82f6' : v < ok ? '#3ecf8e' : v < bad ? '#ffb020' : '#ff5252';
function bars() {
  const th = st && st.heat, car = !!geo.veh.car, turbo = cfg.fi === 'turbo', liq = inp.cool === 'liquid';
  if (!$('tbars').childElementCount) {
    $('tbars').innerHTML = TB.map(([k, n, , , t]) => `<div class="hb" id="t_${k}" data-tag="${t || ''}"><span>${n}</span><i><u></u></i><b>–</b></div>`).join('');
    $('wbars').innerHTML = Object.entries(L.TH.PARTS).map(([k, p]) => `<div class="hb" id="w_${k}" data-h="w_${k}"><span title="${p.nome}">${p.c}</span><i><u></u></i><b>–</b><small></small></div>`).join('');
  }
  const showT = { liq, car, turbo };
  for (const [k, , ok, bad, t] of TB) {
    const el = $('t_' + k); el.style.display = !t || showT[t] ? '' : 'none';
    if (!th) continue;
    const v = th[k], u = el.querySelector('u');
    u.style.width = clamp(v / (bad * 1.15) * 100, 2, 100) + '%'; u.style.background = heatCol(v, ok, bad);
    el.querySelector('b').textContent = fmt(v, 0) + ' °C';
  }
  $('tnote').textContent = th ? (th.boil ? 'FERVENDO' : th.fan ? 'ventoinha ligada' : '') : '';
  for (const [k, p] of Object.entries(L.TH.PARTS)) {
    const el = $('w_' + k), hide = (k === 'turbo' && !turbo) || ((k === 'engren' || k === 'sincro') && !car && cfg.trans !== 'seq');
    el.style.display = hide ? 'none' : '';
    if (!th || hide) continue;
    const w = th.wear[k], frac = w / (p.lim * 1e6), lam = th.lam[k], rate = th.rate[k], u = el.querySelector('u');
    u.style.width = clamp(frac * 100, 1.5, 100) + '%';
    u.style.background = frac > 0.7 ? '#ff5252' : lam < 1 ? '#ff5252' : lam < 3 ? '#ffb020' : '#3ecf8e';
    el.querySelector('b').textContent = w < 10 ? fmt(w, 2) + ' µm' : fmt(w, 0) + ' µm';
    el.querySelector('small').textContent = lam < 8.9 ? `λ ${fmt(lam, 1)} · ${L.TH.regime(lam)} · ${rate < 0.001 ? '≈0' : fmt(rate, rate < 1 ? 3 : 1)} µm/h` : (k === 'sincro' || k === 'embreag') && rate > 0 ? `${fmt(rate, 1)} µm/h` : '';
  }
  $('wnote').textContent = th ? `pressão ${fmt(th.pOil, 1)} bar` : '';
}
const gearTxt = s => { // N, R, 1..8, D3/M3 (automático), D (CVT)
  if (s && s.dl && s.dl.type === 'prop') return 'H';                         // hélice
  if (!s || !s.gear) return 'N';
  if (s.gear < 0) return 'R';
  const d = s.dl || {};
  return d.type === 'cvt' ? 'D' : d.type === 'auto8' ? (d.mode === 'M' ? 'M' : 'D') + s.gear : String(s.gear);
};

// ---------- gráficos ----------
function ctx2d(c) {
  const r = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
  const x = c.getContext('2d'); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
  x.font = '10px system-ui'; x.lineJoin = 'round';
  return [x, w, h];
}
function frame2d(x, w, h, x0, x1, y0, y1, xl, yl) {
  const l = 34, r = 8, t = 8, b = 20, X = v => l + (v - x0) / (x1 - x0) * (w - l - r), Y = v => h - b - (v - y0) / (y1 - y0) * (h - t - b);
  x.strokeStyle = '#1f2a36'; x.fillStyle = '#7d8b99'; x.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yv = y0 + (y1 - y0) * i / 4, xv = x0 + (x1 - x0) * i / 4;
    x.beginPath(); x.moveTo(l, Y(yv)); x.lineTo(w - r, Y(yv)); x.stroke();
    x.textAlign = 'right'; x.fillText(fmt(yv, 0), l - 4, Y(yv) + 3);
    x.textAlign = 'center'; x.fillText(fmt(xv, 0), X(xv), h - 6);
  }
  x.textAlign = 'left'; x.fillText(yl, l + 4, t + 10); x.textAlign = 'right'; x.fillText(xl, w - r, h - b - 4);
  return [X, Y];
}
function drawCycle() {
  const [x, w, h] = ctx2d($('pv')), C = geo.cyc;
  if (!tr || tr.p.length !== C) { x.fillStyle = '#7d8b99'; x.fillText('Ligue o motor para ver o ciclo.', 12, 20); return; }
  let pm = 0, vm = 0;
  for (let i = 0; i < C; i++) { pm = Math.max(pm, tr.p[i]); vm = Math.max(vm, tr.v[i]); }
  pm = Math.ceil(pm * 1.1 / 10) * 10 || 10;
  x.strokeStyle = '#ff7a1a'; x.lineWidth = 1.6; x.beginPath();
  if (!pvMode) {
    const [X, Y] = frame2d(x, w, h, 0, Math.ceil(vm / 50) * 50, 0, pm, 'volume (cc)', 'pressão (bar)');
    for (let i = 0; i <= C; i++) { const j = i % C; i ? x.lineTo(X(tr.v[j]), Y(tr.p[j])) : x.moveTo(X(tr.v[j]), Y(tr.p[j])); }
    x.stroke();
  } else {
    const [X, Y] = frame2d(x, w, h, -C / 2, C / 2, 0, pm, 'ângulo (° DPMS)', 'pressão (bar)');
    for (let a = -C / 2; a < C / 2; a++) { const j = (a + C) % C; a > -C / 2 ? x.lineTo(X(a), Y(tr.p[j])) : x.moveTo(X(a), Y(tr.p[j])); }
    x.stroke();
    const mark = (a, c, t, y) => { x.strokeStyle = c; x.fillStyle = c; x.lineWidth = 1; x.beginPath(); x.moveTo(X(a), Y(0)); x.lineTo(X(a), Y(pm)); x.stroke(); x.textAlign = 'center'; x.fillText(t, X(a), y); };
    if (st) mark(-st.adv, '#fff3a0', 'faísca', 30);
    mark(geo.ivc - C, '#4ea1ff', 'fecha adm.', 18); mark(geo.evo, '#c77d5a', 'abre esc.', 18);
  }
}
function drawDyno() {
  const [x, w, h] = ctx2d($('dyn'));
  if (!dyn.length) { x.fillStyle = '#7d8b99'; x.fillText('Clique em “Dinamômetro” para medir a curva.', 12, 20); $('dynTxt').textContent = ''; return; }
  const all = dynPrev ? dyn.concat(dynPrev) : dyn, cvM = Math.ceil(Math.max(...all.map(p => p.cv)) * 1.1 / 10) * 10;
  const tqM = Math.ceil(Math.max(...all.map(p => p.tq)) * 1.1 / 10) * 10, x1 = Math.ceil(geo.limit / 1000) * 1000;
  const [X, Y] = frame2d(x, w, h, 0, x1, 0, cvM, 'rpm', `cv  /  N·m (azul, escala ${tqM})`);
  const line = (pts, f, c, dash) => { x.strokeStyle = c; x.setLineDash(dash || []); x.lineWidth = 1.8; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(X(p.rpm), Y(f(p))) : x.moveTo(X(p.rpm), Y(f(p)))); x.stroke(); x.setLineDash([]); };
  if (dynPrev) { line(dynPrev, p => p.cv, '#5b6672', [4, 4]); line(dynPrev, p => p.tq / tqM * cvM, '#3b4652', [4, 4]); }
  line(dyn, p => p.cv, '#ff7a1a'); line(dyn, p => p.tq / tqM * cvM, '#4ea1ff');
  const pk = (a, k) => a.reduce((m, p) => p[k] > m[k] ? p : m);
  const P = pk(dyn, 'cv'), T = pk(dyn, 'tq'), kn = dyn.filter(p => p.kn > 0), bmax = Math.max(...dyn.map(p => p.boost));
  let t = `Pico: <b>${fmt(P.cv, 1)} cv</b> @ ${fmt(P.rpm, 0)} rpm · <b>${fmt(T.tq, 1)} N·m</b> @ ${fmt(T.rpm, 0)} rpm`;
  if (bmax > 10) t += ` · pressão máx. ${fmt(bmax / 100, 2)} bar`;
  if (dynPrev) t += ` · anterior (tracejado): ${fmt(pk(dynPrev, 'cv').cv, 1)} cv`;
  if (kn.length) t += `<br><span style="color:var(--bad)">Detonação entre ${fmt(kn[0].rpm, 0)} e ${fmt(kn[kn.length - 1].rpm, 0)} rpm</span>`;
  $('dynTxt').innerHTML = t;
}

// ---------- conta-giros + luzes do painel ----------
function drawTach(now) {
  const c = $('tach'), x = c.getContext('2d'), cx = 240, cy = 240, R = 195;
  const max = Math.ceil((geo.limit + 1000) / 1000) * 1000, a0 = Math.PI * 0.75, ang = v => a0 + Math.PI * 1.5 * clamp(v / max, 0, 1);
  tachRpm += ((st ? st.rpm : 0) - tachRpm) * 0.5;
  x.clearRect(0, 0, 480, 480);
  x.fillStyle = '#0b0f14d8'; x.beginPath(); x.arc(cx, cy, R + 30, 0, 2 * Math.PI); x.fill();
  x.lineWidth = 14; x.strokeStyle = '#ff4d4d'; x.beginPath(); x.arc(cx, cy, R - 7, ang(geo.limit), ang(max)); x.stroke();
  x.strokeStyle = '#3ecf8e'; x.beginPath(); x.arc(cx, cy, R - 45, a0, a0 + Math.PI * 1.5 * inp.tps); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const step = max > 10000 ? 1000 : 500;
  for (let v = 0; v <= max; v += step / 2) {
    const a = ang(v), big = v % step === 0, r0 = R - (big ? 28 : 16);
    x.strokeStyle = '#c9d4de'; x.lineWidth = big ? 4 : 2;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke();
    if (big && v % 1000 === 0) { x.fillStyle = '#c9d4de'; x.font = '600 24px system-ui'; x.fillText(v / 1000, cx + Math.cos(a) * (R - 50), cy + Math.sin(a) * (R - 50)); }
  }
  const a = ang(tachRpm);
  x.strokeStyle = '#ff7a1a'; x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx - Math.cos(a) * 22, cy - Math.sin(a) * 22); x.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); x.stroke();
  x.fillStyle = '#ff7a1a'; x.beginPath(); x.arc(cx, cy, 12, 0, 2 * Math.PI); x.fill();
  const gear = gearTxt(st);
  x.fillStyle = gear === 'N' ? '#3ecf8e' : gear === 'R' ? '#ff9a3c' : '#fff'; x.font = `700 ${gear.length > 1 ? 60 : 74}px system-ui`; x.fillText(gear, cx, cy + 78);
  x.fillStyle = '#d7e1ea'; x.font = '600 26px system-ui'; x.fillText(`${fmt(tachRpm, 0)} rpm`, cx, cy + 134);
  x.fillStyle = '#7d8b99'; x.font = '600 22px system-ui'; x.fillText(`${fmt(st ? Math.abs(st.kmh) : 0, 0)} km/h`, cx, cy + 166);
  if (st && st.fi !== 'na') { x.fillStyle = st.boost > 0 ? '#ffb020' : '#7d8b99'; x.font = '600 20px system-ui'; x.fillText(`${st.boost > 0 ? '+' : ''}${fmt(st.boost / 100, 2)} bar`, cx, cy - 40); }
  if (st && st.kn > 0) knockT = now + 600;
  const lamp = (on, t, y, col) => { if (!on) return; x.fillStyle = col; x.font = '700 19px system-ui'; x.fillText(t, cx, y); };
  const th = st && st.heat;
  lamp(st && st.cut, 'LIMITADOR', cy - 70, '#ff4d4d');
  lamp(st && st.flt > 0.2, 'VÁLVULAS FLUTUANDO', cy - 70, '#ff4d4d');
  lamp(now < knockT, 'DETONAÇÃO', cy - 96, '#ffb020');
  lamp(st && st.starter, 'PARTIDA', cy - 122, '#4ea1ff');
  lamp(!inp.ign, 'IGNIÇÃO DESLIGADA', cy - 122, '#7d8b99');
  // luzes de painel: temperatura e óleo
  if (th) {
    const hot = th.boil || th.cool > 112 || th.head > 250, oilL = th.pOil < 0.5 && st.rpm > 300;
    x.font = '700 16px system-ui';
    x.fillStyle = hot ? '#ff4d4d' : '#3a4654'; x.fillText('TEMP', cx - 62, cy + 30);
    x.fillStyle = oilL ? '#ff4d4d' : '#3a4654'; x.fillText('ÓLEO', cx + 62, cy + 30);
    x.fillStyle = '#7d8b99'; x.font = '600 15px system-ui'; x.fillText(`${fmt(th.cool, 0)} °C`, cx - 62, cy + 50); x.fillText(`${fmt(th.pOil, 1)} bar`, cx + 62, cy + 50);
  }
  if (st && st.ts < 1) { x.fillStyle = '#4ea1ff'; x.font = '600 18px system-ui'; x.fillText(`câmera lenta 1:${Math.round(1 / st.ts)}`, cx, cy + 196); }
  if (st && st.cpu > 0.55) { x.fillStyle = '#ffb020'; x.font = '600 14px system-ui'; x.fillText(`CPU do áudio ${Math.round(st.cpu * 100)}% — física em passo simples`, cx, cy + 222); }
}

// ---------- ordem de explosão (canto da tela) ----------
// cada cilindro na sua posição (linha, V, boxer, estrela do radial, fileiras do W), colorido pelo tempo em que está e
// piscando na faísca; embaixo, a sequência e o intervalo entre explosões.
const PH4 = [['#ff7a1a', 'expansão'], ['#9b7b6a', 'escape'], ['#4ea1ff', 'admissão'], ['#a07cff', 'compressão']];
function drawFire() {
  const c = $('fire'), x = c.getContext('2d'), W = 520, H = 300, C = geo.cyc, lay = geo.lay, n = lay.length;
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#0b0f14d0'; x.beginPath(); x.roundRect ? x.roundRect(0, 0, W, H, 18) : x.rect(0, 0, W, H); x.fill();
  const order = lay.map((l, i) => [l.off, i]).sort((a, b) => a[0] - b[0]), seq = order.map(o => o[1] + 1);
  const gaps = order.map((o, i) => ((order[(i + 1) % n][0] - o[0]) % C + C) % C), even = gaps.every(g => Math.abs(g - C / n) < 1);
  x.fillStyle = '#8494a5'; x.font = '600 20px system-ui'; x.textAlign = 'left'; x.fillText(geo.rot ? 'ORDEM DE QUEIMA (FACES)' : 'ORDEM DE EXPLOSÃO', 18, 30);
  // posições
  const pos = [], R0 = 20;
  if (geo.E.fam === 'radial') {
    const rows = geo.E.rows || 1;
    lay.forEach(l => { const r = 62 + (l.row || 0) * 34 * (rows > 1 ? 1 : 0), a = (l.bank - 90) * Math.PI / 180; pos.push([W / 2 + r * Math.cos(a) * 1.25, 132 + r * Math.sin(a)]); });
  } else if (geo.rot) {
    lay.forEach((l, i) => { const r = l.rotor, nr = geo.n, a = (l.face * 120 - 90) * Math.PI / 180; pos.push([W / 2 + (r - (nr - 1) / 2) * 110 + 34 * Math.cos(a), 128 + 34 * Math.sin(a)]); });
  } else {
    const banks = [...new Set(lay.map(l => l.bank))].sort((a, b) => a - b), xs = lay.map(l => l.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    lay.forEach(l => { const b = banks.indexOf(l.bank), nb = banks.length; pos.push([W / 2 + (x1 > x0 ? (l.x - (x0 + x1) / 2) / (x1 - x0) : 0) * Math.min(W - 90, 60 * n / Math.max(1, nb)), 128 + (nb > 1 ? (b - (nb - 1) / 2) * Math.min(52, 150 / nb) : 0)]); });
  }
  const r = Math.max(9, Math.min(R0, 300 / n)), spkA = st ? st.adv : 15;
  lay.forEach((l, i) => {
    const tc = ((thv - l.off) % C + C) % C, ph = geo.two ? (tc < 180 ? 0 : 3) : Math.floor(tc / (C / 4)) % 4, spk = (C - spkA + C) % C;
    const fire = st && st.fired && ((tc - spk + C) % C) < Math.max(30, C / n * 0.6);
    const [px, py] = pos[i];
    if (fire) { const g = x.createRadialGradient(px, py, 0, px, py, r * 2.4); g.addColorStop(0, 'rgba(255,240,170,0.95)'); g.addColorStop(1, 'rgba(255,140,40,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r * 2.4, 0, 7); x.fill(); }
    x.fillStyle = fire ? '#fff3c0' : PH4[ph][0]; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    x.fillStyle = '#0b0f14'; x.font = `700 ${Math.round(r * 1.05)}px system-ui`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), px, py + 1);
  });
  x.textBaseline = 'alphabetic';
  const txt = seq.join('-'); let fs = 24; x.font = `700 ${fs}px system-ui`; while (x.measureText(txt).width > W - 36 && fs > 12) { fs--; x.font = `700 ${fs}px system-ui`; }
  x.fillStyle = '#ffb347'; x.textAlign = 'center'; x.fillText(txt, W / 2, H - 46);
  x.fillStyle = '#8494a5'; x.font = '500 17px system-ui';
  x.fillText(even ? `uma explosão a cada ${fmt(C / n, 0)}° do ${geo.rot ? 'eixo' : 'virabrequim'}` : `irregular: ${order.map(o => fmt(o[0], 0) + '°').join(', ')}`, W / 2, H - 20);
  // legenda das cores
  x.font = '500 15px system-ui'; x.textAlign = 'left'; let lx = W - 200;
  (geo.two ? [PH4[0], PH4[3]] : PH4).forEach(([col, nm], k) => { x.fillStyle = col; x.fillRect(lx, 18 + k * 16 - 9, 10, 10); x.fillStyle = '#8494a5'; x.fillText(geo.two ? (k ? 'lavagem/compressão' : 'expansão/escape') : nm, lx + 16, 18 + k * 16); });
}

// ---------- demonstrações guiadas ----------
// Cada passo mexe nos controles de verdade (o resultado é a física calculando, não um vídeo), explica e mostra os números ao vivo.
const setCtl = (id, v) => { const el = $(id); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const setTs = v => { $('ts').value = v; send({ ts: v }); };
const dset = (id, v) => { if (!(id in DEM.saved)) DEM.saved[id] = $(id).type === 'checkbox' ? $(id).checked : $(id).value; setCtl(id, v); };   // demonstração: lembra o original
const clutchShift = d => { const t = $('thr').value; setCtl('thr', 0); keys.clutch = true; setTimeout(() => { send({ shift: d }); setTimeout(() => { keys.clutch = false; setCtl('thr', t); }, 300); }, 200); };   // tira o pé, embreagem, troca, volta
const phaseNow = () => { if (!st || geo.rot || geo.two) return ''; const C = geo.cyc, tc = ((thv - geo.lay[0].off) % C + C) % C; return ['expansão', 'escape', 'admissão', 'compressão'][Math.floor(tc / 180) % 4]; };
const H0 = () => st && st.heat || {};
const DEMOS = {
  tempos: { nome: 'Os 4 tempos (câmara em câmera lenta)', ok: () => !geo.rot && !geo.two, steps: [
    { cap: 'Câmera lenta 1:200 com o motor em marcha lenta. Acompanhe o cilindro 1 (as cores das partículas são as moléculas: azul O₂, cinza N₂, laranja gasolina).', run: () => { dset('thr', 0); setFocus('chamber'); setTs(0.005); }, dur: 5 },
    { phase: 'admissão', cap: '<b>1 · Admissão</b>: o pistão desce e a válvula de admissão está aberta. A depressão puxa ar e combustível para dentro.' },
    { phase: 'compressão', cap: '<b>2 · Compressão</b>: as duas válvulas fechadas, o pistão sobe e esmaga a mistura. Ela esquenta (veja T subir). Perto do topo a vela solta a faísca.' },
    { phase: 'expansão', cap: '<b>3 · Expansão (explosão)</b>: a chama atravessa a câmara, a pressão dispara e empurra o pistão para baixo. É o único tempo que gera força.' },
    { phase: 'escape', cap: '<b>4 · Escape</b>: a válvula de escape abre antes do fundo; o pistão sobe empurrando o gás queimado (CO₂ e H₂O) para o coletor. Depois tudo recomeça: 2 voltas do virabrequim por ciclo.' },
    { cap: 'Repare no cruzamento: no fim do escape as duas válvulas ficam abertas ao mesmo tempo — o gás saindo ajuda a puxar a mistura nova. Pronto! Volte ao tempo real quando quiser.', run: () => {}, dur: 8 } ],
    live: () => `θ ${fmt(st && tr ? ((thv - geo.lay[0].off) % geo.cyc + geo.cyc) % geo.cyc : 0, 0)}° · <b>${phaseNow()}</b> · p ${fmt(tr ? tr.p[(((thv - geo.lay[0].off) % geo.cyc + geo.cyc) % geo.cyc) | 0] : 0, 1)} bar · T ${fmt(tr ? tr.T[(((thv - geo.lay[0].off) % geo.cyc + geo.cyc) % geo.cyc) | 0] : 0, 0)} K` },
  detona: { nome: 'Detonação (gasolina ruim + avanço)', ok: () => !geo.two, steps: [
    { cap: 'A ECU foi calibrada para o combustível atual. Agora vamos trocar por <b>gasolina RON 88</b> sem recalibrar e adiantar a faísca 8°.', run: () => { setFocus('chamber'); setTs(1); DEM.fuel0 = cfg.fuel; DEM.soff0 = $('soff').value; dset('fuel', 'ron88'); dset('soff', 8); dset('thr', 0); }, dur: 5 },
    { cap: 'Acelerador a fundo: na compressão a mistura que a chama ainda não alcançou esquenta tanto que <b>explode sozinha</b> (detonação). Ouça o "tlec" metálico; a pressão oscila na câmara.', run: () => dset('thr', 100), dur: 8 },
    { cap: 'O sensor de detonação percebe e a ECU <b>atrasa a ignição</b> (veja o atraso subir): protege o pistão, mas perde potência e esquenta o escape.', dur: 8 },
    { cap: 'Combustível e avanço originais de volta.', run: () => { dset('thr', 0); dset('fuel', DEM.fuel0 || 'e0_95'); dset('soff', DEM.soff0 || 0); }, dur: 4 } ],
    live: () => `${fmt(st && st.rpm, 0)} rpm · índice de detonação <b>${fmt(st && st.kI, 2)}</b> · atraso do sensor ${fmt(st && st.kr, 1)}° · faísca ${fmt(st && st.adv, 1)}°` },
  lag: { nome: 'Turbo lag e válvula de alívio', ok: () => cfg.fi === 'turbo', need: 'um motor com turbo', steps: [
    { cap: 'Em marcha lenta a turbina gira devagar: pouco gás de escape, quase nenhuma pressão.', run: () => { setFocus('turbo'); setTs(1); dset('thr', 0); }, dur: 5 },
    { cap: '<b>Pé no fundo</b>: o motor acelera na hora, mas a pressão demora — a turbina precisa de vazão de escape para ganhar giro. Esse atraso é o turbo lag.', run: () => dset('thr', 100), dur: 5 },
    { cap: '<b>Solta o acelerador</b>: a borboleta fecha com o compressor ainda soprando. A válvula de alívio abre (o "tsss") para o ar não voltar e travar o rotor.', run: () => dset('thr', 0), dur: 6 } ],
    live: () => `${fmt(st && st.rpm, 0)} rpm · eixo do turbo <b>${fmt(st && st.trpm, 0)} rpm</b> · pressão ${fmt(st && st.boost, 0)} kPa · wastegate ${fmt(st && st.wg, 0)}%` },
  calor: { nome: 'Superaquecimento sem arrefecimento', ok: () => true, steps: [
    { cap: 'Vamos desligar o arrefecimento e acelerar o relógio térmico ×60 (cada segundo = um minuto). Mapa de calor: azul frio → verde normal → vermelho perigo.', run: () => { setFocus('cooling'); setTs(1); dset('tk', 60); dset('cool', 'none'); dset('thr', 45); }, dur: 6 },
    { cap: 'Sem o líquido levando o calor, cabeçote e cilindro sobem sem parar. Acima de ~140 °C de parede a mistura começa a detonar; o pistão dilata e come a folga.', dur: 15 },
    { cap: 'Se continuar, o pistão encosta no cilindro e <b>engripa</b>. Arrefecimento religado e relógio normal — use <b>Remontar motor</b> se travou.', run: () => { demoRestore(); if (H0().seized) rebuild(); }, dur: 5 } ],
    live: () => { const h = H0(); return `cabeçote <b>${fmt(h.head, 0)} °C</b> · cilindro ${fmt(h.lin, 0)} · pistão ${fmt(h.pis, 0)} · líquido ${fmt(h.cool, 0)} °C`; } },
  oleo: { nome: 'Motor sem óleo', ok: () => !geo.two, steps: [
    { cap: 'Bronzinas coloridas pelo regime de lubrificação (verde = película inteira). Vamos tirar todo o óleo.', run: () => { setFocus('oil'); setTs(1); DEM.oil0 = $('oilLvl').value; dset('oilLvl', 0); dset('thr', 30); }, dur: 5 },
    { cap: 'A bomba puxa ar: a pressão cai a zero. A película que sobrou entre a bronzina e o eixo se esvai em segundos e o metal começa a tocar (âmbar → vermelho).', dur: 12 },
    { cap: 'Atrito metal-metal: a bronzina passa de ~240 °C e a liga derrete — o motor trava. Óleo de volta (use <b>Remontar motor</b> se travou).', run: () => { demoRestore(); if (H0().seized) rebuild(); }, dur: 5 } ],
    live: () => { const h = H0(); return `pressão <b>${fmt(h.pOil, 1)} bar</b> · película ${fmt((h.film || 0) * 100, 0)}% · bronzinas ${fmt(h.brg, 0)} °C · λ ${fmt(h.lam && h.lam.biela, 1)}`; } },
  escape: { nome: 'Pulsos e ondas no escape', ok: () => true, steps: [
    { cap: 'Câmera lenta 1:50. Cada cor é o gás de um cilindro saindo na ordem de explosão (veja o quadro no canto) e se encontrando no coletor.', run: () => { setFocus('exhaust'); setTs(0.02); dset('thr', 20); }, dur: 8 },
    { cap: 'Os anéis claros são ondas de pressão (o som) a ~500 m/s. Na junção parte delas volta como depressão (azul) e ajuda a esvaziar o próximo cilindro — por isso o comprimento dos tubos muda a potência.', dur: 10 },
    { cap: 'Trocando para <b>escape direto</b> (sem abafador): ouça e compare, o pulso chega à ponteira quase sem perder energia.', run: () => { DEM.exh0 = $('exh').value; setTs(1); dset('exh', 'straight'); }, dur: 8 },
    { cap: 'Escape original de volta.', run: () => { dset('exh', DEM.exh0 || 'stock'); dset('thr', 0); }, dur: 3 } ],
    live: () => `${fmt(st && st.rpm, 0)} rpm · gás a ${fmt(st && st.egt, 0)} °C · pressão no coletor ${fmt(st && st.pt, 0)} kPa` },
  flutua: { nome: 'Flutuação de válvulas (sem limitador)', ok: () => !geo.two && !geo.rot, steps: [
    { cap: () => `Limitador desligado. Este motor tem ${geo.E.desmo ? 'comando <b>desmodrômico</b> — a válvula é fechada pelo came, não por mola: não deve flutuar' : geo.E.pneumatic ? '<b>molas pneumáticas</b>, que aguentam muito giro' : `molas que deixam a válvula "voar" a partir de ~${fmt(geo.floatRpm, 0)} rpm`}.`, run: () => { setFocus('chamber'); setTs(1); DEM.lim0 = $('lim').value; dset('lim', 'off'); dset('thr', 0); }, dur: 6 },
    { cap: 'A fundo, sem corte: acima do giro de flutuação a inércia da válvula vence a mola — ela não acompanha o came e quica na sede (os cliques metálicos). A potência cai e, na vida real, a válvula pode bater no pistão.', run: () => dset('thr', 100), dur: 7 },
    { cap: 'Limitador de volta.', run: () => { dset('thr', 0); dset('lim', DEM.lim0 || 'fuel'); }, dur: 3 } ],
    live: () => `${fmt(st && st.rpm, 0)} rpm · flutuação a partir de ${geo.E.desmo ? '— (desmo)' : fmt(geo.floatRpm, 0) + ' rpm'} · válvula fora do came <b>${fmt(st && st.flt, 2)} mm</b>` },
  marcha: { nome: 'Trocas de marcha no câmbio', ok: () => cfg.trans !== 'prop', steps: [
    { cap: 'Câmbio em foco. Primeira engatada: a engrenagem acesa mostra por onde a força passa.', run: () => { setFocus('gearbox'); setTs(1); dset('thr', 0); if (!st || !st.gear) clutchShift(1); }, dur: 4 },
    { cap: 'Acelerando e soltando a embreagem: a entrada gira com o motor, a saída mais devagar (a relação da 1ª multiplica o torque).', run: () => dset('thr', 45), dur: 4 },
    { cap: 'Troca para a 2ª: a luva (ou a embreagem do planetário) solta uma engrenagem e trava a outra; o giro do motor cai para casar com a nova relação.', run: () => clutchShift(1), dur: 4 },
    { cap: 'E a 3ª.', run: () => clutchShift(1), dur: 4 },
    { cap: 'Soltando o acelerador.', run: () => dset('thr', 0), dur: 3 } ],
    live: () => `marcha <b>${st ? gearTxt(st) : '–'}</b> · ${fmt(st && st.rpm, 0)} rpm · ${fmt(st && Math.abs(st.kmh), 0)} km/h` },
};
const DEM = { k: null, i: -1, t0: 0, auto: true, seen: false, saved: {} };
function demoRestore() { for (const [id, v] of Object.entries(DEM.saved)) setCtl(id, v); DEM.saved = {}; }
Object.entries(DEMOS).forEach(([k, d]) => { const o = document.createElement('option'); o.value = k; o.textContent = d.nome; $('demoSel').appendChild(o); });
$('demoSel').onchange = async () => { const k = $('demoSel').value; $('demoSel').value = ''; if (k) startDemo(k); };
async function startDemo(k) {
  const d = DEMOS[k];
  if (!d.ok()) { say(`Esta demonstração precisa de ${d.need || 'outro tipo de motor'} — escolha uma configuração pronta adequada.`, true); return; }
  if (DEM.k) stopDemo();
  if (st && st.heat && st.heat.seized) { rebuild(); st = null; await new Promise(r => setTimeout(r, 400)); }   // travou numa demonstração anterior
  if (!started || !inp.ign || !st || st.rpm < 200) {                     // liga e espera pegar
    await start(); say('Ligando o motor para a demonstração…');
    for (let t = 0; t < 80 && !(st && st.fired > 0 && !st.starter && st.rpm > 0.7 * geo.idle); t++) await new Promise(r => setTimeout(r, 100));
  }
  Object.assign(DEM, { k, i: -1, auto: true, saved: {} }); say(`Demonstração: <b>${d.nome}</b> — os controles mudam sozinhos; ao sair tudo volta como estava.`); demoStep(1);
}
function demoStep(di) {
  const d = DEMOS[DEM.k]; if (!d) return;
  DEM.i = clamp(DEM.i + di, 0, d.steps.length - 1); DEM.t0 = performance.now(); DEM.seen = false;
  const s = d.steps[DEM.i]; if (s.run) s.run();
  $('demo').style.display = 'block'; demoDraw();
}
function stopDemo() { DEM.k = null; $('demo').style.display = 'none'; demoRestore(); setCtl('thr', 0); keys.clutch = false; }
function demoDraw() {
  const d = DEMOS[DEM.k]; if (!d) return; const s = d.steps[DEM.i], last = DEM.i === d.steps.length - 1;
  const el = performance.now() - DEM.t0, f = s.dur ? clamp(el / (s.dur * 1000), 0, 1) : s.phase ? (DEM.seen ? 1 : 0) : 0;
  $('demo').innerHTML = `<h3>${d.nome}</h3><p>${typeof s.cap === 'function' ? s.cap() : s.cap}</p><p class="live">${d.live()}</p>
    <div class="bar2"><i style="width:${(f * 100).toFixed(0)}%"></i></div>
    <div class="row"><button onclick="demoStep(-1)" ${DEM.i ? '' : 'disabled'}>◀</button><button onclick="DEM.auto=!DEM.auto;demoDraw()">${DEM.auto ? '❚❚ pausar' : '▶ automático'}</button>${last ? '' : '<button class="pri" onclick="demoStep(1)">Próximo ▶</button>'}<button onclick="stopDemo()">Sair</button><span class="pg">${DEM.i + 1}/${d.steps.length}</span></div>`;
}
function demoTick() { // avança sozinho: por tempo ou quando a fase do cilindro 1 chega (e passa)
  const d = DEMOS[DEM.k]; if (!d) return; const s = d.steps[DEM.i];
  if (DEM.auto && DEM.i < d.steps.length - 1) {
    const nx = d.steps[DEM.i + 1], el = performance.now() - DEM.t0, ph = phaseNow();
    if (nx.phase) { if (ph === nx.phase && el > (s.dur || 1.5) * 1000) return demoStep(1); }     // o texto troca junto com o tempo do cilindro 1
    else if (s.phase) { if (ph === s.phase) DEM.seen = true; else if (DEM.seen && el > 1500) return demoStep(1); }
    else if (s.dur && el > s.dur * 1000) return demoStep(1);
  }
  demoDraw();
}

// ---------- laço principal ----------
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  kThr = clamp(kThr + (keys.up ? dt / 0.12 : -dt / 0.08), 0, 1);
  inp.tps = Math.max(kThr, +$('thr').value / 100);
  inp.brake = keys.down ? 1 : 0;
  inp.clutch = keys.clutch ? 1 : Math.max(0, inp.clutch - dt / 0.6);   // soltar a embreagem leva ~0,6 s
  if (started) send({ inp: { tps: inp.tps, brake: inp.brake, clutch: inp.clutch } });
  if (tsBack && st && st.ts === 1 && !st.starter && st.fired > 0) { send({ ts: tsBack }); tsBack = 0; }
  const ts = st ? st.ts : +$('ts').value, C = geo.cyc;
  if (st) thv = (((st.th + st.rpm * 6 * ts * (now - stT) / 1000) % C) + C) % C;   // relógio da simulação, extrapolado entre relatórios
  const S = { thv, st, tr: tr && tr.p.length === C ? tr : null, tps: inp.tps, eoi: inp.eoi, dtv: dt * ts, dt, fuel: L.FUELS[cfg.fuel], pwDeg: st ? st.pw / 1000 * 6 * st.rpm : 0, inp };
  if (mode === '3d' && View3D) { View3D.update(S); View3D.render(dt); }
  if (mode === '2d' && now - bpT > 30) { bpT = now; Blueprint.draw($('c2d'), S, geo, $('preset').value ? L.PRESETS[$('preset').value].nome : L.ENGINES[cfg.eng].nome, sheet); }
  drawTach(now); drawFire();
  if (now - uiT > 120) { uiT = now; metrics(); drawCycle(); info(); Blueprint.record(st, +$('tk').value); demoTick(); }
  requestAnimationFrame(frame);
}

if (View3D) View3D.init($('c3d'));
else { setMode('2d'); $('v3d').disabled = true; }
$('preset').value = 'daytona'; applyPreset('daytona');
applyEngine();
drawDyno();
requestAnimationFrame(frame);
