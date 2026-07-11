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
  course: "JOUR DE COURSE"
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

// Etirements post-course (recuperation). Meme logique que les consignes muscu : local, systematique.
export const STRETCHES = [
  { name: "Quadriceps debout", sec: 30, cue: "Talon vers la fesse, genoux serres, bassin neutre. 30s par jambe." },
  { name: "Ischio-jambiers", sec: 30, cue: "Jambe tendue sur un support bas, dos droit, penche-toi depuis la hanche." },
  { name: "Mollets contre un mur", sec: 30, cue: "Jambe arriere tendue, talon au sol, pousse le mur. 30s par jambe." },
  { name: "Psoas (fente basse)", sec: 30, cue: "Genou arriere au sol, pousse le bassin vers l'avant, buste droit." },
  { name: "Fessiers (chiffre 4)", sec: 30, cue: "Allonge, cheville sur le genou oppose, tire la cuisse vers toi." }
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
    return { level, weeklyKm, basePace: Math.round(basePace * 100) / 100, longestKm, source: "runs" };
  }

  if (questionnaire && questionnaire.level) {
    const q = questionnaire;
    const basePace = q.level === "avance" ? 5.0 : q.level === "intermediaire" ? 5.8 : 6.5;
    return { level: q.level, weeklyKm: q.weeklyKm || 10, basePace, longestKm: q.longestKm || 5, source: "questionnaire" };
  }

  return { level: "debutant", weeklyKm: 10, basePace: 6.5, longestKm: 5, source: "defaut" };
}

// Zones d'allure derivees de l'allure de base (Jack Daniels ultra-simplifie)
export function paceZones(basePace) {
  return {
    endurance: Math.round((basePace + 0.65) * 100) / 100,
    tempo: Math.round((basePace - 0.3) * 100) / 100,
    intervalle: Math.round((basePace - 0.8) * 100) / 100
  };
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
  const zones = paceZones(fitness.basePace);
  const rp = racePace(fitness.basePace, g.distanceKm);

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
    if (isTaper) volumeKm = Math.round(peak * (w === weeks ? 0.5 : 0.75));
    else if (isDeload) volumeKm = Math.round(prevVol * 0.7);
    else { volumeKm = Math.round(Math.min(prevVol * 1.10, peak)); prevVol = volumeKm; }

    const longKm = Math.min(Math.round(volumeKm * 0.4 * 10) / 10, g.longCap);
    const days = [];
    days.push({ kind: "endurance", km: Math.round(volumeKm * 0.25 * 10) / 10, paceTarget: zones.endurance,
                desc: "Allure confortable, tu dois pouvoir parler.", done: null });
    if (w % 2 === 1) {
      days.push({ kind: "tempo", km: Math.round(volumeKm * 0.2 * 10) / 10, paceTarget: zones.tempo,
                  desc: "Allure soutenue et reguliere, inconfortable mais tenable.", done: null });
    } else {
      days.push({ kind: "intervalles", km: Math.round(volumeKm * 0.18 * 10) / 10, paceTarget: zones.intervalle,
                  desc: "6-10 x 400-800 m rapides, recup trot egale a l'effort.", done: null });
    }
    if (sessionsPerWeek === 4) {
      days.push({ kind: "endurance", km: Math.round(volumeKm * 0.15 * 10) / 10, paceTarget: zones.endurance,
                  desc: "Footing court de recuperation.", done: null });
    }
    if (w === weeks) {
      days.push({ kind: "course", km: g.distanceKm, paceTarget: rp,
                  desc: `Jour J : ${g.label}. Pars prudent, finis fort.`, done: null });
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

// Recalage leger : si 2 semaines ecoulees consecutives < 60% du volume prevu,
// regenere le plan depuis maintenant avec le fitness recalcule. Retourne le nouveau plan ou null.
export function adaptPlan(plan, runs, raceDate) {
  if (!plan) return null;
  const start = new Date(plan.generatedAt).getTime();
  const cw = currentWeek(plan);
  if (cw < 3) return null; // pas assez de recul
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
  if (weakStreak < 2) return null;
  const fitness = estimateFitness(runs, null);
  return generatePlan({ goal: plan.goal, raceDate: raceDate || null, fitness });
}
