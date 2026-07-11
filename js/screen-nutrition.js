// K-Arise - NUTRITION (recuperation : besoins post-effort, objectifs jour, recette filtrable)
import { getState, saveState } from "./store.js";
import {
  loadRecipes, selectRecipes, computeNeeds, recipeVideoUrl, recipePhotoUrl, recipeImageUrl,
  INGREDIENTS, ingredientLabel, GOAL_LABELS
} from "./nutrition.js";
import { app, esc, panel, toast } from "./ui.js";

function metricCard(label, value, unit) {
  return `<div style="background:rgba(10,28,48,0.5);border:1px solid var(--line);border-radius:6px;padding:10px 12px;text-align:center">
    <div class="white" style="font-size:20px">${value}<span class="faint" style="font-size:11px"> ${esc(unit)}</span></div>
    <div class="faint" style="font-size:10px;letter-spacing:1px;margin-top:2px">${esc(label)}</div></div>`;
}

export function renderNutrition() {
  const s = getState();
  const last = s.history[0] || null;
  const needs = computeNeeds(s.profile, last);
  const excluded = [];

  const goalOptions = Object.entries(GOAL_LABELS).map(([k, v]) =>
    `<option value="${k}" ${s.profile.nutritionGoal === k ? "selected" : ""}>${esc(v)}</option>`).join("");

  const lastTxt = last
    ? `Derniere quete : ${new Date(last.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} (${last.type === "run" && last.run ? last.run.distanceKm + " km" : last.exercises.length + " exos"}, ${last.durationMin} min)`
    : "Aucune quete enregistree pour l'instant : objectifs calcules sur ton profil.";

  // inventaire cuisine groupe par categorie
  const cats = {};
  INGREDIENTS.forEach(i => { (cats[i.cat] = cats[i.cat] || []).push(i); });
  const pantryHtml = Object.entries(cats).map(([cat, items]) =>
    `<div class="faint" style="font-size:10px;letter-spacing:1px;margin:10px 0 6px">${esc(cat.toUpperCase())}</div>
     <div class="chips">${items.map(i => `<span class="chip ${s.pantry.includes(i.key) ? "on" : ""}" data-ing="${i.key}">${esc(i.label)}</span>`).join("")}</div>`
  ).join("");

  app().innerHTML =
    panel(`
      <div class="center mb16"><div class="title-box" style="letter-spacing:3px">RECUP &amp; REPAS</div></div>
      <div class="hint mb12">${esc(lastTxt)}</div>

      <div class="section-label"><i class="ti ti-flame"></i> A VISER DANS LE REPAS POST-EFFORT</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:8px 0 14px">
        ${metricCard("Proteines", needs.post.protein, "g")}
        ${metricCard("Glucides", needs.post.carbs, "g")}
        ${metricCard("Energie", needs.post.kcal, "kcal")}
      </div>

      <div class="section-label"><i class="ti ti-target"></i> OBJECTIFS SUR LA JOURNEE</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 6px">
        ${metricCard("Energie", needs.daily.kcal, "kcal")}
        ${metricCard("Proteines", needs.daily.protein, "g")}
        ${metricCard("Glucides", needs.daily.carbs, "g")}
        ${metricCard("Lipides", needs.daily.fat, "g")}
      </div>
      <div class="row gap12 mt8" style="align-items:flex-end">
        <div style="flex:1">${metricCard("Hydratation", (needs.daily.water / 1000).toFixed(1), "L")}</div>
        <div style="flex:1">
          <label class="field">Objectif nutrition</label>
          <select id="nu-goal">${goalOptions}</select>
        </div>
      </div>
      <div class="hint faint mt12"><i class="ti ti-book"></i> ${esc(needs.basis)} Le total journalier prime sur le timing exact.</div>
    `) +
    `<div id="nutri-recipe">${panel('<div class="hint faint">Chargement des recettes...</div>')}</div>` +
    `<div id="recipe-list"></div>` +
    panel(`
      <div class="section-label"><i class="ti ti-fridge"></i> CE QUE J'AI CHEZ MOI</div>
      <div class="hint mb8">Coche tes ingredients. Le Systeme ne propose alors que des recettes realisables, et te suggere des remplacements pour celles qui manquent.</div>
      <div id="nu-pantry">${pantryHtml}</div>
    `);

  // objectif nutrition -> recalcul
  document.getElementById("nu-goal").addEventListener("change", e => {
    s.profile.nutritionGoal = e.target.value;
    saveState();
    renderNutrition();
  });

  // inventaire -> sauvegarde + rafraichit la recette
  document.querySelectorAll("#nu-pantry .chip").forEach(chip =>
    chip.addEventListener("click", () => {
      chip.classList.toggle("on");
      s.pantry = [...document.querySelectorAll("#nu-pantry .chip.on")].map(c => c.dataset.ing);
      saveState();
      excluded.length = 0;
      selected = null;
      refreshRecipe();
    }));

  let selected = null;

  function recipeRow(item) {
    const r = item.recipe;
    const right = item.makeable
      ? '<span class="green"><i class="ti ti-circle-check"></i> realisable</span>'
      : `<span class="faint">manque : ${esc(item.missing.map(ingredientLabel).join(", "))}</span>`;
    const sub = item.subs.length
      ? ` <span class="orange">&middot; remplace par ${esc(item.subs.map(su => ingredientLabel(su.replaceWith)).join(", "))} ?</span>` : "";
    return `<div class="recipe-row clickable" data-rid="${r.id}">
      <span class="white">${esc(r.name)}</span>
      <span class="recipe-row-meta">${right}${sub} &middot; ${r.protein}g prot</span>
    </div>`;
  }

  function renderRecipeList(makeable, almost, list, hasPantry) {
    if (!hasPantry) {
      const rows = list.slice(0, 6).map(recipeRow).join("");
      return panel(`<div class="section-label"><i class="ti ti-list-search"></i> SUGGESTIONS</div>
        <div class="hint mb8">Coche tes ingredients ci-dessous : le Systeme filtre alors ce que tu peux vraiment faire.</div>${rows}`);
    }
    const mk = makeable.length
      ? `<div class="section-label"><i class="ti ti-circle-check"></i> REALISABLES MAINTENANT (${makeable.length})</div>${makeable.map(recipeRow).join("")}`
      : `<div class="section-label"><i class="ti ti-info-circle"></i> RIEN DE 100% REALISABLE</div><div class="hint mb8">Au plus proche, il te manque peu :</div>`;
    const al = almost.length
      ? `<div class="section-label mt16"><i class="ti ti-shopping-cart"></i> PRESQUE (il manque 1-2)</div>${almost.slice(0, 5).map(recipeRow).join("")}`
      : "";
    return panel(mk + al);
  }

  function refreshRecipe() {
    const list = selectRecipes({ needs, pantry: s.pantry, excludeIds: excluded });
    if (!list.length) {
      document.getElementById("nutri-recipe").innerHTML = panel('<div class="hint faint">Plus de recette a proposer. Reinitialise ou ajoute des ingredients.</div>');
      document.getElementById("recipe-list").innerHTML = "";
      return;
    }
    const hasPantry = s.pantry.length > 0;
    const makeable = list.filter(x => x.makeable);
    const almost = list.filter(x => !x.makeable && !x.suggested && x.missing.length <= 2);
    const main = (selected && list.find(x => x.recipe.id === selected)) || makeable[0] || list[0];

    document.getElementById("nutri-recipe").innerHTML = recipeCard(main);
    document.getElementById("recipe-list").innerHTML = renderRecipeList(makeable, almost, list, hasPantry);

    document.getElementById("nu-eat")?.addEventListener("click", () => toast("Bon appetit. Recuperation optimale enclenchee."));
    document.getElementById("nu-next")?.addEventListener("click", () => { excluded.push(main.recipe.id); selected = null; refreshRecipe(); });
    document.querySelectorAll("#recipe-list [data-rid]").forEach(row =>
      row.addEventListener("click", () => {
        selected = row.dataset.rid;
        refreshRecipe();
        document.getElementById("nutri-recipe").scrollIntoView({ behavior: "smooth" });
      }));
  }

  function recipeCard(item) {
    const r = item.recipe;
    const ings = r.ingredients.map(i => {
      const miss = item.missing.includes(i);
      return `<span class="chip ${miss ? "" : "on"}" style="cursor:default">${miss ? '<i class="ti ti-x"></i> ' : ""}${esc(ingredientLabel(i))}</span>`;
    }).join("");
    const missWarn = item.makeable ? "" :
      `<div class="hint orange mt8"><i class="ti ti-alert-triangle"></i> Il te manque : ${item.missing.map(m => esc(ingredientLabel(m))).join(", ")}.</div>`;
    const subs = item.subs.length
      ? `<div class="hint mt8"><i class="ti ti-arrows-exchange"></i> Avec ce que tu as : ${item.subs.map(su => `${esc(ingredientLabel(su.missing))} &rarr; <span class="green">${esc(ingredientLabel(su.replaceWith))}</span>`).join(", ")}</div>`
      : "";
    const steps = r.steps.map(st => `<li>${esc(st)}</li>`).join("");
    return panel(`
      <div class="section-label"><i class="ti ti-tools-kitchen-2"></i> RECETTE PROPOSEE${item.makeable && s.pantry.length ? ' &middot; <span class="green">realisable</span>' : ""}</div>
      <div class="white" style="font-size:16px;margin-bottom:4px">${esc(r.name)}</div>
      <figure class="exo-figure"><img loading="lazy" alt="Plat : ${esc(r.name)}" src="${recipeImageUrl(r)}" onerror="this.closest('.exo-figure').remove()" /></figure>
      <div class="faint" style="font-size:11px;margin-bottom:8px"><i class="ti ti-clock"></i> ${r.prepMin} min &middot; ${r.tags.map(esc).join(" &middot; ")}</div>
      <div class="exo-links" style="margin-bottom:10px">
        <a class="vid" href="${recipeVideoUrl(r)}" target="_blank" rel="noopener"><i class="ti ti-brand-youtube"></i> Recette en video</a>
        <a class="vid" href="${recipePhotoUrl(r)}" target="_blank" rel="noopener"><i class="ti ti-photo"></i> Photos du plat</a>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px">
        ${metricCard("kcal", r.kcal, "")}
        ${metricCard("Prot.", r.protein, "g")}
        ${metricCard("Gluc.", r.carbs, "g")}
        ${metricCard("Lip.", r.fat, "g")}
      </div>
      <div class="faint" style="font-size:10px;letter-spacing:1px;margin-bottom:6px">INGREDIENTS</div>
      <div class="chips">${ings}</div>
      ${missWarn}${subs}
      <div class="faint" style="font-size:10px;letter-spacing:1px;margin:12px 0 6px">PREPARATION</div>
      <ul class="hint" style="margin-left:16px">${steps}</ul>
      <div class="hint mt8" style="color:var(--cyan-soft)"><i class="ti ti-bulb"></i> ${esc(r.tip)}</div>
      <div class="btn-row mt16">
        <button class="btn green-btn" id="nu-eat"><i class="ti ti-check"></i> JE LA FAIS</button>
        <button class="btn ghost" id="nu-next"><i class="ti ti-refresh"></i> Autre / pas dispo</button>
      </div>
    `);
  }

  loadRecipes().then(refreshRecipe).catch(() => {
    document.getElementById("nutri-recipe").innerHTML = panel('<div class="hint orange">Erreur de chargement des recettes.</div>');
  });
}
