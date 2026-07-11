// K-Arise - module nutrition (100% local, base sur le consensus ISSN)
// Calcule les besoins de recuperation et selectionne des recettes selon ce que l'utilisateur a chez lui.

let RECIPES = null;

// Inventaire cuisine : cle -> label, regroupe par categorie pour la checklist
export const INGREDIENTS = [
  { key: "oeufs", label: "Oeufs", cat: "Proteines" },
  { key: "poulet", label: "Poulet", cat: "Proteines" },
  { key: "boeuf-hache", label: "Boeuf hache", cat: "Proteines" },
  { key: "thon", label: "Thon", cat: "Proteines" },
  { key: "saumon", label: "Saumon", cat: "Proteines" },
  { key: "whey", label: "Whey (proteine)", cat: "Proteines" },
  { key: "lentilles", label: "Lentilles", cat: "Proteines" },
  { key: "pois-chiches", label: "Pois chiches", cat: "Proteines" },
  { key: "haricots-rouges", label: "Haricots rouges", cat: "Proteines" },
  { key: "fromage-blanc", label: "Fromage blanc", cat: "Laitiers" },
  { key: "yaourt-grec", label: "Yaourt grec", cat: "Laitiers" },
  { key: "lait", label: "Lait", cat: "Laitiers" },
  { key: "fromage", label: "Fromage", cat: "Laitiers" },
  { key: "riz", label: "Riz", cat: "Feculents" },
  { key: "pates", label: "Pates", cat: "Feculents" },
  { key: "quinoa", label: "Quinoa", cat: "Feculents" },
  { key: "patate-douce", label: "Patate douce", cat: "Feculents" },
  { key: "flocons-avoine", label: "Flocons d'avoine", cat: "Feculents" },
  { key: "pain-complet", label: "Pain complet", cat: "Feculents" },
  { key: "brocoli", label: "Brocoli", cat: "Legumes/Fruits" },
  { key: "epinards", label: "Epinards", cat: "Legumes/Fruits" },
  { key: "tomate", label: "Tomate", cat: "Legumes/Fruits" },
  { key: "avocat", label: "Avocat", cat: "Legumes/Fruits" },
  { key: "banane", label: "Banane", cat: "Legumes/Fruits" },
  { key: "huile-olive", label: "Huile d'olive", cat: "Extras" },
  { key: "beurre-cacahuete", label: "Beurre de cacahuete", cat: "Extras" },
  { key: "miel", label: "Miel", cat: "Extras" },
  { key: "noix", label: "Noix", cat: "Extras" }
];

const ING_LABEL = Object.fromEntries(INGREDIENTS.map(i => [i.key, i.label]));
export const ingredientLabel = k => ING_LABEL[k] || k;

// Substitutions plausibles (meme role nutritionnel) pour proposer une alternative
const SUBS = {
  riz: ["pates", "quinoa", "patate-douce"],
  pates: ["riz", "quinoa", "patate-douce"],
  quinoa: ["riz", "pates", "lentilles"],
  "patate-douce": ["riz", "pates", "pain-complet"],
  poulet: ["boeuf-hache", "thon", "oeufs", "saumon"],
  "boeuf-hache": ["poulet", "thon", "oeufs"],
  thon: ["saumon", "poulet", "oeufs"],
  saumon: ["thon", "poulet", "oeufs"],
  oeufs: ["poulet", "thon", "fromage-blanc"],
  "fromage-blanc": ["yaourt-grec", "fromage"],
  "yaourt-grec": ["fromage-blanc"],
  lait: ["yaourt-grec", "fromage-blanc"],
  whey: ["fromage-blanc", "yaourt-grec", "oeufs"],
  brocoli: ["epinards", "tomate"],
  epinards: ["brocoli", "tomate"],
  "haricots-rouges": ["pois-chiches", "lentilles"],
  "pois-chiches": ["haricots-rouges", "lentilles"],
  noix: ["beurre-cacahuete"],
  "beurre-cacahuete": ["noix"]
};

export async function loadRecipes() {
  if (RECIPES) return RECIPES;
  const res = await fetch("data/recipes.json");
  if (!res.ok) throw new Error("Impossible de charger les recettes.");
  RECIPES = await res.json();
  return RECIPES;
}

export function allRecipes() { return RECIPES ? RECIPES.recipes : []; }

// Liens robustes (recherche, jamais de lien mort)
export function recipeVideoUrl(r) {
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(r.name + " recette");
}
export function recipePhotoUrl(r) {
  return "https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(r.name + " plat recette");
}
// Visuel local du plat. Convention : assets/recipes/<id>.jpg, surchargeable par r.image.
// Local-first ; si le fichier manque, onerror masque l'element cote rendu.
export function recipeImageUrl(r) {
  return r.image || `assets/recipes/${r.id}.jpg`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Parametres par objectif nutritionnel
const GOAL_PARAMS = {
  "prise-muscle": { kcalDelta: 300, proteinPerKg: 1.8, label: "Prise de muscle" },
  "recomposition": { kcalDelta: 0, proteinPerKg: 2.0, label: "Recomposition" },
  "seche": { kcalDelta: -300, proteinPerKg: 2.0, label: "Seche" },
  "maintien": { kcalDelta: 0, proteinPerKg: 1.6, label: "Maintien" }
};

export const GOAL_LABELS = Object.fromEntries(Object.entries(GOAL_PARAMS).map(([k, v]) => [k, v.label]));

/*
 computeNeeds(profile, lastSession)
 Retour : { daily:{kcal,protein,carbs,fat,water}, post:{protein,carbs,kcal}, goalLabel, basis }
 - daily : objectifs sur la journee
 - post  : dose a viser dans le repas qui suit la seance
*/
export function computeNeeds(profile, lastSession) {
  const kg = profile.weightKg || 75;
  const cm = profile.heightCm || 175;
  const age = profile.age || 30;
  const goal = profile.nutritionGoal || "prise-muscle";
  const gp = GOAL_PARAMS[goal] || GOAL_PARAMS["prise-muscle"];

  // BMR Mifflin-St Jeor
  const bmr = profile.sex === "f"
    ? 10 * kg + 6.25 * cm - 5 * age - 161
    : 10 * kg + 6.25 * cm - 5 * age + 5;

  const tdee = bmr * 1.5; // activite moderee (entrainement regulier)
  const kcal = Math.round((tdee + gp.kcalDelta) / 10) * 10;

  const protein = Math.round(kg * gp.proteinPerKg);
  const fat = Math.round(kg * 0.8);
  const carbsKcal = Math.max(0, kcal - protein * 4 - fat * 9);
  const carbs = Math.round(carbsKcal / 4);

  // Hydratation : 35 ml/kg + bonus seance
  const sessionMin = lastSession ? (lastSession.durationMin || 0) : 0;
  const water = Math.round((kg * 35 + sessionMin * 12) / 50) * 50; // ml, arrondi a 50

  // Dose post-effort : 0.3 g/kg de proteines, glucides selon duree de seance
  const postProtein = Math.round(kg * 0.3);
  const postCarbs = Math.round(kg * (0.5 + (sessionMin / 60) * 0.3));
  const postKcal = postProtein * 4 + postCarbs * 4;

  return {
    daily: { kcal, protein, carbs, fat, water },
    post: { protein: postProtein, carbs: postCarbs, kcal: postKcal },
    goal, goalLabel: gp.label,
    basis: "BMR Mifflin-St Jeor x1.5 (activite moderee). Proteines " + gp.proteinPerKg + " g/kg (consensus ISSN 1.4-2.0)."
  };
}

// Condiments de fond : presque tout le monde les a, ils ne doivent pas bloquer la realisabilite.
const STAPLES = new Set(["huile-olive", "miel"]);

// Makeability d'une recette selon l'inventaire dispo.
// On ne compte que les ingredients "coeur" (hors staples) pour decider si c'est realisable.
function evaluate(recipe, pantry) {
  const core = recipe.ingredients.filter(i => !STAPLES.has(i));
  if (!pantry || pantry.length === 0)
    return { missing: [], have: 0, total: core.length, ratio: 0, makeable: false, suggested: true };
  const missing = core.filter(i => !pantry.includes(i));
  const ratio = core.length ? (core.length - missing.length) / core.length : 1;
  return { missing, have: core.length - missing.length, total: core.length, ratio, makeable: missing.length === 0, suggested: false };
}

// Pour chaque ingredient manquant, propose une substitution presente dans l'inventaire
export function suggestSubs(missing, pantry) {
  const out = [];
  for (const m of missing) {
    const alt = (SUBS[m] || []).find(s => pantry.includes(s));
    if (alt) out.push({ missing: m, replaceWith: alt });
  }
  return out;
}

/*
 selectRecipes({ needs, pantry, excludeIds })
 Retour : liste triee de { recipe, missing, makeable, ratio, subs }
 - priorise les recettes realisables et dont les proteines collent a la dose post-effort
*/
export function selectRecipes({ needs, pantry, excludeIds = [] }) {
  const target = needs ? needs.post.protein : 25;
  const list = allRecipes()
    .filter(r => !excludeIds.includes(r.id))
    .map(r => {
      const ev = evaluate(r, pantry);
      const proteinScore = 1 - Math.min(1, Math.abs(r.protein - target * 1.6) / 40); // repas ~1.6x la dose mini
      // Realisables d'abord, puis le plus complet, puis l'adequation proteique.
      const score = (ev.makeable ? 5 : 0) + ev.ratio * 3 + proteinScore;
      return { recipe: r, missing: ev.missing, makeable: ev.makeable, ratio: ev.ratio,
               total: ev.total, suggested: ev.suggested, score,
               subs: ev.missing.length ? suggestSubs(ev.missing, pantry || []) : [] };
    })
    .sort((a, b) => b.score - a.score);
  return list;
}
