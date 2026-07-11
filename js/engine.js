// K-Arise - moteur de generation de seance (100% local, deterministe, hors-ligne)

let DB = null;

export const MUSCLE_LABELS = {
  abdos: "Abdos", obliques: "Obliques", dos: "Dos", lombaires: "Bas du dos",
  epaules: "Epaules", pectoraux: "Pectoraux", bras: "Bras", jambes: "Jambes",
  fessiers: "Fessiers", mollets: "Mollets", "mobilite-genou": "Mobilite genou",
  "mobilite-hanche": "Mobilite hanche", cardio: "Cardio", core: "Core"
};

export const EQUIPMENT_LABELS = {
  kettlebell: { label: "Kettlebell", icon: "ti-kettlebell" },
  elastique: { label: "Elastiques", icon: "ti-rotate" },
  poignees: { label: "Poignees / parallettes", icon: "ti-grip-horizontal" },
  "barre-traction": { label: "Barre de traction", icon: "ti-minus" }
};

export const GOAL_CHOICES = [
  "dos", "lombaires", "abdos", "obliques", "mobilite-genou",
  "jambes", "fessiers", "pectoraux", "epaules", "bras", "cardio"
];

// Benchmarks demandes a l'onboarding : patterns moteurs majeurs
export const BENCHMARKS = [
  { key: "pushups", label: "Pompes max (reps d'affilee)", placeholder: "20", unit: "reps" },
  { key: "pullups", label: "Tractions strictes max (0 si aucune)", placeholder: "5", unit: "reps" },
  { key: "plank", label: "Gainage planche max", placeholder: "60", unit: "sec" },
  { key: "squat", label: "Squats poids du corps max (reps)", placeholder: "30", unit: "reps" },
  { key: "kbSwing", label: "Kettlebell swing d'affilee (reps)", placeholder: "20", unit: "reps" },
  { key: "deadHang", label: "Suspension a la barre (dead hang)", placeholder: "30", unit: "sec" }
];

// Quel benchmark calibre quel exercice
const BENCH_PATTERN = {
  "push-up": "pushups", "pike-push-up": "pushups",
  "pull-up": "pullups", "band-assisted-pullup": "pullups",
  "plank": "plank", "side-plank": "plank", "hollow-hold": "plank",
  "kb-goblet-squat": "squat", "wall-sit": "squat",
  "kb-swing": "kbSwing"
};

export async function loadExercises() {
  if (DB) return DB;
  const res = await fetch("data/exercises.json");
  if (!res.ok) throw new Error("Impossible de charger la base d'exercices.");
  DB = await res.json();
  return DB;
}

export function allExercises() {
  return DB ? DB.exercises : [];
}

// Lien YouTube robuste (recherche, jamais de lien mort). THENX priorise pour le poids du corps.
export function videoUrl(exo) {
  const q = encodeURIComponent(exo.videoQuery || (exo.name + " exercise form"));
  return "https://www.youtube.com/results?search_query=" + q;
}

// Visuel local de posture (image fixe ou animation). Convention : assets/exo/<id>.webp,
// surchargeable par exo.anim (gif/webp anime) ou exo.image dans exercises.json.
// Local-first : aucun appel reseau ; si le fichier manque, onerror masque l'element cote rendu.
export function exoImageUrl(exo) {
  return exo.anim || exo.image || `assets/exo/${exo.id}.webp`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Niveau effectif : le max entre l'experience declaree et ce que revelent les benchmarks
export function effectiveMaxLevel(profile) {
  const bm = profile.benchmarks || {};
  let lvl = profile.experience === "avance" ? 3 : profile.experience === "intermediaire" ? 2 : 1;
  if ((bm.pullups || 0) >= 12 || (bm.pushups || 0) >= 40) lvl = Math.max(lvl, 3);
  else if ((bm.pullups || 0) >= 5 || (bm.pushups || 0) >= 25) lvl = Math.max(lvl, 2);
  else lvl = Math.max(lvl, 2); // on autorise au moins le niveau 2 par defaut
  return lvl;
}

export function isWeighted(exo) {
  return !!(exo.equipment && exo.equipment.includes("kettlebell"));
}

// Dose effective : benchmarks d'abord, puis surcharge progressive reelle (prioritaire)
function effectiveDose(exo, bm, exoState) {
  let reps = exo.defaultReps, work = exo.defaultWork;
  const pat = BENCH_PATTERN[exo.id];
  const v = bm && pat ? bm[pat] : null;
  if (v && v > 0) {
    if (exo.type === "isometric") work = clamp(Math.round(v * 0.6), 15, 120);
    else if (exo.type === "reps") reps = clamp(Math.round(v * 0.5), 5, 30);
  }
  const st = exoState && exoState[exo.id];
  let weight = null;
  if (st) {
    if (st.reps != null) reps = st.reps;
    if (st.work != null) work = st.work;
    if (st.weight != null) weight = st.weight;
  }
  return { reps, work, weight };
}

function blockSeconds(exo, reps, work) {
  let w;
  if (exo.type === "isometric" || exo.type === "interval") w = work || exo.defaultWork || 30;
  else w = (reps || exo.defaultReps || 10) * 3;
  return w + (exo.rest || 30);
}

function equipmentOk(exo, available) {
  if (!exo.equipment || exo.equipment.length === 0) return true;
  return exo.equipment.every(req => available.includes(req));
}

function matchesTargets(exo, targets) {
  return exo.muscles.some(m => targets.includes(m)) || targets.includes(exo.primaryMuscle);
}

function scoreFor(exo, targets, bm) {
  let s = exo.efficacy || 5;
  if (targets.includes(exo.primaryMuscle)) s += 3;
  if (bm) {
    const pu = bm.pullups || 0;
    if (exo.id === "pull-up" && pu < 5) s -= 5;            // pas assez fort, on evite la traction stricte
    if (exo.id === "band-assisted-pullup" && pu < 8) s += 3; // on privilegie l'assistee
    if (exo.id === "hanging-knee-raise" && pu < 2) s -= 3;   // grip insuffisant
  }
  return s;
}

export function doseText(exo, sets, reps, work, weight) {
  if (exo.type === "isometric" || exo.type === "interval") return `${sets} x ${work}s`;
  const w = weight != null ? ` @ ${weight}kg` : "";
  return `${sets} x ${reps} reps${w}`;
}

function makeBlock(exo, sets, bm, exoState) {
  const d = effectiveDose(exo, bm, exoState);
  return {
    exo, sets, reps: d.reps, work: d.work, weight: d.weight, weighted: isWeighted(exo),
    doseText: doseText(exo, sets, d.reps, d.work, d.weight)
  };
}

/*
 buildSession({ targets, minutes, equipment, profile })
 Retour : { warmup:[block], main:[block], totalMin, targets }
*/
export function buildSession({ targets, minutes, equipment, profile, exoState }) {
  const ex = allExercises();
  const bm = (profile && profile.benchmarks) || {};
  const xs = exoState || {};
  const maxLevel = profile ? effectiveMaxLevel(profile) : 2;
  const budget = Math.max(5, minutes) * 60;

  // 1) Echauffement : 1 exo mobilite/leger pertinent
  const warmCandidates = ex.filter(e =>
    e.level <= maxLevel && equipmentOk(e, equipment) &&
    (e.category === "mobilite" || e.primaryMuscle === "cardio" ||
     ["glute-bridge", "bird-dog", "dead-bug", "band-pull-apart"].includes(e.id))
  );
  warmCandidates.sort((a, b) => (matchesTargets(b, targets) - matchesTargets(a, targets)));
  const warmup = warmCandidates.length ? [makeBlock(warmCandidates[0], 1, bm, xs)] : [];

  let used = warmup.reduce((t, w) => t + blockSeconds(w.exo, w.reps, w.work) * w.sets, 0);

  // 2) Corps de seance
  let pool = ex
    .filter(e => e.level <= maxLevel && equipmentOk(e, equipment) && matchesTargets(e, targets))
    .filter(e => !warmup.some(w => w.exo.id === e.id))
    .sort((a, b) => scoreFor(b, targets, bm) - scoreFor(a, targets, bm));

  if (pool.length === 0) {
    pool = ex.filter(e => e.level <= maxLevel && (!e.equipment || e.equipment.length === 0) && matchesTargets(e, targets))
             .sort((a, b) => scoreFor(b, targets, bm) - scoreFor(a, targets, bm));
  }

  const sets = minutes <= 12 ? 2 : 3;
  const main = [];
  const usedMuscles = {};

  for (const exo of pool) {
    if (main.length >= 6) break;
    const d = effectiveDose(exo, bm, xs);
    const cost = blockSeconds(exo, d.reps, d.work) * sets;
    if (used + cost > budget && main.length >= 2) continue;
    if ((usedMuscles[exo.primaryMuscle] || 0) >= 2) continue;
    main.push(makeBlock(exo, sets, bm, xs));
    usedMuscles[exo.primaryMuscle] = (usedMuscles[exo.primaryMuscle] || 0) + 1;
    used += cost;
    if (used >= budget) break;
  }

  if (main.length === 0) {
    ex.filter(e => e.level <= maxLevel && (!e.equipment || e.equipment.length === 0))
      .sort((a, b) => (b.efficacy || 0) - (a.efficacy || 0))
      .slice(0, 3)
      .forEach(exo => main.push(makeBlock(exo, sets, bm, xs)));
  }

  const totalSec = warmup.concat(main).reduce((t, b) => t + blockSeconds(b.exo, b.reps, b.work) * b.sets, 0);
  return { warmup, main, targets, totalMin: Math.round(totalSec / 60) };
}

// Reconstruit une seance a partir d'exercices deja realises (refaire la meme seance),
// en appliquant la difficulte courante (exoState). entries = [{ id, sets }]
export function rebuildSession(entries, profile, exoState) {
  const bm = (profile && profile.benchmarks) || {};
  const xs = exoState || {};
  const main = [];
  for (const en of entries) {
    const exo = allExercises().find(e => e.id === en.id);
    if (exo) main.push(makeBlock(exo, en.sets || 3, bm, xs));
  }
  const totalSec = main.reduce((t, b) => t + blockSeconds(b.exo, b.reps, b.work) * b.sets, 0);
  const targets = [...new Set(main.map(b => b.exo.primaryMuscle))];
  return { warmup: [], main, targets, totalMin: Math.round(totalSec / 60) };
}

// Sequence de phases pour le chrono
export function toPhaseSequence(session) {
  const phases = [];
  const blocks = session.warmup.concat(session.main);
  blocks.forEach((b, bi) => {
    for (let s = 1; s <= b.sets; s++) {
      const work = (b.exo.type === "isometric" || b.exo.type === "interval")
        ? (b.work || b.exo.defaultWork || 30)
        : (b.reps || b.exo.defaultReps || 10) * 3;
      phases.push({
        kind: "work", name: b.exo.name, exo: b.exo,
        seconds: work, setNum: s, totalSets: b.sets,
        repsBased: b.exo.type === "reps", reps: b.reps, tempo: b.exo.tempo, weight: b.weight
      });
      const lastOfAll = bi === blocks.length - 1 && s === b.sets;
      if (!lastOfAll) phases.push({ kind: "rest", name: "Repos", seconds: b.exo.rest || 30, exo: b.exo });
    }
  });
  return phases;
}
