// K-Arise - domaine course a pied : estimation du niveau, zones d'allure, generation de plan.
// Logique pure : zero DOM, zero reseau, deterministe. Plans type Hal Higdon / Jack Daniels simplifies.

export const RUN_GOALS = {
  "5k":       { label: "5 KM",          distanceKm: 5,    weeks: 6,  minVolume: 8,  peak: { debutant: 20, intermediaire: 28, avance: 35 }, longCap: 8 },
  "10k":      { label: "10 KM",         distanceKm: 10,   weeks: 8,  minVolume: 12, peak: { debutant: 30, intermediaire: 38, avance: 45 }, longCap: 12 },
  "semi":     { label: "SEMI-MARATHON", distanceKm: 21.1, weeks: 10, minVolume: 20, peak: { debutant: 40, intermediaire: 48, avance: 55 }, longCap: 18 },
  "marathon": { label: "MARATHON",      distanceKm: 42.2, weeks: 12, minVolume: 30, peak: { debutant: 55, intermediaire: 62, avance: 70 }, longCap: 32 }
};

export const KIND_LABELS = {
  endurance: "Endurance fondamentale",
  tempo: "Tempo",
  intervalles: "Intervalles",
  longue: "Sortie longue",
  course: "JOUR DE COURSE",
  test: "Test 5K chrono"
};

// Jours de la semaine assignes aux seances (3/sem ou 4/sem). La longue/course tombe le dimanche.
export function scheduleDays(nbSessions) {
  return nbSessions === 3 ? ["Mardi", "Jeudi", "Dimanche"] : ["Mardi", "Jeudi", "Samedi", "Dimanche"];
}

// 5.5 min/km -> "10.9 km/h"
export function paceToKmh(minKm) {
  if (!minKm || !isFinite(minKm)) return "-";
  return (Math.round((60 / minKm) * 10) / 10) + " km/h";
}

// Echauffement dynamique pre-course (~5 min). Visuels animes locaux (assets/exo/wu-*.webp).
export const WARMUP_RUN = [
  { name: "Rotations de chevilles", dose: "20s par cote", cue: "Pointe au sol, dessine des cercles amples dans les deux sens.", img: "assets/exo/wu-chevilles.webp" },
  { name: "Cercles de hanches", dose: "10 par sens", cue: "Mains sur les hanches, cercles larges et controles.", img: "assets/exo/wu-hanches.webp" },
  { name: "Cercles de bras", dose: "15s", cue: "Bras tendus, cercles avant puis arriere, epaules relachees.", img: "assets/exo/wu-bras.webp" },
  { name: "Fentes marchees", dose: "10 pas", cue: "Grand pas, genou arriere vers le sol, buste droit.", img: "assets/exo/wu-fentes.webp" },
  { name: "Montees de genoux (skipping)", dose: "30s", cue: "Genoux hauts, rythme vif, reste leger sur l'avant-pied.", img: "assets/exo/wu-skipping.webp" },
  { name: "Talons-fesses", dose: "30s", cue: "Talons qui claquent vers les fesses, cadence rapide, buste droit.", img: "assets/exo/wu-talons-fesses.webp" }
];

// Etirements post-course (recuperation). Meme logique que les consignes muscu : local, systematique.
export const STRETCHES = [
  { name: "Quadriceps debout", sec: 30, cue: "Talon vers la fesse, genoux serres, bassin neutre. 30s par jambe.", img: "assets/exo/st-quadriceps.webp" },
  { name: "Ischio-jambiers", sec: 30, cue: "Jambe tendue sur un support bas, dos droit, penche-toi depuis la hanche.", img: "assets/exo/st-ischios.webp" },
  { name: "Mollets contre un mur", sec: 30, cue: "Jambe arriere tendue, talon au sol, pousse le mur. 30s par jambe.", img: "assets/exo/st-mollets.webp" },
  { name: "Psoas (fente basse)", sec: 30, cue: "Genou arriere au sol, pousse le bassin vers l'avant, buste droit.", img: "assets/exo/st-psoas.webp" },
  { name: "Fessiers (chiffre 4)", sec: 30, cue: "Allonge, cheville sur le genou oppose, tire la cuisse vers toi.", img: "assets/exo/st-fessiers.webp" }
];

export function paceOf(entry) {
  const r = entry.run || {};
  return r.paceMinKm || (r.distanceKm ? (entry.durationMin / r.distanceKm) : null);
}

// 5.12 min/km -> "5:07 /km"
export function formatPace(minKm) {
  if (!minKm || !isFinite(minKm)) return "-";
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")} /km`;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/*
 estimateFitness(runs, questionnaire)
 runs = entrees history type "run" (recent -> ancien).
 Retour : { level, weeklyKm, basePace, longestKm, source }
*/
export function estimateFitness(runs, questionnaire) {
  const cutoff = Date.now() - 8 * 7 * 86400000; // 8 semaines
  const recent = (runs || []).filter(h => new Date(h.date).getTime() >= cutoff);

  // Test 5K chrono recent : la seule mesure MAXIMALE. Les allures d'entrainement sous-maximales
  // sont biaisees (les debutants courent tout trop vite) ; un test ecrase la mediane pour les zones.
  const test = recent.find(h => h.run.kind === "test" && (h.run.distanceKm || 0) >= 4);
  const testPace = test ? test.run.paceMinKm : null;

  if (recent.length >= 3) {
    // volume hebdo : moyenne des semaines calendaires NON vides des 4 dernieres semaines
    const fourWeeks = Date.now() - 4 * 7 * 86400000;
    const weekKm = {};
    for (const h of recent) {
      if (new Date(h.date).getTime() < fourWeeks) continue;
      const d = new Date(h.date);
      const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const k = monday.toISOString().slice(0, 10);
      weekKm[k] = (weekKm[k] || 0) + (h.run.distanceKm || 0);
    }
    const vols = Object.values(weekKm);
    const weeklyKm = vols.length ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length) : 10;
    const paces = recent.filter(h => (h.run.distanceKm || 0) >= 3).map(paceOf).filter(Boolean);
    const basePace = median(paces) || 6.5;
    const longestKm = Math.max(...recent.map(h => h.run.distanceKm || 0));
    const level = (weeklyKm >= 35 || basePace < 5.0) ? "avance"
                : (weeklyKm >= 15 || basePace < 6.0) ? "intermediaire" : "debutant";
    return { level, weeklyKm, basePace: Math.round(basePace * 100) / 100, longestKm, testPace, source: testPace ? "test" : "runs" };
  }

  if (questionnaire && questionnaire.level) {
    const q = questionnaire;
    const basePace = q.level === "avance" ? 5.0 : q.level === "intermediaire" ? 5.8 : 6.5;
    return { level: q.level, weeklyKm: q.weeklyKm || 10, basePace, longestKm: q.longestKm || 5, testPace, source: "questionnaire" };
  }

  return { level: "debutant", weeklyKm: 10, basePace: 6.5, longestKm: 5, testPace, source: "defaut" };
}

// Zones d'allure derivees de l'allure de base (Jack Daniels ultra-simplifie)
export function paceZones(basePace) {
  return {
    endurance: Math.round((basePace + 0.65) * 100) / 100,
    tempo: Math.round((basePace - 0.3) * 100) / 100,
    intervalle: Math.round((basePace - 0.8) * 100) / 100
  };
}

// Zones derivees d'un TEST 5K a fond (relations type Daniels/VDOT) — bien plus fiables
// que la mediane d'entrainement : allure seuil ~ +0.3, endurance ~ +1.1, VO2max ~ allure test.
export function paceZonesFromTest(testPace) {
  return {
    endurance: Math.round((testPace + 1.1) * 100) / 100,
    tempo: Math.round((testPace + 0.3) * 100) / 100,
    intervalle: Math.round(testPace * 100) / 100
  };
}

// Allure course cible depuis le test 5K (equivalences inter-distances approx.)
function racePaceFromTest(testPace, distanceKm) {
  const adj = distanceKm <= 5 ? 0 : distanceKm <= 10 ? 0.18 : distanceKm <= 21.1 ? 0.45 : 0.75;
  return Math.round((testPace + adj) * 100) / 100;
}

// Allure course cible interpolee selon la distance objectif (plus long = plus lent que base)
function racePace(basePace, distanceKm) {
  const adj = distanceKm <= 5 ? -0.35 : distanceKm <= 10 ? -0.15 : distanceKm <= 21.1 ? 0.15 : 0.45;
  return Math.round((basePace + adj) * 100) / 100;
}

/*
 generatePlan({ goal, raceDate, fitness })
 Retour : { goal, weeks: [{num, volumeKm, deload, taper, days:[{kind, km, paceTarget, desc, done}]}],
            zones, fitness, generatedAt }
 Regles : +10%/sem max, decharge toutes les 4 semaines, taper 2 dernieres semaines,
          sortie longue = 40% du volume (plafonnee), derniere semaine = jour de course.
*/
export function generatePlan({ goal, raceDate, fitness }) {
  const g = RUN_GOALS[goal];
  if (!g) return null;
  // Zones : test 5K recent (mesure maximale, fiable) > mediane d'entrainement (biaisee)
  const zones = fitness.testPace ? paceZonesFromTest(fitness.testPace) : paceZones(fitness.basePace);
  const rp = fitness.testPace ? racePaceFromTest(fitness.testPace, g.distanceKm) : racePace(fitness.basePace, g.distanceKm);

  let weeks = g.weeks;
  if (raceDate) {
    const left = Math.floor((new Date(raceDate).getTime() - Date.now()) / (7 * 86400000));
    weeks = Math.max(6, Math.min(g.weeks, left));
  }
  const sessionsPerWeek = fitness.level === "debutant" ? 3 : 4;
  const peak = g.peak[fitness.level] || g.peak.debutant;
  let vol = Math.max(fitness.weeklyKm || 0, g.minVolume);

  const out = [];
  let prevVol = vol;
  for (let w = 1; w <= weeks; w++) {
    const isTaper = w >= weeks - 1;
    const isDeload = !isTaper && w % 4 === 0;
    let volumeKm;
    // Taper : 2 semaines, volume -40% puis -55% du pic REELLEMENT atteint (prevVol, pas la
    // cible theorique), INTENSITE ET FREQUENCE MAINTENUES (Bosquet 2007 : -41-60% = optimal)
    if (isTaper) volumeKm = Math.round(prevVol * (w === weeks ? 0.45 : 0.6));
    else if (isDeload) volumeKm = Math.round(prevVol * 0.7);
    else { volumeKm = Math.round(Math.min(prevVol * 1.10, peak)); prevVol = volumeKm; }

    // Sortie longue plafonnee a 30% du volume hebdo (consensus prevention blessure)
    const longKm = Math.min(Math.round(volumeKm * 0.3 * 10) / 10, g.longCap);
    const days = [];
    days.push({ kind: "endurance", km: Math.round(volumeKm * 0.28 * 10) / 10, paceTarget: zones.endurance,
                desc: "Allure confortable, tu dois pouvoir parler. Finis par 4 lignes droites de 20s vives (economie de course).", done: null });
    // Distribution PYRAMIDALE pour coureur recreatif (Rosenblat 2025, meta-analyse en reseau) :
    // beaucoup de facile, du seuil regulier, le VO2max en petite dose. Debutant : tempo uniquement.
    const wantsIntervals = fitness.level !== "debutant" && w % 2 === 0 && !isTaper;
    if (wantsIntervals) {
      days.push({ kind: "intervalles", km: Math.round(volumeKm * 0.17 * 10) / 10, paceTarget: zones.intervalle,
                  desc: "5-6 x 800-1000 m a allure test 5K, recup 2-3 min en trottinant. Arrete la serie si l'allure s'effondre.", done: null });
    } else {
      days.push({ kind: "tempo", km: Math.round(volumeKm * 0.2 * 10) / 10, paceTarget: zones.tempo,
                  desc: "20-30 min continues a allure seuil : inconfortable mais regulier, phrase courte possible.", done: null });
    }
    if (sessionsPerWeek === 4) {
      days.push({ kind: "endurance", km: Math.round(volumeKm * 0.15 * 10) / 10, paceTarget: zones.endurance,
                  desc: "Footing court de recuperation, vraiment lent.", done: null });
    }
    if (w === weeks) {
      days.push({ kind: "course", km: g.distanceKm, paceTarget: rp,
                  desc: `Jour J : ${g.label}. Pars prudent, negative split : la 2e moitie plus vite que la 1re.`, done: null });
    } else {
      days.push({ kind: "longue", km: longKm, paceTarget: Math.round((zones.endurance + 0.3) * 100) / 100,
                  desc: "Le donjon de la semaine : lent et long, c'est lui qui construit le moteur.", done: null });
    }
    out.push({ num: w, volumeKm, deload: isDeload, taper: isTaper, days });
  }
  return { goal, weeks: out, zones: Object.assign({ course: rp }, zones), fitness, generatedAt: new Date().toISOString() };
}

// Semaine courante du plan (1-based) selon generatedAt ; clampee a la derniere semaine
export function currentWeek(plan) {
  if (!plan) return 1;
  const elapsed = Math.floor((Date.now() - new Date(plan.generatedAt).getTime()) / (7 * 86400000));
  return Math.max(1, Math.min(plan.weeks.length, elapsed + 1));
}

// Rapproche les runs de l'historique des jours du plan (±30% de distance, meme semaine du plan),
// marque done, et retourne le premier jour non fait de la semaine courante (ou null).
export function nextWorkout(plan, history) {
  if (!plan) return null;
  const start = new Date(plan.generatedAt).getTime();
  const runs = (history || []).filter(h => h.type === "run" && h.run && new Date(h.date).getTime() >= start);
  const used = new Set();
  for (const week of plan.weeks) {
    for (const day of week.days) {
      if (day.done) continue;
      const match = runs.find(h => {
        if (used.has(h.date)) return false;
        const wk = Math.floor((new Date(h.date).getTime() - start) / (7 * 86400000)) + 1;
        if (wk !== week.num) return false;
        return Math.abs((h.run.distanceKm || 0) - day.km) <= day.km * 0.3;
      });
      if (match) { day.done = { date: match.date, stravaId: match.stravaId || null }; used.add(match.date); }
    }
  }
  const cw = currentWeek(plan);
  const week = plan.weeks[cw - 1];
  return (week && week.days.find(d => !d.done)) || null;
}

// Recalage BIDIRECTIONNEL : regenere le plan depuis maintenant avec le fitness recalcule si
// (a) decrochage : 2 semaines consecutives < 60% du volume prevu (le plan redescend), ou
// (b) surperformance / test : le niveau reel a change (allure -0.25 min/km, volume +20%,
//     ou nouveau test 5K) — le plan monte. Retourne le nouveau plan ou null.
export function adaptPlan(plan, runs, raceDate) {
  if (!plan) return null;
  const start = new Date(plan.generatedAt).getTime();
  const cw = currentWeek(plan);
  if (cw < 3) return null; // pas assez de recul

  const fitness = estimateFitness(runs, null);

  // (a) decrochage
  let weakStreak = 0;
  for (let w = cw - 2; w < cw; w++) {
    const week = plan.weeks[w - 1];
    if (!week) continue;
    const done = (runs || []).filter(h => {
      const wk = Math.floor((new Date(h.date).getTime() - start) / (7 * 86400000)) + 1;
      return h.type === "run" && wk === w;
    }).reduce((a, h) => a + (h.run.distanceKm || 0), 0);
    if (done < week.volumeKm * 0.6) weakStreak++; else weakStreak = 0;
  }
  if (weakStreak >= 2) return generatePlan({ goal: plan.goal, raceDate: raceDate || null, fitness });

  // (b) progression reelle : test 5K plus recent que le plan, allure nettement meilleure, ou volume superieur
  const old = plan.fitness || {};
  const newTest = fitness.testPace && (!old.testPace || fitness.testPace < old.testPace - 0.05);
  const fasterPace = old.basePace && fitness.basePace < old.basePace - 0.25;
  const moreVolume = old.weeklyKm && fitness.weeklyKm > old.weeklyKm * 1.2;
  if (newTest || fasterPace || moreVolume) {
    return generatePlan({ goal: plan.goal, raceDate: raceDate || null, fitness });
  }
  return null;
}
