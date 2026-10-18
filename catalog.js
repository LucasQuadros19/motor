// Catálogo: tipos de motor (nomeados pela arquitetura, números publicados em `ref`), configurações
// prontas de veículos famosos, combustíveis, escapamentos, câmbios e o gerador de layout (ordem de
// ignição, bancadas, moentes). Função para poder ser serializada para o AudioWorklet junto com a física.
function ENGINE_CATALOG() {
  'use strict';
  // relações: primária × marcha × final (carro: primária 1); embreagem em N·m no motor.
  // cd/lin/lex/ivc foram ajustados automaticamente para bater potência e torque de `ref`.
  // desmo: comando desmodrômico (não flutua); pneumatic: molas pneumáticas (F1); vf: flutuação = vf × corte
  const ENGINES = {
    i3_675: { nome: '3 em linha 675 cc · moto esportiva', grupo: 'Motos', fam: 'inline', cyl: 3, cylOpts: [1, 2, 3, 4, 6], cc: 675,
      cr: 13.1, bs: 76 / 49.6, rod: 3.85, ivo: 40, ivc: 75, evo: 75, evc: 35, nv: 2, ivD: 0.41, evD: 0.35, ivL: 0.32, evL: 0.33, cd: 0.66,
      tb: 0.579, vr: 0.8, lin: 0.171, lex: 0.75, hdr: 0.5, wli: 0.75, wle: 0.7, limit: 14400, idle: 1300, inj: 260, J: 0.035, fi: 'na', boost: 0.6,
      veh: { primary: 1.848, final: 2.875, gears: [2.313, 1.857, 1.565, 1.35, 1.238, 1.136], wheel: 0.305, mass: 260, cda: 0.33, crr: 0.015, clutch: 220 },
      ref: { cv: 128, rpmP: 12500, nm: 74, rpmT: 11900 } },
    i4_1000: { nome: '4 em linha 1000 cc · superbike', grupo: 'Motos', fam: 'inline', cyl: 4, cylOpts: [2, 3, 4, 6], cc: 999,
      cr: 13.3, bs: 80 / 49.7, rod: 4.1, ivo: 40, ivc: 67, evo: 72, evc: 35, nv: 2, ivD: 0.42, evD: 0.34, ivL: 0.34, evL: 0.33, cd: 0.7,
      tb: 0.6, vr: 0.8, lin: 0.25, lex: 0.609, hdr: 0.5, wli: 0.75, wle: 0.7, limit: 14600, idle: 1200, inj: 300, J: 0.045, fi: 'na', boost: 0.8,
      veh: { primary: 1.652, final: 2.588, gears: [2.647, 2.091, 1.727, 1.5, 1.36, 1.261], wheel: 0.32, mass: 272, cda: 0.32, crr: 0.015, clutch: 330 },
      ref: { cv: 207, rpmP: 13500, nm: 113, rpmT: 11000 } },
    v2_1200: { nome: 'V2 90° 1200 cc · moto esportiva (desmo)', grupo: 'Motos', fam: 'v', vee: 90, cyl: 2, cylOpts: [2, 4], cc: 1198, desmo: true,
      cr: 12.7, bs: 106 / 67.9, rod: 3.65, ivo: 35, ivc: 78, evo: 70, evc: 35, nv: 2, ivD: 0.44, evD: 0.36, ivL: 0.3, evL: 0.3, cd: 0.62,
      tb: 0.6, vr: 0.8, lin: 0.32, lex: 0.9, hdr: 0.45, wli: 0.75, wle: 0.7, limit: 10700, idle: 1300, inj: 550, J: 0.06, fi: 'na', boost: 0.6,
      veh: { primary: 1.84, final: 2.4, gears: [2.466, 1.765, 1.35, 1.091, 0.958, 0.857], wheel: 0.32, mass: 260, cda: 0.34, crr: 0.015, clutch: 320 },
      ref: { cv: 170, rpmP: 9750, nm: 131, rpmT: 8000 } },
    v2_1870: { nome: 'V2 45° 1870 cc · custom', grupo: 'Motos', fam: 'v', vee: 45, cyl: 2, cylOpts: [2], cc: 1868, vf: 1.2, cool: 'oilair', oil: '20w50',
      cr: 10.5, bs: 102 / 114.3, rod: 3.3, ivo: 20, ivc: 73, evo: 50, evc: 15, nv: 2, ivD: 0.38, evD: 0.32, ivL: 0.27, evL: 0.27, cd: 0.64,
      tb: 0.42, vr: 0.6, plenum: 0.35, tbD: 0.055, lin: 0.378, lex: 1.322, hdr: 0.4, wli: 0.7, wle: 0.7, limit: 5600, idle: 850, inj: 320, J: 0.12, tw: 530, fi: 'na', boost: 0.5,
      veh: { primary: 1.45, final: 2.19, gears: [2.93, 2.03, 1.51, 1.22, 1.04, 0.88], wheel: 0.33, mass: 395, cda: 0.6, crr: 0.016, clutch: 450 },
      ref: { cv: 95, rpmP: 5000, nm: 155, rpmT: 3250 } },
    b2_1250: { nome: 'Boxer 2 cilindros 1250 cc · trail', grupo: 'Motos', fam: 'boxer', cyl: 2, cylOpts: [2, 4, 6], cc: 1254,
      cr: 12.5, bs: 102.5 / 76, rod: 3.29, ivo: 30, ivc: 60, evo: 60, evc: 25, nv: 2, ivD: 0.39, evD: 0.32, ivL: 0.3, evL: 0.3, cd: 0.74,
      tb: 0.51, vr: 0.9, lin: 0.402, lex: 1.035, hdr: 0.45, wli: 0.75, wle: 0.7, limit: 9000, idle: 1050, inj: 400, J: 0.06, fi: 'na', boost: 0.6,
      veh: { primary: 1.756, final: 2.91, gears: [2.438, 1.714, 1.296, 1.059, 0.943, 0.848], wheel: 0.334, mass: 324, cda: 0.55, crr: 0.016, clutch: 330 },
      ref: { cv: 136, rpmP: 7750, nm: 143, rpmT: 6250 } },
    s1_160: { nome: '1 cilindro 160 cc · moto street', grupo: 'Motos', fam: 'inline', cyl: 1, cylOpts: [1, 2], cc: 162, vf: 1.15, cool: 'air',
      cr: 9.5, bs: 57.3 / 63, rod: 3.6, ivo: 10, ivc: 80, evo: 40, evc: 10, nv: 1, ivD: 0.45, evD: 0.38, ivL: 0.27, evL: 0.27, cd: 0.84,
      tb: 0.45, vr: 1.0, lin: 0.296, lex: 0.596, hdr: 0.45, wli: 0.7, wle: 0.7, limit: 9000, idle: 1400, inj: 120, J: 0.014, tw: 520, fi: 'na', boost: 0.5,
      veh: { primary: 3.35, final: 2.5, gears: [3.083, 1.882, 1.4, 1.13, 0.96], wheel: 0.3, mass: 192, cda: 0.6, crr: 0.018, clutch: 50 },
      ref: { cv: 15.1, rpmP: 8000, nm: 14, rpmT: 6000 } },
    t2_125: { nome: '2 tempos 125 cc · moto de rua', grupo: 'Motos', fam: 'two', cyl: 1, cylOpts: [1, 2], cc: 125, cool: 'air',
      cr: 11.5, bs: 56 / 50.7, rod: 3.94, epo: 83, tpo: 124, exW: 1.03, trW: 1.27, ccv: 2.5, reedA: 1.037, cd: 0.7,
      pipe: { ld: 0.45, lb: 0.85, rd: -0.65, rb: 0.75 }, tb: 0.5, vr: 0.6, lin: 0.15, lex: 0.85, hdr: 0.62, wli: 0.7, wle: 0.75,
      limit: 11000, idle: 1500, inj: 600, J: 0.01, tw: 480, fi: 'na', boost: 0.5,
      veh: { primary: 3.5, final: 2.8, gears: [2.83, 1.875, 1.39, 1.13, 0.96, 0.84], wheel: 0.3, mass: 200, cda: 0.5, crr: 0.016, clutch: 60 },
      ref: { cv: 22, rpmP: 9500, nm: 17, rpmT: 8500 } },
    t2_350: { nome: '2 tempos 350 cc bicilíndrico · esportiva', grupo: 'Motos', fam: 'two', cyl: 2, cylOpts: [1, 2, 3], cc: 347,
      cr: 11, bs: 64 / 54, rod: 3.9, epo: 81, tpo: 122, exW: 0.87, trW: 1.39, ccv: 2.174, reedA: 0.864, cd: 0.7,
      pipe: { ld: 0.5, lb: 0.92, rd: -0.65, rb: 0.75 }, tb: 0.45, vr: 0.6, lin: 0.15, lex: 0.92, hdr: 0.6, wli: 0.7, wle: 0.75,
      limit: 10500, idle: 1300, inj: 800, J: 0.02, tw: 470, fi: 'na', boost: 0.5,
      veh: { primary: 3.0, final: 2.4, gears: [2.56, 1.75, 1.32, 1.1, 0.96, 0.88], wheel: 0.31, mass: 220, cda: 0.5, crr: 0.016, clutch: 120 },
      ref: { cv: 47, rpmP: 8500, nm: 40, rpmT: 8000 } },
    i4_2000: { nome: '4 em linha 2.0 aspirado · VTEC', grupo: 'Carros', fam: 'inline', cyl: 4, cylOpts: [3, 4, 6], cc: 1998,
      cr: 11.5, bs: 1.0, rod: 3.23, ivo: 35, ivc: 74, evo: 65, evc: 30, nv: 2, ivD: 0.41, evD: 0.35, ivL: 0.34, evL: 0.36, cd: 0.78,
      tb: 0.45, vr: 0.6, plenum: 1.2, tbD: 0.062, lin: 0.257, lex: 0.397, hdr: 0.4, wli: 0.7, wle: 0.7, limit: 8600, vvt: 30, idle: 800, inj: 310, J: 0.12, fi: 'na', boost: 0.8,
      veh: { primary: 1, final: 4.76, gears: [3.267, 2.13, 1.517, 1.147, 0.921, 0.738], wheel: 0.312, mass: 1345, cda: 0.62, crr: 0.012, clutch: 300, car: true },
      ref: { cv: 220, rpmP: 8000, nm: 206, rpmT: 7000 } },
    i4_2000e: { nome: '4 em linha 2.0 econômico · injeção direta', grupo: 'Carros', fam: 'inline', cyl: 4, cylOpts: [3, 4], cc: 1987, oil: '0w20',
      cr: 13, bs: 80.5 / 97.6, rod: 3.2, ivo: 20, ivc: 68, evo: 69, evc: 15, nv: 2, ivD: 0.39, evD: 0.33, ivL: 0.27, evL: 0.27, cd: 0.86,
      tb: 0.45, vr: 0.6, plenum: 1.3, tbD: 0.06, lin: 0.378, lex: 0.793, hdr: 0.38, wli: 0.7, wle: 0.7, limit: 6800, vvt: 40, idle: 700, inj: 250, J: 0.12, fi: 'na', boost: 0.8,
      veh: { primary: 1, final: 4.0, gears: [3.5, 2.1, 1.4, 1.0, 0.8, 0.65], wheel: 0.31, mass: 1380, cda: 0.62, crr: 0.012, clutch: 300, car: true },
      ref: { cv: 177, rpmP: 6600, nm: 210, rpmT: 4400 } },
    i6_3000t: { nome: '6 em linha 3.0 turbo', grupo: 'Carros', fam: 'inline', cyl: 6, cylOpts: [4, 6], cc: 2997,
      cr: 8.5, bs: 1.0, rod: 3.3, ivo: 20, ivc: 45, evo: 55, evc: 20, nv: 2, ivD: 0.4, evD: 0.34, ivL: 0.26, evL: 0.28, cd: 0.5,
      tb: 0.42, vr: 0.6, plenum: 1.0, tbD: 0.060, lin: 0.76, lex: 0.913, hdr: 0.4, wli: 0.65, wle: 0.6, limit: 6800, vvt: 30, idle: 750, inj: 440, J: 0.16, fi: 'turbo', boost: 0.7,
      veh: { primary: 1, final: 3.27, gears: [3.827, 2.36, 1.685, 1.312, 1.0, 0.793], wheel: 0.33, mass: 1585, cda: 0.6, crr: 0.012, clutch: 600, car: true },
      ref: { cv: 280, rpmP: 5600, nm: 431, rpmT: 3600 } },
    v8_5000: { nome: 'V8 5.0 · virabrequim cruzado', grupo: 'Carros', fam: 'v', vee: 90, cyl: 8, cylOpts: [6, 8], cc: 5038,
      cr: 12.0, bs: 92.2 / 92.7, rod: 3.25, ivo: 25, ivc: 64, evo: 60, evc: 25, nv: 2, ivD: 0.4, evD: 0.34, ivL: 0.34, evL: 0.34, cd: 0.84,
      tb: 0.45, vr: 0.6, plenum: 0.9, tbD: 0.087, lin: 0.4, lex: 0.739, hdr: 0.42, wli: 0.7, wle: 0.7, limit: 7500, vvt: 30, idle: 650, inj: 380, J: 0.25, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 3.55, gears: [3.66, 2.43, 1.69, 1.32, 1.0, 0.65], wheel: 0.35, mass: 1815, cda: 0.78, crr: 0.012, clutch: 800, car: true },
      ref: { cv: 466, rpmP: 7000, nm: 570, rpmT: 4600 } },
    v10_5200: { nome: 'V10 5.2 aspirado · superesportivo', grupo: 'Carros', fam: 'v', vee: 90, cyl: 10, cylOpts: [10], cc: 5204,
      cr: 12.7, bs: 84.5 / 92.8, rod: 3.32, ivo: 30, ivc: 69, evo: 64, evc: 25, nv: 2, ivD: 0.46, evD: 0.33, ivL: 0.39, evL: 0.33, cd: 0.97,
      tb: 0.45, vr: 0.6, plenum: 0.9, tbD: 0.084, lin: 0.302, lex: 0.992, hdr: 0.42, wli: 0.7, wle: 0.7, tum: 2.012, limit: 8700, vvt: 30, idle: 900, inj: 400, J: 0.22, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 3.5, gears: [3.13, 2.59, 1.96, 1.55, 1.24, 1.0, 0.8], wheel: 0.34, mass: 1675, cda: 0.62, crr: 0.012, clutch: 900, car: true },
      ref: { cv: 640, rpmP: 8000, nm: 600, rpmT: 6500 } },
    v12_6500: { nome: 'V12 6.5 aspirado · superesportivo', grupo: 'Carros', fam: 'v', vee: 60, cyl: 12, cylOpts: [12], cc: 6498,
      cr: 11.8, bs: 95 / 76.4, rod: 3.5, ivo: 35, ivc: 65, evo: 60, evc: 30, nv: 2, ivD: 0.41, evD: 0.34, ivL: 0.32, evL: 0.32, cd: 0.75,
      tb: 0.45, vr: 0.6, plenum: 0.8, tbD: 0.1, lin: 0.38, lex: 0.8, hdr: 0.42, wli: 0.7, wle: 0.7, limit: 8500, vvt: 30, idle: 950, inj: 450, J: 0.3, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 2.87, gears: [3.91, 2.44, 1.81, 1.46, 1.19, 0.97, 0.84], wheel: 0.355, mass: 1650, cda: 0.68, crr: 0.012, clutch: 1000, car: true },
      ref: { cv: 740, rpmP: 8400, nm: 690, rpmT: 5500 } },
    b6_4000: { nome: 'Boxer 6 4.0 aspirado', grupo: 'Carros', fam: 'boxer', cyl: 6, cylOpts: [4, 6], cc: 3996,
      cr: 13.3, bs: 102 / 81.5, rod: 3.4, ivo: 35, ivc: 61, evo: 65, evc: 30, nv: 2, ivD: 0.42, evD: 0.35, ivL: 0.3, evL: 0.3, cd: 0.82,
      tb: 0.5, vr: 0.9, lin: 0.264, lex: 1.058, hdr: 0.42, wli: 0.75, wle: 0.7, limit: 9000, vvt: 30, idle: 900, inj: 400, J: 0.12, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 4.1, gears: [3.75, 2.38, 1.72, 1.34, 1.11, 0.96, 0.84], wheel: 0.35, mass: 1510, cda: 0.73, crr: 0.012, clutch: 700, car: true },
      ref: { cv: 510, rpmP: 8400, nm: 470, rpmT: 6100 } },
    b4_2000t: { nome: 'Boxer 4 2.0 turbo', grupo: 'Carros', fam: 'boxer', cyl: 4, cylOpts: [2, 4, 6], cc: 1994,
      cr: 8.0, bs: 92 / 75, rod: 3.48, ivo: 15, ivc: 31, evo: 50, evc: 15, nv: 2, ivD: 0.39, evD: 0.33, ivL: 0.28, evL: 0.3, cd: 0.74,
      tb: 0.42, vr: 0.6, plenum: 1.0, tbD: 0.065, lin: 0.34, lex: 0.478, hdr: 0.4, wli: 0.65, wle: 0.6, limit: 7900, vvt: 30, idle: 750, inj: 565, J: 0.14, fi: 'turbo', boost: 1.1,
      veh: { primary: 1, final: 3.9, gears: [3.636, 2.235, 1.59, 1.137, 0.891, 0.707], wheel: 0.32, mass: 1555, cda: 0.68, crr: 0.012, clutch: 550, car: true },
      ref: { cv: 308, rpmP: 6400, nm: 422, rpmT: 4400 } },
    r2_1300: { nome: 'Rotativo Wankel 1.3 (2 rotores)', grupo: 'Carros', fam: 'rotary', cyl: 2, cylOpts: [1, 2, 3, 4], cc: 1308,
      cr: 10.0, e: 0.015, Rg: 0.105, w: 0.08, ivo: 572, ivc: 876, evo: 195, evc: 588, iA: 9e-4, eA: 6e-4,
      tbD: 0.0495, hdrD: 0.045, vr: 0.8, lin: 0.378, lex: 0.5, wli: 0.7, wle: 0.65, limit: 9000, idle: 800, inj: 800, J: 0.12, etac: 0.86, fi: 'na', boost: 0.7,
      veh: { primary: 1, final: 4.44, gears: [3.76, 2.269, 1.645, 1.187, 1.0, 0.843], wheel: 0.32, mass: 1385, cda: 0.63, crr: 0.012, clutch: 400, car: true },
      ref: { cv: 231, rpmP: 8200, nm: 211, rpmT: 5500 } },
    f1_v12: { nome: 'F1 · V12 3,5 aspirado (1989–94)', grupo: 'Fórmula 1', fam: 'v', vee: 60, cyl: 12, cylOpts: [12], cc: 3499, vf: 1.06,
      cr: 12.5, bs: 86 / 50.2, rod: 4.0, ivo: 45, ivc: 80, evo: 75, evc: 40, nv: 2, ivD: 0.42, evD: 0.35, ivL: 0.33, evL: 0.33, cd: 0.75,
      tb: 0.55, vr: 0.8, lin: 0.2, lex: 0.65, hdr: 0.5, wli: 0.75, wle: 0.7, limit: 14500, idle: 3500, inj: 330, J: 0.04, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 4.4, gears: [2.92, 2.3, 1.85, 1.55, 1.35, 1.2], wheel: 0.33, mass: 580, cda: 1.0, cla: 2.5, crr: 0.015, clutch: 600, car: true, race: true },
      ref: { cv: 700, rpmP: 13500, nm: 390, rpmT: 11000 } },
    f1_v10: { nome: 'F1 · V10 3,0 aspirado (2000–05)', grupo: 'Fórmula 1', fam: 'v', vee: 90, cyl: 10, cylOpts: [10], cc: 2998, pneumatic: true,
      cr: 13.5, bs: 97 / 40.6, rod: 4.2, ivo: 50, ivc: 65, evo: 84, evc: 45, nv: 2, ivD: 0.43, evD: 0.36, ivL: 0.32, evL: 0.32, cd: 0.91,
      tb: 0.55, vr: 0.8, lin: 0.139, lex: 0.478, hdr: 0.5, wli: 0.75, wle: 0.7, tum: 2.011, limit: 19200, idle: 4000, inj: 300, J: 0.03, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 5.95, gears: [2.85, 2.25, 1.85, 1.6, 1.42, 1.28, 1.17], wheel: 0.33, mass: 605, cda: 1.1, cla: 3.5, crr: 0.015, clutch: 600, car: true, race: true },
      ref: { cv: 920, rpmP: 18500, nm: 370, rpmT: 16000 } },
    f1_v8: { nome: 'F1 · V8 2,4 virabrequim plano (2006–13)', grupo: 'Fórmula 1', fam: 'v', vee: 90, flat: true, cyl: 8, cylOpts: [8], cc: 2398, pneumatic: true,
      cr: 14, bs: 98 / 39.8, rod: 4.2, ivo: 50, ivc: 57, evo: 68, evc: 45, nv: 2, ivD: 0.46, evD: 0.36, ivL: 0.39, evL: 0.32, cd: 0.97,
      tb: 0.55, vr: 0.8, lin: 0.17, lex: 0.478, hdr: 0.5, wli: 0.75, wle: 0.7, tum: 2.66, limit: 18000, idle: 4000, inj: 300, J: 0.03, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 5.9, gears: [2.85, 2.25, 1.85, 1.6, 1.42, 1.28, 1.17], wheel: 0.33, mass: 620, cda: 1.05, cla: 3.3, crr: 0.015, clutch: 600, car: true, race: true },
      ref: { cv: 760, rpmP: 17800, nm: 320, rpmT: 15000 } },
    f1_v6t: { nome: 'F1 · V6 1,6 turbo híbrido (2014–25)', grupo: 'Fórmula 1', fam: 'v', vee: 90, cyl: 6, cylOpts: [6], cc: 1600, pneumatic: true, ers: 120, ffl: 100,
      cr: 13, bs: 80 / 53, rod: 3.8, ivo: 30, ivc: 44, evo: 75, evc: 25, nv: 2, ivD: 0.42, evD: 0.35, ivL: 0.3, evL: 0.3, cd: 0.87,
      tb: 0.5, vr: 0.6, plenum: 1.2, tbD: 0.07, lin: 0.217, lex: 0.76, hdr: 0.45, wli: 0.7, wle: 0.6, tum: 2.011, limit: 15000, idle: 4000, inj: 400, J: 0.03, fi: 'turbo', boost: 3.1,
      veh: { primary: 1, final: 4.4, gears: [2.8, 2.25, 1.85, 1.58, 1.38, 1.22, 1.1, 1.0], wheel: 0.33, mass: 702, cda: 1.15, cla: 3.5, crr: 0.015, clutch: 600, car: true, race: true },
      ref: { cv: 650, rpmP: 11000, nm: 450, rpmT: 10500 } },
    // ---------- motos exóticas ----------
    i3_2500: { nome: '3 em linha 2,5 L · muscle bike', grupo: 'Motos exóticas', fam: 'inline', cyl: 3, cylOpts: [3], cc: 2458,
      cr: 10.8, bs: 110.2 / 85.9, rod: 3.4, ivo: 20, ivc: 35, evo: 43, evc: 20, nv: 2, ivD: 0.36, evD: 0.34, ivL: 0.26, evL: 0.28, cd: 0.63,
      tb: 0.5, vr: 0.7, lin: 0.4, lex: 0.783, hdr: 0.42, wli: 0.7, wle: 0.7, tum: 0.87, limit: 7000, idle: 900, inj: 550, J: 0.15, fi: 'na', boost: 0.6,
      veh: { primary: 1.5, final: 2.5, gears: [2.4, 1.8, 1.45, 1.22, 1.05, 0.92], wheel: 0.34, mass: 330, cda: 0.65, crr: 0.015, clutch: 450 },
      ref: { cv: 167, rpmP: 6000, nm: 221, rpmT: 4000 } },
    i6_1650: { nome: '6 em linha 1650 cc · moto touring', grupo: 'Motos exóticas', fam: 'inline', cyl: 6, cylOpts: [6], cc: 1649,
      cr: 12.2, bs: 72 / 67.5, rod: 3.6, ivo: 25, ivc: 36, evo: 40, evc: 25, nv: 2, ivD: 0.37, evD: 0.34, ivL: 0.28, evL: 0.3, cd: 0.63,
      tb: 0.55, vr: 0.7, lin: 0.397, lex: 0.926, hdr: 0.45, wli: 0.7, wle: 0.7, tum: 0.87, limit: 8500, idle: 950, inj: 260, J: 0.07, fi: 'na', boost: 0.6,
      veh: { primary: 1.6, final: 2.9, gears: [2.75, 2.0, 1.6, 1.32, 1.12, 0.97], wheel: 0.33, mass: 335, cda: 0.62, crr: 0.015, clutch: 350 },
      ref: { cv: 160, rpmP: 7750, nm: 175, rpmT: 5250 } },
    v4_1100: { nome: 'V4 90° 1100 cc · desmodrômico "twin pulse"', grupo: 'Motos exóticas', fam: 'v', vee: 90, cyl: 4, cylOpts: [4], cc: 1103, desmo: true,
      cr: 14, bs: 81 / 53.5, rod: 3.9, ivo: 40, ivc: 70, evo: 78, evc: 35, nv: 2, ivD: 0.44, evD: 0.36, ivL: 0.36, evL: 0.32, cd: 0.71,
      tb: 0.6, vr: 0.8, lin: 0.25, lex: 0.69, hdr: 0.45, wli: 0.75, wle: 0.7, tum: 0.87, limit: 14000, idle: 1300, inj: 350, J: 0.045, fi: 'na', boost: 0.6,
      // moentes a 70°: explosões em 0°, 90°, 290° e 380° (soa como um bicilíndrico)
      lay: [{ off: 0, bank: -45, x: -0.62, grp: 0 }, { off: 290, bank: -45, x: 0.62, grp: 0 }, { off: 90, bank: 45, x: -0.38, grp: 1 }, { off: 380, bank: 45, x: 0.38, grp: 1 }],
      veh: { primary: 1.8, final: 2.6, gears: [2.4, 2.0, 1.74, 1.55, 1.4, 1.3], wheel: 0.32, mass: 200, cda: 0.32, crr: 0.015, clutch: 320 },
      ref: { cv: 214, rpmP: 13000, nm: 124, rpmT: 10000 } },
    // ---------- carros exóticos ----------
    w16_8000: { nome: 'W16 8,0 quadriturbo · hipercarro', grupo: 'Carros exóticos', fam: 'w', vee: 90, vrA: 15, cyl: 16, cylOpts: [16], cc: 7993,
      cr: 9.0, bs: 1.0, rod: 3.3, ivo: 20, ivc: 58, evo: 83, evc: 20, nv: 2, ivD: 0.46, evD: 0.34, ivL: 0.35, evL: 0.28, cd: 0.71,
      tb: 0.42, vr: 0.6, plenum: 1.0, tbD: 0.1, lin: 0.329, lex: 1.058, hdr: 0.4, wli: 0.65, wle: 0.6, tum: 0.87, limit: 6800, vvt: 30, idle: 700, inj: 600, J: 0.35, fi: 'turbo', boost: 1.45,
      veh: { primary: 1, final: 3.6, gears: [3.3, 2.2, 1.6, 1.25, 1.0, 0.85, 0.73], wheel: 0.36, mass: 1995, cda: 0.75, cla: 0.3, crr: 0.012, clutch: 1800, car: true },
      ref: { cv: 1500, rpmP: 6700, nm: 1600, rpmT: 4000 } },
    w12_6000: { nome: 'W12 6,0 biturbo · gran turismo', grupo: 'Carros exóticos', fam: 'w', vee: 72, vrA: 15, cyl: 12, cylOpts: [12], cc: 5998,
      cr: 9.0, bs: 84 / 90.2, rod: 3.3, ivo: 20, ivc: 42, evo: 47, evc: 20, nv: 2, ivD: 0.38, evD: 0.34, ivL: 0.29, evL: 0.28, cd: 0.51,
      tb: 0.42, vr: 0.6, plenum: 1.0, tbD: 0.085, lin: 0.575, lex: 0.8, hdr: 0.4, wli: 0.65, wle: 0.6, tum: 0.87, limit: 6500, vvt: 30, idle: 650, inj: 500, J: 0.3, fi: 'turbo', boost: 1.05,
      veh: { primary: 1, final: 2.85, gears: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67], wheel: 0.36, mass: 2250, cda: 0.7, crr: 0.012, clutch: 1200, car: true },
      ref: { cv: 635, rpmP: 6000, nm: 900, rpmT: 3000 } },
    v10_4800: { nome: 'V10 72° 4,8 · borboletas individuais, 9.000 rpm', grupo: 'Carros exóticos', fam: 'v', vee: 72, cyl: 10, cylOpts: [10], cc: 4805,
      cr: 12, bs: 88 / 79, rod: 3.5, ivo: 35, ivc: 57, evo: 73, evc: 30, nv: 2, ivD: 0.41, evD: 0.35, ivL: 0.32, evL: 0.32, cd: 0.81,
      tb: 0.5, vr: 0.7, lin: 0.345, lex: 0.8, hdr: 0.42, wli: 0.75, wle: 0.7, tum: 1.565, limit: 9000, vvt: 30, idle: 1000, inj: 380, J: 0.14, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 4.56, gears: [3.231, 2.188, 1.609, 1.233, 0.97, 0.795], wheel: 0.33, mass: 1480, cda: 0.7, crr: 0.012, clutch: 700, car: true },
      ref: { cv: 560, rpmP: 8700, nm: 480, rpmT: 6800 } },
    v12_6100: { nome: 'V12 60° 6,1 · borboletas individuais', grupo: 'Carros exóticos', fam: 'v', vee: 60, cyl: 12, cylOpts: [12], cc: 6064,
      cr: 11, bs: 86 / 87, rod: 3.4, ivo: 30, ivc: 68, evo: 60, evc: 25, nv: 2, ivD: 0.42, evD: 0.35, ivL: 0.3, evL: 0.3, cd: 0.76,
      tb: 0.5, vr: 0.7, lin: 0.402, lex: 0.92, hdr: 0.42, wli: 0.7, wle: 0.7, tum: 0.87, limit: 7500, vvt: 30, idle: 900, inj: 380, J: 0.22, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 2.37, gears: [3.23, 2.19, 1.71, 1.39, 1.16, 0.93], wheel: 0.33, mass: 1140, cda: 0.6, crr: 0.012, clutch: 900, car: true },
      ref: { cv: 627, rpmP: 7400, nm: 650, rpmT: 5600 } },
    v8_5000tt: { nome: 'V8 5,0 biturbo · virabrequim plano', grupo: 'Carros exóticos', fam: 'v', vee: 90, flat: true, cyl: 8, cylOpts: [8], cc: 5065,
      cr: 9.5, bs: 92 / 95.25, rod: 3.3, ivo: 20, ivc: 86, evo: 99, evc: 20, nv: 2, ivD: 0.46, evD: 0.34, ivL: 0.38, evL: 0.28, cd: 0.84,
      tb: 0.45, vr: 0.6, plenum: 1.0, tbD: 0.09, lin: 0.45, lex: 0.805, hdr: 0.42, wli: 0.65, wle: 0.6, tum: 1.322, limit: 8500, vvt: 30, idle: 900, inj: 900, J: 0.2, fi: 'turbo', boost: 1.75,
      veh: { primary: 1, final: 2.7, gears: [3.6, 2.6, 2.0, 1.6, 1.3, 1.1, 0.95, 0.82], wheel: 0.35, mass: 1420, cda: 0.75, cla: 1.0, crr: 0.012, clutch: 1500, car: true },
      ref: { cv: 1280, rpmP: 7800, nm: 1000, rpmT: 5100 } },
    b12_4500: { nome: 'Plano 12 (V 180°) 4,5 · protótipo de corrida a ar', grupo: 'Carros exóticos', fam: 'v', vee: 180, cyl: 12, cylOpts: [12], cc: 4494, cool: 'air', fan: true,
      cr: 10.5, bs: 85 / 66, rod: 3.9, ivo: 40, ivc: 62, evo: 62, evc: 35, nv: 2, ivD: 0.42, evD: 0.36, ivL: 0.28, evL: 0.3, cd: 0.76,
      tb: 0.55, vr: 0.8, lin: 0.456, lex: 1.035, hdr: 0.45, wli: 0.75, wle: 0.7, tum: 1.15, limit: 8800, idle: 1200, inj: 350, J: 0.12, tw: 520, fi: 'na', boost: 0.6,
      veh: { primary: 1, final: 4.4, gears: [2.6, 1.9, 1.5, 1.2, 1.0], wheel: 0.33, mass: 800, cda: 0.75, cla: 1.5, crr: 0.014, clutch: 700, car: true, race: true },
      ref: { cv: 580, rpmP: 8400, nm: 510, rpmT: 6800 } },
    // ---------- aviões (só pistão): radiais, boxer a ar, V12 com supercharger; hélice de passo fixo ----------
    rad9: { nome: 'Radial 9 cilindros 16,1 L · avião', grupo: 'Aviões', fam: 'radial', rows: 1, cyl: 9, cylOpts: [5, 7, 9], cc: 16140, ohv: true, plugs: 2, cool: 'air', oil: '20w50', fuelRef: 'avgas',
      cr: 6.0, bs: 1.0, rod: 4.0, ivo: 15, ivc: 36, evo: 41, evc: 20, nv: 1, ivD: 0.38, evD: 0.37, ivL: 0.25, evL: 0.25, cd: 0.68,
      tb: 0.35, vr: 0.5, plenum: 0.5, tbD: 0.1, lin: 0.298, lex: 0.249, hdr: 0.38, wli: 0.6, wle: 0.6, tum: 0.87, limit: 2450, idle: 600, inj: 400, J: 1.2, tw: 520, fi: 'sc', boost: 0.35,
      veh: { prop: true, propD: 2.59, blades: 2, red: 1, Jp: 20, mass: 2300, cda: 1.2, crr: 0.03 },
      ref: { cv: 456, rpmP: 2300, nm: 1395, rpmT: 2250 } },
    rad18: { nome: 'Radial 18 cilindros (2 fileiras) 46 L · caça', grupo: 'Aviões', fam: 'radial', rows: 2, cyl: 18, cylOpts: [14, 18], cc: 45950, ohv: true, plugs: 2, cool: 'air', oil: '20w50', fuelRef: 'avgas',
      cr: 6.65, bs: 146 / 152.4, rod: 4.0, ivo: 20, ivc: 56, evo: 53, evc: 20, nv: 1, ivD: 0.42, evD: 0.36, ivL: 0.25, evL: 0.25, cd: 0.84,
      tb: 0.35, vr: 0.5, plenum: 0.5, tbD: 0.2, lin: 0.529, lex: 0.249, hdr: 0.38, wli: 0.6, wle: 0.6, tum: 1, limit: 2800, idle: 600, inj: 800, J: 3.0, tw: 520, fi: 'sc', boost: 0.8,
      veh: { prop: true, propD: 4.06, blades: 3, red: 0.5, Jp: 45, mass: 5600, cda: 0.55, crr: 0.03 },
      ref: { cv: 2028, rpmP: 2700, nm: 5276, rpmT: 2600 } },
    flat4_air: { nome: 'Boxer 4 5,9 L arrefecido a ar · avião leve', grupo: 'Aviões', fam: 'boxer', cyl: 4, cylOpts: [4], cc: 5920, ohv: true, plugs: 2, cool: 'air', oil: '20w50', fuelRef: 'avgas',
      cr: 8.5, bs: 130.2 / 111.1, rod: 3.6, ivo: 15, ivc: 79, evo: 84, evc: 15, nv: 1, ivD: 0.4, evD: 0.36, ivL: 0.25, evL: 0.25, cd: 0.72,
      tb: 0.4, vr: 0.6, plenum: 0.5, tbD: 0.06, lin: 0.329, lex: 0.343, hdr: 0.35, wli: 0.6, wle: 0.6, tum: 1, limit: 2750, idle: 700, inj: 400, J: 0.5, tw: 520, fi: 'na', boost: 0.6,
      veh: { prop: true, propD: 1.88, blades: 2, red: 1, Jp: 6, mass: 1100, cda: 0.6, crr: 0.03 },
      ref: { cv: 182, rpmP: 2700, nm: 474, rpmT: 2600 } },
    flat6_air: { nome: 'Boxer 6 9,0 L arrefecido a ar · avião', grupo: 'Aviões', fam: 'boxer', cyl: 6, cylOpts: [6], cc: 9010, ohv: true, plugs: 2, cool: 'air', oil: '20w50', fuelRef: 'avgas',
      cr: 8.5, bs: 133.4 / 108, rod: 3.6, ivo: 15, ivc: 47, evo: 52, evc: 15, nv: 1, ivD: 0.42, evD: 0.36, ivL: 0.25, evL: 0.25, cd: 0.84,
      tb: 0.4, vr: 0.6, plenum: 0.5, tbD: 0.07, lin: 0.575, lex: 0.69, hdr: 0.35, wli: 0.6, wle: 0.6, tum: 1, limit: 2750, idle: 700, inj: 500, J: 0.7, tw: 520, fi: 'na', boost: 0.6,
      veh: { prop: true, propD: 1.98, blades: 3, red: 1, Jp: 9, mass: 1540, cda: 0.5, crr: 0.03 },
      ref: { cv: 314, rpmP: 2700, nm: 818, rpmT: 2500 } },
    merlin: { nome: 'V12 60° 27 L com supercharger de 2 estágios · caça', grupo: 'Aviões', fam: 'v', vee: 60, cyl: 12, cylOpts: [12], cc: 27020, plugs: 2, oil: '20w50', fuelRef: 'avgas',
      cr: 6.0, bs: 137.2 / 152.4, rod: 3.4, ivo: 20, ivc: 47, evo: 60, evc: 20, nv: 2, ivD: 0.38, evD: 0.33, ivL: 0.27, evL: 0.27, cd: 0.71,
      tb: 0.35, vr: 0.5, plenum: 0.5, tbD: 0.18, lin: 0.69, lex: 0.296, hdr: 0.38, wli: 0.6, wle: 0.6, tum: 0.87, limit: 3000, idle: 600, inj: 600, J: 1.0, fi: 'sc', boost: 1,
      veh: { prop: true, propD: 3.4, blades: 4, red: 0.479, Jp: 35, mass: 4600, cda: 0.35, crr: 0.03 },
      ref: { cv: 1587, rpmP: 3000, nm: 3716, rpmT: 2900 } },
  };

  // Configurações prontas: veículo + motor + sobrealimentação + câmbio + escapamento
  const PRESETS = {
    daytona: { nome: 'Triumph Daytona 675', grupo: 'Motos', eng: 'i3_675', trans: 'seq', exh: 'stock' },
    s1000rr: { nome: 'BMW S 1000 RR', grupo: 'Motos', eng: 'i4_1000', trans: 'seq', exh: 'stock' },
    h2: { nome: 'Kawasaki Ninja H2 (supercharger)', grupo: 'Motos', eng: 'i4_1000', cc: 998, cr: 8.5, fi: 'sc', boost: 0.75, limit: 13000, trans: 'seq', exh: 'sport', fuel: 'e27_97',
      veh: { mass: 313 }, ref: { cv: 231, rpmP: 11000, nm: 142, rpmT: 10500 } },
    panigale: { nome: 'Ducati Panigale 1199 (desmodrômico)', grupo: 'Motos', eng: 'v2_1200', trans: 'seq', exh: 'sport' },
    harley: { nome: 'Harley-Davidson Milwaukee-Eight 114', grupo: 'Motos', eng: 'v2_1870', trans: 'seq', exh: 'stock' },
    gs: { nome: 'BMW R 1250 GS', grupo: 'Motos', eng: 'b2_1250', trans: 'seq', exh: 'stock' },
    cg: { nome: 'Honda CG 160', grupo: 'Motos', eng: 's1_160', trans: 'seq', exh: 'stock', fuel: 'e27_93' },
    pcx: { nome: 'Honda PCX 160 (CVT de scooter)', grupo: 'Motos', eng: 's1_160', cc: 157, cr: 12, trans: 'cvt', exh: 'stock', fuel: 'e27_93', cool: 'liquid',
      veh: { primary: 1, final: 9.3, gears: [2.65, 0.85], wheel: 0.27, mass: 207, cda: 0.55, clutch: 45 }, ref: { cv: 15.8, rpmP: 8500, nm: 14.7, rpmT: 6500 } },
    rd350: { nome: 'Yamaha RD 350 LC (2 tempos)', grupo: 'Motos', eng: 't2_350', trans: 'seq', exh: 'sport', fuel: 'mix2t' },
    rd125: { nome: '2 tempos 125 (estilo RD/RZ 125)', grupo: 'Motos', eng: 't2_125', trans: 'seq', exh: 'sport', fuel: 'mix2t' },
    m3: { nome: 'BMW M3 Competition (G80)', grupo: 'Carros', eng: 'i6_3000t', cc: 2993, cr: 9.3, fi: 'turbo', boost: 1.9, limit: 7200, over: { lin: 0.378, ivc: 69 }, trans: 'auto8', exh: 'sport', fuel: 'e27_97',
      veh: { mass: 1805, cda: 0.66, wheel: 0.345, final: 3.15 }, ref: { cv: 510, rpmP: 6250, nm: 650, rpmT: 2750 } },
    supra: { nome: 'Toyota Supra MK4 (2JZ-GTE)', grupo: 'Carros', eng: 'i6_3000t', trans: 'manual', exh: 'sport' },
    civic: { nome: 'Honda Civic Type R (K20)', grupo: 'Carros', eng: 'i4_2000', trans: 'manual', exh: 'sport' },
    corolla: { nome: 'Toyota Corolla 2.0 (CVT)', grupo: 'Carros', eng: 'i4_2000e', trans: 'cvt', exh: 'stock', fuel: 'e27_93' },
    mustang: { nome: 'Ford Mustang GT (V8 Coyote)', grupo: 'Carros', eng: 'v8_5000', trans: 'manual', exh: 'sport' },
    gt3: { nome: 'Porsche 911 GT3 (boxer 6)', grupo: 'Carros', eng: 'b6_4000', trans: 'auto8', exh: 'sport', fuel: 'e27_97' },
    sti: { nome: 'Subaru WRX STI (boxer turbo)', grupo: 'Carros', eng: 'b4_2000t', trans: 'manual', exh: 'sport' },
    rx7: { nome: 'Mazda RX-7 FD (13B-REW biturbo)', grupo: 'Carros', eng: 'r2_1300', fi: 'turbo', boost: 0.35, trans: 'manual', exh: 'sport',
      veh: { gears: [3.483, 2.015, 1.391, 1.0, 0.762], final: 4.1, mass: 1335 }, ref: { cv: 280, rpmP: 6500, nm: 314, rpmT: 5000 } },
    rx8: { nome: 'Mazda RX-8 (Renesis)', grupo: 'Carros', eng: 'r2_1300', trans: 'manual', exh: 'stock' },
    bridge: { nome: 'Rotativo bridge port (modificado, "brap")', grupo: 'Carros', eng: 'r2_1300', ports: 'bridge', trans: 'manual', exh: 'straight', fuel: 'race', crackle: true },
    r787b: { nome: 'Mazda 787B · Le Mans 1991 (4 rotores)', grupo: 'Carros', eng: 'r2_1300', cyl: 4, cc: 2616, ports: 'peri', limit: 9500, over: { lin: 0.5, lex: 0.575, ivc: 846 }, trans: 'seq', exh: 'race', fuel: 'race',
      veh: { gears: [2.6, 1.9, 1.5, 1.2, 1.0], final: 3.5, mass: 905, cda: 0.9, cla: 2.0, wheel: 0.33, race: true }, ref: { cv: 700, rpmP: 9000, nm: 608, rpmT: 6500 } },
    huracan: { nome: 'Lamborghini Huracán (V10)', grupo: 'Carros', eng: 'v10_5200', trans: 'auto8', exh: 'sport', fuel: 'e27_97' },
    aventador: { nome: 'Lamborghini Aventador S (V12)', grupo: 'Carros', eng: 'v12_6500', trans: 'auto8', exh: 'sport', fuel: 'e27_97' },
    f1_1990: { nome: 'F1 1990 · V12 3,5 L', grupo: 'Fórmula 1', eng: 'f1_v12', trans: 'seq', exh: 'race', fuel: 'race',
      info: 'Regulamento 1989–1994: motores aspirados de até 3,5 L e até 12 cilindros. Molas de válvula convencionais — sem limitador, as válvulas flutuam logo acima do giro máximo.' },
    f1_2004: { nome: 'F1 2004 · V10 3,0 L (19.000 rpm)', grupo: 'Fórmula 1', eng: 'f1_v10', trans: 'seq', exh: 'race', fuel: 'race',
      info: 'Regulamento 2000–2005: V10 obrigatório de 3,0 L, sem limite de giro (~19.000 rpm) graças às válvulas pneumáticas.' },
    f1_2010: { nome: 'F1 2010 · V8 2,4 L (18.000 rpm)', grupo: 'Fórmula 1', eng: 'f1_v8', trans: 'seq', exh: 'race', fuel: 'race',
      info: 'Regulamento 2006–2013: V8 90° de 2,4 L com virabrequim plano, limite de 18.000 rpm imposto pela FIA, motores congelados.' },
    f1_2014: { nome: 'F1 2014+ · V6 1,6 L turbo híbrido', grupo: 'Fórmula 1', eng: 'f1_v6t', trans: 'seq', exh: 'race', fuel: 'race',
      info: 'Regulamento 2014–2025: V6 90° de 1,6 L turbo, 15.000 rpm, fluxo de combustível ≤ 100 kg/h (limita a potência no alto giro) e MGU-K de 120 kW (ERS) no virabrequim.' },
    // motos exóticas
    rocket3: { nome: 'Triumph Rocket 3 (2,5 L)', grupo: 'Motos exóticas', eng: 'i3_2500', trans: 'seq', exh: 'stock' },
    k1600: { nome: 'BMW K 1600 GT (6 em linha)', grupo: 'Motos exóticas', eng: 'i6_1650', trans: 'seq', exh: 'stock' },
    desmosedici: { nome: 'Ducati Panigale V4 (desmodrômico)', grupo: 'Motos exóticas', eng: 'v4_1100', trans: 'seq', exh: 'sport', fuel: 'e27_97' },
    hayabusa: { nome: 'Suzuki Hayabusa (1340 cc)', grupo: 'Motos exóticas', eng: 'i4_1000', cc: 1340, cr: 12.5, limit: 11000, over: { cd: 0.5 }, trans: 'seq', exh: 'stock',
      veh: { mass: 290, final: 2.4 }, ref: { cv: 190, rpmP: 9700, nm: 150, rpmT: 7000 } },
    h2r: { nome: 'Kawasaki Ninja H2R (pista, supercharger)', grupo: 'Motos exóticas', eng: 'i4_1000', cc: 998, cr: 8.5, fi: 'sc', boost: 1.04, limit: 14000, trans: 'seq', exh: 'race', fuel: 'race',
      veh: { mass: 245, cda: 0.3 }, ref: { cv: 310, rpmP: 14000, nm: 165, rpmT: 12500 } },
    tomahawk: { nome: 'Moto-conceito com V10 8,3 L', grupo: 'Motos exóticas', eng: 'v10_5200', cc: 8277, limit: 6000, over: { cd: 0.45 }, trans: 'seq', exh: 'sport',
      veh: { primary: 1, final: 3.0, gears: [2.5, 1.7, 1.3, 1.05, 0.87], wheel: 0.33, mass: 680, cda: 0.6, crr: 0.015, clutch: 1000, car: false }, ref: { cv: 507, rpmP: 5600, nm: 712, rpmT: 4200 } },
    // carros exóticos
    chiron: { nome: 'Bugatti Chiron (W16 quadriturbo)', grupo: 'Carros exóticos', eng: 'w16_8000', trans: 'auto8', exh: 'sport', fuel: 'race' },
    bentley: { nome: 'Bentley Continental GT (W12 biturbo)', grupo: 'Carros exóticos', eng: 'w12_6000', trans: 'auto8', exh: 'stock', fuel: 'e27_97' },
    lfa: { nome: 'Lexus LFA (V10 9.000 rpm)', grupo: 'Carros exóticos', eng: 'v10_4800', trans: 'seq', exh: 'sport', fuel: 'e27_97' },
    mclarenf1: { nome: 'McLaren F1 (V12 6,1)', grupo: 'Carros exóticos', eng: 'v12_6100', trans: 'manual', exh: 'sport', fuel: 'e27_97' },
    jesko: { nome: 'Koenigsegg Jesko (V8 biturbo, E85)', grupo: 'Carros exóticos', eng: 'v8_5000tt', trans: 'auto8', exh: 'sport', fuel: 'e85', boost: 2.6, ref: { cv: 1600, rpmP: 7800, nm: 1500, rpmT: 5100 } },
    sf812: { nome: 'Ferrari 812 Superfast (V12 6,5)', grupo: 'Carros exóticos', eng: 'v12_6500', limit: 8900, over: { cd: 0.94 }, trans: 'auto8', exh: 'sport', fuel: 'e27_97', ref: { cv: 800, rpmP: 8500, nm: 718, rpmT: 7000 } },
    zonda: { nome: 'Pagani Zonda (V12 7,3)', grupo: 'Carros exóticos', eng: 'v12_6100', cc: 7291, limit: 7300, over: { cd: 0.58 }, trans: 'manual', exh: 'straight', fuel: 'e27_97', ref: { cv: 602, rpmP: 6150, nm: 760, rpmT: 4000 } },
    amgone: { nome: 'Mercedes-AMG One (motor de F1 na rua)', grupo: 'Carros exóticos', eng: 'f1_v6t', limit: 11000, trans: 'auto8', exh: 'sport', fuel: 'race',
      veh: { final: 3.6, mass: 1695, cda: 0.75, cla: 1.2, race: false }, ref: { cv: 574, rpmP: 9000, nm: 400, rpmT: 7000 } },
    p917: { nome: 'Porsche 917 (12 cilindros planos a ar)', grupo: 'Carros exóticos', eng: 'b12_4500', trans: 'seq', exh: 'race', fuel: 'race' },
    // aviões
    archer: { nome: 'Piper PA-28 Archer (boxer 4)', grupo: 'Aviões', eng: 'flat4_air', trans: 'prop', exh: 'stock', fuel: 'avgas' },
    sr22: { nome: 'Cirrus SR22 (boxer 6, hélice tripá)', grupo: 'Aviões', eng: 'flat6_air', trans: 'prop', exh: 'stock', fuel: 'avgas' },
    beaver: { nome: 'de Havilland Beaver (radial 9)', grupo: 'Aviões', eng: 'rad9', trans: 'prop', exh: 'race', fuel: 'avgas' },
    p51: { nome: 'P-51D Mustang (V12 com supercharger)', grupo: 'Aviões', eng: 'merlin', trans: 'prop', exh: 'race', fuel: 'avgas' },
    corsair: { nome: 'F4U Corsair (radial 18)', grupo: 'Aviões', eng: 'rad18', trans: 'prop', exh: 'race', fuel: 'avgas' },
  };

  const FUELS = {
    e0_95:  { nome: 'Gasolina E0 · RON 95', ron: 95,  afr: 14.7, lhv: 43.4e6, hvap: 350e3,  rho: 0.745, sl: 1.00, eth: 0 },
    e27_93: { nome: 'Gasolina comum BR (E27) · RON 93',   ron: 93,  afr: 13.2, lhv: 38.9e6, hvap: 510e3,  rho: 0.755, sl: 1.04, eth: 0.27 },
    e27_97: { nome: 'Gasolina premium BR (E27) · RON 97', ron: 97,  afr: 13.2, lhv: 38.9e6, hvap: 510e3,  rho: 0.755, sl: 1.04, eth: 0.27 },
    ron88:  { nome: 'Gasolina ruim · RON 88',             ron: 88,  afr: 14.6, lhv: 43.2e6, hvap: 350e3,  rho: 0.740, sl: 0.98, eth: 0 },
    race:   { nome: 'Gasolina de competição · RON 102',   ron: 102, afr: 14.4, lhv: 43.0e6, hvap: 360e3,  rho: 0.720, sl: 1.02, eth: 0 },
    e100:   { nome: 'Etanol hidratado (E100) · RON 110',  ron: 110, afr: 8.4,  lhv: 24.8e6, hvap: 1000e3, rho: 0.809, sl: 1.12, eth: 1 },
    mix2t:  { nome: 'Gasolina + óleo 2T (2%) · RON 95',   ron: 95,  afr: 14.4, lhv: 42.9e6, hvap: 350e3,  rho: 0.75,  sl: 0.98, eth: 0, oil: 0.02 },
    e85:    { nome: 'E85 (85% etanol) · RON 105',         ron: 105, afr: 9.8,  lhv: 29.2e6, hvap: 870e3,  rho: 0.78,  sl: 1.10, eth: 0.85 },
    avgas:  { nome: 'Gasolina de aviação 100LL',          ron: 104, afr: 14.9, lhv: 43.5e6, hvap: 340e3,  rho: 0.72,  sl: 1.00, eth: 0 },
  };

  // k: restrição (Pa por (kg/s)², p/ 675 cc); cat/res/muff: componentes (muff 2 = 2 câmaras, 1 = reto);
  // fc/fb/g: abafamento, ressonância da ponteira e ganho do som
  const EXH = {
    stock:    { nome: 'Original (catalisador + abafador)', k: 1.8e6, cat: 1, res: 1, muff: 2, fc: 450, fb: 0.5, g: 0.6 },
    sport:    { nome: 'Esportivo (cat. esportivo + ponteira)', k: 0.9e6, cat: 1, res: 0, muff: 1, fc: 1100, fb: 0.35, g: 0.9 },
    decat:    { nome: 'Sem catalisador (abafador reto)', k: 0.5e6, cat: 0, res: 0, muff: 1, fc: 1700, fb: 0.3, g: 1.1 },
    straight: { nome: 'Straight pipe (direto, sem miolo)', k: 0.25e6, cat: 0, res: 0, muff: 0, fc: 3200, fb: 0.2, g: 1.4 },
    race:     { nome: 'Competição (coletor livre)', k: 0.12e6, cat: 0, res: 0, muff: 0, fc: 5000, fb: 0.15, g: 1.6 },
  };

  const TRANS = {
    seq:    'Sequencial de moto/corrida (tambor + garfos)',
    manual: 'Manual de carro (H, sincronizado)',
    auto8:  'Automático 8 marchas (planetário + conversor)',
    cvt:    'CVT (polias variáveis + correia)',
    prop:   'Hélice de passo fixo (avião)',
  };

  // janelas do rotativo: Δabertura adm., Δfechamento adm., ×área adm., ×área esc., Δabertura esc.
  const PORTS = {
    std:    { nome: 'Janelas originais', d: [0, 0, 1, 1, 0] },
    street: { nome: 'Street port (escape ampliado)', d: [-8, 10, 1.15, 1.25, -12] },
    bridge: { nome: 'Bridge port (cruzamento grande)', d: [-35, 15, 1.45, 1.25, -12] },
    peri:   { nome: 'Peripheral port (competição)', d: [-55, 25, 1.8, 1.45, -20] },
  };

  // Cilindros: off = ângulo do virabrequim (0..ciclo) em que o cilindro está no PMS de ignição,
  // bank = inclinação do cilindro (°), x = posição ao longo do virabrequim (em diâmetros),
  // grp = grupo de escape (bancada). O moente de cada cilindro sai de bank − off.
  function evenFire(cyls) { // escolhe qual dos dois PMS de cada cilindro é o de ignição
    for (const c of cyls) c.t = (((c.bank - c.pin) % 360) + 360) % 360;
    const cnt = {}, seen = {};
    for (const c of cyls) cnt[c.t] = (cnt[c.t] || 0) + 1;
    let alt = 0;
    for (const c of [...cyls].sort((a, b) => a.t - b.t)) {
      if (cnt[c.t] > 1) { c.off = c.t + (seen[c.t] ? 360 : 0); seen[c.t] = 1; } // pares no mesmo PMS: um em cada volta
      else c.off = c.t + (alt++ % 2) * 360;
    }
    const m = Math.min(...cyls.map(c => c.off));
    for (const c of cyls) { c.off -= m; delete c.t; }
    return cyls;
  }
  function layout(E, n) {
    const P = 1.28;
    if (E.lay) return E.lay.slice(0, n).map(c => Object.assign({}, c));     // disposição explícita (ex.: V4 "twin pulse")
    if (E.fam === 'radial') { // estrela em volta de um moente por fileira; ímpares: 1-3-5-7-9-2-4-6-8; 2ª fileira com moente a 180°
      const rows = E.rows || 1, nr = n / rows, c = [];
      for (let r = 0; r < rows; r++) for (let i = 0; i < nr; i++) c.push({ bank: i * 360 / nr + r * 180 / nr, pin: r * 180, x: (r - (rows - 1) / 2) * 1.15, grp: 0, row: r });
      return evenFire(c);
    }
    if (E.fam === 'w') { // dois bancos em V estreito (VR) separados por `vee`: 4 fileiras, explosões a cada 720/n
      const vr = E.vrA || 15, v = E.vee || 90, rowA = [-v / 2 - vr / 2, -v / 2 + vr / 2, v / 2 - vr / 2, v / 2 + vr / 2], per = n / 4, out = [];
      for (let k = 0; k < n; k++) { const row = [0, 2, 1, 3][k % 4], i = Math.floor(k / 4); out.push({ off: k * 720 / n, bank: rowA[row], blk: row < 2 ? -v / 2 : v / 2, x: (i - (per - 1) / 2) * 1.3 + (row % 2 ? 0.32 : -0.32), grp: row < 2 ? 0 : 1 }); }
      return out;
    }
    if (E.fam === 'rotary') { // 3 faces por rotor; rotores defasados 360/n
      const out = [];
      for (let r = 0; r < n; r++) for (let k = 0; k < 3; k++)
        out.push({ off: ((-360 * k + r * 360 / n) % 1080 + 1080) % 1080, bank: 0, x: (r - (n - 1) / 2) * 1.0, grp: 0, rotor: r, face: k });
      return out;
    }
    if (E.fam === 'two') // 2 tempos: uma explosão por volta, espaçadas por igual
      return Array.from({ length: n }, (_, i) => ({ off: i * 360 / n, bank: 0, x: (i - (n - 1) / 2) * P, grp: i }));
    if (E.fam === 'inline') {
      const offs = { 1: [0], 2: [0, 270], 3: [0, 240, 480], 4: [0, 180, 540, 360], 6: [0, 480, 240, 600, 120, 360] }[n];
      return offs.map((off, i) => ({ off, bank: 0, x: (i - (n - 1) / 2) * P, grp: 0 }));
    }
    if (E.fam === 'v') {
      const v = E.vee || 90, L = -v / 2, Rb = v / 2;
      if (n === 2) return [{ off: 0, bank: L, x: -0.22, grp: 0 }, { off: 360 + v, bank: Rb, x: 0.22, grp: 0 }];
      if (E.flat || n >= 10 || E.pneumatic) // explosões alternando bancadas a cada 720/n (moente dividido onde preciso)
        return Array.from({ length: n }, (_, k) => ({ off: k * 720 / n, bank: k % 2 ? Rb : L, x: ((k >> 1) - (n / 2 - 1) / 2) * 1.3 + (k % 2 ? 0.25 : -0.25), grp: k % 2 }));
      const pins = { 4: [0, 180], 6: [0, 120, 240], 8: [0, 90, 270, 180] }[n], np = pins.length, c = [];
      pins.forEach((pin, i) => {
        const x = (i - (np - 1) / 2) * 1.3;
        c.push({ bank: L, pin, x: x - 0.25, grp: 0 }, { bank: Rb, pin: n === 6 ? pin + v : pin, x: x + 0.25, grp: 1 });
      });
      return evenFire(c);
    }
    // boxer: pares opostos com moentes a 180°
    const pairs = n / 2, c = [];
    for (let i = 0; i < pairs; i++) {
      const pin = n === 6 ? i * 120 : n === 4 ? (i ? 180 : 0) : 0, x = (i - (pairs - 1) / 2) * 1.35;
      c.push({ bank: -90, pin, x: x - 0.25, grp: 0 }, { bank: 90, pin: pin + 180, x: x + 0.25, grp: n > 2 ? 1 : 0 });
    }
    return evenFire(c);
  }

  return { ENGINES, PRESETS, FUELS, EXH, TRANS, PORTS, layout };
}
if (typeof module !== 'undefined') module.exports = ENGINE_CATALOG;
