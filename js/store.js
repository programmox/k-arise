// K-Arise - gestion de l'etat et persistance (local-first, zero cloud)
// L'etat vit dans localStorage. Export/import JSON pour rendre le dossier portable (Mac -> Pixel).

const KEY = "karise_save_v1";

const RANKS = [
  { rank: "E", min: 1 },
  { rank: "D", min: 6 },
  { rank: "C", min: 12 },
  { rank: "B", min: 20 },
  { rank: "A", min: 30 },
  { rank: "S", min: 45 }
];

const DEFAULT_STATE = {
  onboarded: false,
  profile: {
    name: "",
    sex: "",
    age: null,
    weightKg: null,
    heightCm: null,
    job: "",
    experience: "debutant",   // debutant | intermediaire | avance
    classe: "Hunter",
    benchmarks: {},           // perfs habituelles : pushups, pullups, plank, squat, kbSwing, deadHang
    nutritionGoal: "prise-muscle" // prise-muscle | recomposition | seche | maintien
  },
  goals: [],            // groupes musculaires cibles (ex: ["dos", "mobilite-genou"])
  equipment: [],        // cles materiel (kettlebell, elastique, poignees, barre-traction)
  pantry: [],           // inventaire cuisine (cles ingredients dispo)
  exoState: {},         // progression par exo : id -> {reps, work, weight, prReps, prWork, prWeight, lastRpe}
  titles: [],           // titres debloques (ids)
  activeSession: null,  // seance en cours (mise en pause) : { session, index, savedAt }
  settings: { sound: true, vibration: true }, // reglages chrono
  stats: { force: 5, mobilite: 5, endurance: 5, core: 5, discipline: 5 },
  xp: 0,
  energy: 100,          // 0-100, recuperation simulee
  history: [],          // seances faites (muscu ET runs, voir type)
  running: {            // course a pied : objectif + plan d'entrainement genere localement
    goal: null,         // "5k" | "10k" | "semi" | "marathon"
    raceDate: null,     // date cible ISO (optionnel)
    questionnaire: null,// { level, weeklyKm, longestKm } si pas assez de runs pour estimer
    plan: null,         // plan genere (running.js) - stocke pour rester dispo hors-ligne
    planGeneratedAt: null
  },
  strava: {             // connexion Strava (app API personnelle de l'utilisateur)
    clientId: "", clientSecret: "",           // saisis dans Profil ; stockes localement uniquement
    accessToken: null, refreshToken: null, expiresAt: 0, // epoch secondes (format Strava)
    athleteName: null,
    lastSyncAt: null, lastSyncError: null,
    autoSync: true
  },
  photoDir: null,       // nom du dossier choisi (info seulement, photos hors localStorage)
  lastBackupAt: null,   // derniere date d'export JSON (pour le rappel de sauvegarde)
  createdAt: null,
  updatedAt: null
};

let state = null;

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = mergeDefaults(JSON.parse(raw));
    } else {
      state = structuredClone(DEFAULT_STATE);
      state.createdAt = new Date().toISOString();
    }
  } catch (e) {
    console.error("Etat illisible, reinitialisation:", e);
    state = structuredClone(DEFAULT_STATE);
  }
  return state;
}

function mergeDefaults(saved) {
  const s = structuredClone(DEFAULT_STATE);
  Object.assign(s, saved);
  s.profile = Object.assign({}, DEFAULT_STATE.profile, saved.profile || {});
  s.profile.benchmarks = Object.assign({}, (saved.profile && saved.profile.benchmarks) || {});
  s.stats = Object.assign({}, DEFAULT_STATE.stats, saved.stats || {});
  s.exoState = Object.assign({}, saved.exoState || {});
  s.titles = Array.isArray(saved.titles) ? saved.titles.slice() : [];
  s.settings = Object.assign({}, DEFAULT_STATE.settings, saved.settings || {});
  s.running = Object.assign({}, DEFAULT_STATE.running, saved.running || {});
  s.strava = Object.assign({}, DEFAULT_STATE.strava, saved.strava || {});
  // Robustesse : ne garder que les entrees bien formees (protege tous les parcours
  // qui iterent l'historique). Une seance muscu a exercises[], un run a run{} ;
  // on normalise exercises:[] sur les runs pour que tous les iterateurs restent valides.
  s.history = (Array.isArray(saved.history) ? saved.history : [])
    .filter(h => h && (Array.isArray(h.exercises) || (h.type === "run" && h.run)))
    .map(h => (Array.isArray(h.exercises) ? h : Object.assign({ exercises: [] }, h)));
  return s;
}

export function getSettings() { return getState().settings; }
export function setSetting(key, value) { const s = getState(); s.settings[key] = value; saveState(); }

export function getExoState(id) {
  const s = getState();
  return s.exoState[id] || null;
}

// ---------- Seance en cours (pause / reprise) ----------
export function setActiveSession(data) { const s = getState(); s.activeSession = data; saveState(); }
export function getActiveSession() { return getState().activeSession; }
export function clearActiveSession() { const s = getState(); s.activeSession = null; saveState(); }

// Heures de recuperation de base par groupe (gros polyarticulaires recuperent plus lentement)
const RECOVERY_BASE = {
  dos: 48, lombaires: 48, jambes: 48, fessiers: 48, pectoraux: 48,
  epaules: 36, bras: 36, obliques: 30,
  abdos: 24, core: 24,
  "mobilite-genou": 12, "mobilite-hanche": 12, cardio: 18
};

export function getState() {
  if (!state) loadState();
  return state;
}

// Handler appele si l'ecriture localStorage echoue (stockage plein / indisponible).
// Branche par l'UI (screens.js) pour alerter l'utilisateur sans coupler store -> screens.
let onSaveError = null;
export function setSaveErrorHandler(fn) { onSaveError = fn; }

export function saveState() {
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    // QuotaExceededError (mobile, navigation privee) ou stockage desactive :
    // la seance reste en memoire mais n'est pas persistee. On previent l'utilisateur.
    console.error("Echec de sauvegarde (stockage plein ou indisponible) :", e);
    if (onSaveError) onSaveError(e);
    return false;
  }
}

// ---------- Niveau / rang ----------
export function levelFromXp(xp) {
  // courbe simple : niveau n demande 100 * n XP cumule croissant
  let lvl = 1, need = 100, acc = 0;
  while (xp >= acc + need) { acc += need; lvl++; need = 100 + (lvl - 1) * 60; }
  return { level: lvl, intoLevel: xp - acc, forNext: need };
}

export function rankFromLevel(level) {
  let r = "E";
  for (const t of RANKS) if (level >= t.min) r = t.rank;
  return r;
}

export function progress() {
  const s = getState();
  const lv = levelFromXp(s.xp);
  return {
    xp: s.xp,
    level: lv.level,
    intoLevel: lv.intoLevel,
    forNext: lv.forNext,
    rank: rankFromLevel(lv.level)
  };
}

// ---------- Rang base sur la PERFORMANCE REELLE (standards de force reconnus) ----------
export const RANK_LETTERS = ["E", "D", "C", "B", "A", "S"];

// Seuils par mouvement (homme, references Strength Level / Legion). Index = palier 0..5.
const RANK_THRESHOLDS = {
  pullups: [0, 2, 6, 13, 23, 32],   // tractions strictes
  pushups: [0, 10, 20, 40, 55, 75],
  plank: [0, 30, 60, 120, 180, 300], // secondes
  squat: [0, 25, 40, 60, 90, 120]    // squats poids du corps
};

function tierFor(metric, value) {
  const t = RANK_THRESHOLDS[metric];
  let tier = 0;
  for (let i = 0; i < t.length; i++) if (value >= t[i]) tier = i;
  return tier;
}

// Meilleure valeur connue d'un mouvement : max du benchmark d'onboarding et du record reel
function bestMetrics() {
  const s = getState();
  const bm = s.profile.benchmarks || {};
  const xs = s.exoState || {};
  const pr = (id, field) => (xs[id] && xs[id][field]) || 0;
  return {
    pullups: Math.max(bm.pullups || 0, pr("pull-up", "prReps")),          // strictes uniquement (assistee exclue)
    pushups: Math.max(bm.pushups || 0, pr("push-up", "prReps")),
    plank: Math.max(bm.plank || 0, pr("plank", "prWork"), pr("hollow-hold", "prWork")),
    squat: Math.max(bm.squat || 0, pr("kb-goblet-squat", "prReps"))
  };
}

// Rang global = moyenne des paliers sur les mouvements renseignes
export function performanceRank() {
  const m = bestMetrics();
  const keys = Object.keys(RANK_THRESHOLDS).filter(k => m[k] > 0);
  if (keys.length === 0) return { rank: "E", index: 0, detail: m, tiers: {} };
  const tiers = {};
  let sum = 0;
  for (const k of keys) { tiers[k] = tierFor(k, m[k]); sum += tiers[k]; }
  const index = Math.round(sum / keys.length);
  return { rank: RANK_LETTERS[index], index, detail: m, tiers };
}

// ---------- Serie (streak) de jours consecutifs ----------
export function currentStreak() {
  const s = getState();
  if (!s.history.length) return 0;
  const days = new Set(s.history.map(h => new Date(h.date).toDateString()));
  let streak = 0;
  const d = new Date();
  // tolere : si pas d'entrainement aujourd'hui, on part d'hier
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

// ---------- Titres meritables ----------
// condition(ctx) ou ctx = { metrics, rankIndex, totalSessions, streak }
export const TITLES = [
  { id: "dos-acier", label: "Dos d'Acier", xp: 150, cond: c => c.metrics.pullups >= 10, hint: "10 tractions strictes" },
  { id: "noyau-fer", label: "Noyau de Fer", xp: 120, cond: c => c.metrics.plank >= 120, hint: "2 min de gainage" },
  { id: "forge-pecto", label: "Forge Pectorale", xp: 120, cond: c => c.metrics.pushups >= 40, hint: "40 pompes" },
  { id: "jambes-titan", label: "Jambes de Titan", xp: 120, cond: c => c.metrics.squat >= 60, hint: "60 squats" },
  { id: "discipline", label: "Discipline", xp: 100, cond: c => c.streak >= 7, hint: "7 jours de serie" },
  { id: "inarretable", label: "Inarretable", xp: 250, cond: c => c.streak >= 30, hint: "30 jours de serie" },
  { id: "acharne", label: "Le Travailleur Acharne", xp: 200, cond: c => c.totalSessions >= 50, hint: "50 quetes" },
  { id: "chasseur", label: "Chasseur Confirme", xp: 180, cond: c => c.rankIndex >= 2, hint: "Rang C atteint" },
  { id: "coureur-ombre", label: "Coureur de l'Ombre", xp: 150, cond: c => c.longestRun >= 10, hint: "10 km en une sortie" },
  { id: "marathonien", label: "Marathonien", xp: 400, cond: c => c.longestRun >= 42.1, hint: "42.2 km en une sortie" },
  { id: "explorateur", label: "Explorateur", xp: 200, cond: c => c.totalRunKm >= 100, hint: "100 km courus au total" }
];

function titleContext() {
  const s = getState();
  let totalRunKm = 0, longestRun = 0;
  for (const h of s.history) {
    if (h.type === "run" && h.run) {
      totalRunKm += h.run.distanceKm || 0;
      longestRun = Math.max(longestRun, h.run.distanceKm || 0);
    }
  }
  return {
    metrics: bestMetrics(),
    rankIndex: performanceRank().index,
    totalSessions: s.history.length,
    streak: currentStreak(),
    totalRunKm, longestRun
  };
}

export function earnedTitleIds() {
  const ctx = titleContext();
  return TITLES.filter(t => t.cond(ctx)).map(t => t.id);
}

export function titleById(id) { return TITLES.find(t => t.id === id); }

// Titre "actif" affiche sur le statut : le dernier debloque, par ordre du catalogue
export function activeTitle() {
  const s = getState();
  const earned = TITLES.filter(t => s.titles.includes(t.id));
  return earned.length ? earned[earned.length - 1] : null;
}

// Instantane de l'etat de jeu pour detecter les evenements (rang up, titres, niveau, streak)
function deriveSnapshot() {
  const p = progress();
  return {
    xp: p.xp, level: p.level,
    rankIndex: performanceRank().index, rank: performanceRank().rank,
    titles: earnedTitleIds(), streak: currentStreak()
  };
}

// ---------- Enregistrer une seance ----------
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

// Applique la surcharge progressive d'une seance a un etat exoState (mute exoState).
// Fonction pure et partagee : utilisee a l'enregistrement ET au recalcul depuis l'historique.
// Retour : { prs, changes, xp } pour cette seance.
function progressEntry(exoState, entry) {
  const prs = [];
  const changes = [];
  const exercises = Array.isArray(entry.exercises) ? entry.exercises : [];
  for (const e of exercises) {
    if (!e || !e.id || !e.rpe) continue; // exo invalide ou non logge (echauffement)
    const st = Object.assign({}, exoState[e.id] || {});

    if (e.actualReps != null && e.actualReps > (st.prReps || 0)) {
      st.prReps = e.actualReps; prs.push({ name: e.name, label: e.actualReps + " reps" });
    }
    if (e.actualWork != null && e.actualWork > (st.prWork || 0)) {
      st.prWork = e.actualWork; prs.push({ name: e.name, label: e.actualWork + "s" });
    }
    if (e.weight != null && e.weight > (st.prWeight || 0)) st.prWeight = e.weight;

    if (e.type === "reps") {
      const base = e.actualReps != null ? e.actualReps : (st.reps || 10);
      const prev = st.reps || base;
      let next = e.rpe === "facile" ? base + 2 : e.rpe === "correct" ? base + 1 : base;
      next = clampN(next, 5, 40);
      st.reps = next;
      if (e.weight != null) st.weight = e.weight;
      if (e.weight != null && e.rpe === "facile" && next >= 18) {
        changes.push({ name: e.name, note: "passe au cran de kettlebell superieur" });
      } else if (next !== prev) {
        changes.push({ name: e.name, from: prev, to: next, unit: "reps" });
      }
    } else if (e.type === "isometric" || e.type === "interval") {
      const base = e.actualWork != null ? e.actualWork : (st.work || 30);
      const prev = st.work || base;
      let next = e.rpe === "facile" ? base + 5 : e.rpe === "correct" ? base + 3 : base;
      next = clampN(next, 15, 120);
      st.work = next;
      if (next !== prev) changes.push({ name: e.name, from: prev, to: next, unit: "s" });
    }
    st.lastRpe = e.rpe;
    exoState[e.id] = st;
  }
  const totalSets = exercises.reduce((a, e) => a + (e.sets || 1), 0);
  const xp = 40 + totalSets * 12 + Math.round((entry.durationMin || 0) * 2) + prs.length * 25;
  return { prs, changes, xp };
}

// XP d'un run : base + distance + duree + bonus PR d'allure (meilleure allure connue sur >= 3 km).
// bestPace = meilleure allure (min/km) des runs anterieurs, ou null.
function runXp(entry, bestPace) {
  const r = entry.run || {};
  let xp = 30 + Math.round((r.distanceKm || 0) * 12) + Math.round((entry.durationMin || 0) * 1.5);
  if ((r.distanceKm || 0) >= 3 && r.paceMinKm && bestPace != null && r.paceMinKm < bestPace) xp += 20;
  return xp;
}

// Recalcule TOUT l'etat derive (xp, stats, exoState) a partir de l'historique.
// Source de verite unique : permet d'editer/supprimer une seance passee sans incoherence.
export function recomputeDerived() {
  const s = getState();
  s.stats = { force: 5, mobilite: 5, endurance: 5, core: 5, discipline: 5 };
  s.xp = 0;
  s.exoState = {};
  let bestPace = null; // meilleure allure connue (runs >= 3 km), pour le bonus PR
  const chrono = [...s.history].reverse(); // du plus ancien au plus recent
  for (const entry of chrono) {
    if (entry.type === "run") {
      s.xp += runXp(entry, bestPace);
      s.stats.endurance = Math.min(99, Math.round((s.stats.endurance + 0.7) * 10) / 10);
      const r = entry.run || {};
      if ((r.distanceKm || 0) >= 3 && r.paceMinKm && (bestPace == null || r.paceMinKm < bestPace)) bestPace = r.paceMinKm;
    } else {
      const r = progressEntry(s.exoState, entry);
      s.xp += r.xp;
      bumpStatsFromSession(s, entry);
    }
    s.stats.discipline = Math.min(99, s.stats.discipline + 1);
  }
  // titres debloques + bonus XP associe (deterministe)
  s.titles = earnedTitleIds();
  s.xp += s.titles.reduce((a, id) => a + ((titleById(id) || {}).xp || 0), 0);
  saveState();
}

function buildEvents(before, after) {
  const ev = [];
  if (after.level > before.level) ev.push({ type: "level", level: after.level });
  if (after.rankIndex > before.rankIndex) ev.push({ type: "rank", from: before.rank, to: after.rank });
  for (const id of after.titles.filter(t => !before.titles.includes(t))) {
    const t = titleById(id);
    if (t) ev.push({ type: "title", label: t.label, hint: t.hint, xp: t.xp });
  }
  for (const m of [7, 14, 30, 60, 100]) {
    if (before.streak < m && after.streak >= m) ev.push({ type: "streak", days: m });
  }
  return ev;
}

function normalizeEntry(session) {
  return {
    date: new Date().toISOString(),
    type: session.type || "express",
    durationMin: session.durationMin || 0,
    exercises: session.exercises.map(e => ({
      id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, sets: e.sets || 1,
      type: e.type, actualReps: e.actualReps ?? null, actualWork: e.actualWork ?? null,
      weight: e.weight ?? null, rpe: e.rpe ?? null
    }))
  };
}

/*
 recordSession(session) -> { gained, leveledUp, before, after, prs, changes }
 Ajoute la seance puis recalcule l'etat derive (deterministe).
*/
export function recordSession(session) {
  const s = getState();
  recomputeDerived();                 // coherence avec l'historique existant
  const before = deriveSnapshot();

  const entry = normalizeEntry(session);
  s.history.unshift(entry);
  if (s.history.length > 500) s.history.pop();

  // prs/changes propres a CETTE seance : on rejoue l'historique anterieur pour obtenir l'etat juste avant
  const prevState = {};
  const older = [...s.history].reverse(); // ancien -> recent ; le dernier est la nouvelle seance
  older.pop();
  for (const en of older) progressEntry(prevState, en);
  const { prs, changes } = progressEntry(prevState, entry);

  recomputeDerived();
  s.energy = Math.max(0, s.energy - Math.min(40, entry.durationMin));
  saveState();

  const after = deriveSnapshot();
  const events = buildEvents(before, after);
  return {
    gained: after.xp - before.xp,
    leveledUp: after.level > before.level,
    before, after, prs, changes, events
  };
}

// ---------- Editer / reinitialiser des perfs passees ----------
// updateSessionPerfs(index, exercises) : remplace les actuals/rpe d'une seance et recalcule tout.
export function updateSessionPerfs(index, exercises) {
  const s = getState();
  if (!s.history[index]) return;
  const ex = s.history[index].exercises;
  exercises.forEach((upd, i) => {
    if (!ex[i]) return;
    ex[i].actualReps = upd.actualReps ?? null;
    ex[i].actualWork = upd.actualWork ?? null;
    ex[i].weight = upd.weight ?? null;
    ex[i].rpe = upd.rpe ?? null;
  });
  recomputeDerived();
}

export function deleteSession(index) {
  const s = getState();
  if (!s.history[index]) return;
  s.history.splice(index, 1);
  recomputeDerived();
}

// ---------- Course a pied ----------
// Normalise une entree run pour l'historique. exercises:[] OBLIGATOIRE :
// le filtre de mergeDefaults et tous les iterateurs d'historique en dependent.
function normalizeRunEntry(data) {
  const distanceKm = Math.max(0.1, Number(data.distanceKm) || 0);
  const durationMin = Math.max(1, Math.round(Number(data.durationMin) || 0));
  return {
    date: data.date || new Date().toISOString(),
    type: "run",
    source: data.source || "manual",
    stravaId: data.stravaId ?? null,
    durationMin,
    exercises: [],
    run: {
      distanceKm: Math.round(distanceKm * 100) / 100,
      paceMinKm: Math.round((durationMin / distanceKm) * 100) / 100,
      avgHr: data.avgHr ?? null,
      elevation: data.elevation ?? null,
      kind: data.kind || null,
      planWeek: data.planWeek ?? null,
      planDay: data.planDay ?? null
    }
  };
}

// Meilleure allure connue sur les runs >= 3 km (pour detecter un PR d'allure)
function bestKnownPace(history, exceptFirst) {
  let best = null;
  const list = exceptFirst ? history.slice(1) : history;
  for (const h of list) {
    if (h.type !== "run" || !h.run) continue;
    if ((h.run.distanceKm || 0) >= 3 && h.run.paceMinKm && (best == null || h.run.paceMinKm < best)) best = h.run.paceMinKm;
  }
  return best;
}

/*
 recordRun(data) -> { gained, events, isPacePr, entry }
 data = { distanceKm, durationMin, avgHr?, elevation?, kind?, date?, source?, stravaId? }
*/
export function recordRun(data) {
  const s = getState();
  recomputeDerived();
  const before = deriveSnapshot();

  const entry = normalizeRunEntry(data);
  s.history.unshift(entry);
  if (s.history.length > 500) s.history.pop();

  const prevBest = bestKnownPace(s.history, true);
  const isPacePr = (entry.run.distanceKm >= 3) && prevBest != null && entry.run.paceMinKm < prevBest;

  recomputeDerived();
  s.energy = Math.max(0, s.energy - Math.min(35, Math.round(entry.durationMin * 0.7)));
  saveState();

  const after = deriveSnapshot();
  return { gained: after.xp - before.xp, events: buildEvents(before, after), isPacePr, entry };
}

/*
 insertRuns(list) -> { added, skipped }
 Batch (sync Strava) : dedoublonne par stravaId, insere trie par date, UN SEUL recompute.
 Pas d'events systeme par run (evite le spam) — l'appelant affiche un recap.
*/
export function insertRuns(list) {
  const s = getState();
  const known = new Set(s.history.filter(h => h.stravaId != null).map(h => h.stravaId));
  let added = 0, skipped = 0;
  for (const data of (list || [])) {
    if (data.stravaId != null && known.has(data.stravaId)) { skipped++; continue; }
    s.history.push(normalizeRunEntry(data));
    if (data.stravaId != null) known.add(data.stravaId);
    added++;
  }
  if (added) {
    s.history.sort((a, b) => new Date(b.date) - new Date(a.date)); // recent -> ancien
    while (s.history.length > 500) s.history.pop();
    recomputeDerived();
  }
  saveState();
  return { added, skipped };
}

export function getRuns() {
  return getState().history.filter(h => h.type === "run" && h.run);
}

// Volume de course (km) par semaine calendaire ISO approx (cle = lundi de la semaine, ISO date)
export function weeklyRunVolume() {
  const out = {};
  for (const h of getRuns()) {
    const d = new Date(h.date);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    out[key] = Math.round(((out[key] || 0) + h.run.distanceKm) * 10) / 10;
  }
  return out;
}

function bumpStatsFromSession(s, entry) {
  const map = {
    dos: "force", lombaires: "force", pectoraux: "force", epaules: "force", bras: "force", jambes: "force", fessiers: "force",
    abdos: "core", obliques: "core", core: "core",
    "mobilite-genou": "mobilite", "mobilite-hanche": "mobilite",
    cardio: "endurance"
  };
  const hits = {};
  for (const e of entry.exercises) {
    const stat = map[e.primaryMuscle];
    if (stat) hits[stat] = (hits[stat] || 0) + 1;
  }
  for (const stat in hits) {
    // +1 si au moins 2 exos touchent ce stat, sinon chance partielle cumulee
    const inc = hits[stat] >= 2 ? 1 : 0.5;
    s.stats[stat] = Math.min(99, Math.round((s.stats[stat] + inc) * 10) / 10);
  }
}

// Detecte les groupes en retard sur les 7 derniers jours (modele "dette de volume")
export function muscleDebt() {
  const s = getState();
  const weekAgo = Date.now() - 7 * 86400000;
  const counts = {};
  for (const h of s.history) {
    if (new Date(h.date).getTime() < weekAgo) continue;
    for (const e of h.exercises) counts[e.primaryMuscle] = (counts[e.primaryMuscle] || 0) + (e.sets || 1);
  }
  // un objectif est "en dette" si moins de 6 series cette semaine
  const debt = [];
  for (const g of s.goals) {
    if ((counts[g] || 0) < 6) debt.push({ muscle: g, sets: counts[g] || 0 });
  }
  return debt;
}

// ---------- Recuperation (modele simple base sur volume + groupe) ----------
// Retourne une map muscle -> { lastTrained, hours, recoveredAt, hoursLeft, recovered, sets }
export function recoveryStatus() {
  const s = getState();
  const now = Date.now();
  const res = {};
  for (const h of s.history) { // historique du plus recent au plus ancien
    const t = new Date(h.date).getTime();
    const sessionSets = {};
    for (const e of h.exercises) sessionSets[e.primaryMuscle] = (sessionSets[e.primaryMuscle] || 0) + (e.sets || 1);
    for (const m in sessionSets) {
      if (res[m]) continue; // on garde la session la plus recente pour ce muscle
      const base = RECOVERY_BASE[m] || 36;
      const vol = sessionSets[m];
      const hours = Math.round(base + Math.max(0, vol - 6) * 2); // gros volume = recup plus longue
      const recoveredAt = t + hours * 3600000;
      const hoursLeft = Math.max(0, (recoveredAt - now) / 3600000);
      res[m] = { lastTrained: t, hours, recoveredAt, hoursLeft: Math.round(hoursLeft), recovered: hoursLeft <= 0, sets: vol };
    }
  }
  return res;
}

// Conseil pour une seance ciblee : est-ce contre-productif maintenant ?
export function recoveryAdvice(targets) {
  const rec = recoveryStatus();
  const recovering = [];
  for (const m of targets) {
    if (rec[m] && !rec[m].recovered) recovering.push({ muscle: m, hoursLeft: rec[m].hoursLeft });
  }
  recovering.sort((a, b) => b.hoursLeft - a.hoursLeft);
  if (recovering.length === 0) {
    return { level: "go", recovering, msg: "Feu vert. Ces groupes sont recuperes, la seance sera productive." };
  }
  const worst = recovering[0].hoursLeft;
  if (worst >= 24) {
    return { level: "stop", recovering, msg: "Contre-productif : ces muscles sont encore en pleine recuperation. Tu limiterais tes gains (volume junk). Vise plutot un autre groupe, de la mobilite ou du cardio leger." };
  }
  return { level: "caution", recovering, msg: "Recuperation partielle. Faisable en allege (moins de series, intensite moderee), ou cible un autre groupe pour de meilleurs gains." };
}

// ---------- Suivi mensuel ----------
export function monthlyStats(ref) {
  const s = getState();
  const now = ref ? new Date(ref) : new Date();
  const y = now.getFullYear(), mo = now.getMonth();
  const days = {};
  let count = 0;
  for (const h of s.history) {
    const d = new Date(h.date);
    if (d.getFullYear() === y && d.getMonth() === mo) {
      count++;
      days[d.getDate()] = (days[d.getDate()] || 0) + 1;
    }
  }
  return { count, days, year: y, month: mo, daysInMonth: new Date(y, mo + 1, 0).getDate(), today: now.getDate() };
}

// ---------- Mission du jour (passerelle avant le programme long terme de la Phase 2) ----------
export function dailyMission() {
  const s = getState();
  const rec = recoveryStatus();
  const debt = muscleDebt().map(d => d.muscle);
  const recoveredGoals = s.goals.filter(g => !rec[g] || rec[g].recovered);
  const debtRecovered = recoveredGoals.filter(g => debt.includes(g));

  let targets, reason;
  if (debtRecovered.length) {
    targets = debtRecovered.slice(0, 2);
    reason = "En retard cette semaine et recupere : a prioriser aujourd'hui.";
  } else if (recoveredGoals.length) {
    targets = recoveredGoals.slice(0, 2);
    reason = "Groupe recupere, pret a encaisser du volume.";
  } else {
    // tout est en recuperation : on propose mobilite / recup active
    targets = ["mobilite-genou"];
    reason = "Tes groupes cibles recuperent encore. Recup active : mobilite et cardio leger pour optimiser tes gains.";
  }
  return { targets, minutes: 15, reason };
}

// ---------- Export / import (portabilite du dossier) ----------
export function exportSave() {
  const s = getState();
  s.lastBackupAt = new Date().toISOString();
  saveState();
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "k-arise-save.json";
  a.click();
  URL.revokeObjectURL(url);
}

// Le rappel de sauvegarde est du si l'utilisateur a un historique et n'a pas exporte
// depuis plus de 7 jours (ou jamais, 7 jours apres la creation du profil).
const BACKUP_INTERVAL = 7 * 86400000;
export function backupReminderDue() {
  const s = getState();
  if (!s.history.length) return false;
  const ref = s.lastBackupAt || s.createdAt;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() > BACKUP_INTERVAL;
}

// Valide la structure minimale d'une sauvegarde importee avant de l'appliquer.
// Un JSON syntaxiquement correct mais non conforme (history non-tableau, etc.)
// planterait recomputeDerived et rendrait l'app inutilisable (ecran blanc).
function isValidSave(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  if ("history" in obj && !Array.isArray(obj.history)) return false;
  if ("profile" in obj && (typeof obj.profile !== "object" || obj.profile === null)) return false;
  return true;
}

export function importSave(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        if (!isValidSave(parsed)) throw new Error("Structure de sauvegarde invalide");
        state = mergeDefaults(parsed);
        saveState();
        resolve(state);
      } catch (e) { reject(e); }
    };
    r.onerror = reject;
    r.readAsText(file);
  });
}

export function resetAll() {
  localStorage.removeItem(KEY);
  state = structuredClone(DEFAULT_STATE);
  state.createdAt = new Date().toISOString();
  saveState();
}
