// K-Arise - SEANCE LIBRE (logger une seance faite soi-meme)
import { recordSession } from "./store.js";
import { loadExercises, allExercises, isWeighted } from "./engine.js";
import { app, esc, panel, go, toast } from "./ui.js";
import { renderFinish } from "./screen-session.js";

let libreList = [];

export function renderLibre() {
  libreList = [];
  app().innerHTML = panel(`
    <div class="center mb16"><div class="title-box" style="letter-spacing:3px">SEANCE LIBRE</div></div>
    <div id="libre-body"><div class="hint faint">Chargement des exercices...</div></div>
  `);
  loadExercises().then(buildLibreUI).catch(() =>
    document.getElementById("libre-body").innerHTML = '<div class="hint orange">Erreur de chargement.</div>');
}

function buildLibreUI() {
  const ex = allExercises().slice().sort((a, b) => a.name.localeCompare(b.name));
  const opts = ex.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("");
  document.getElementById("libre-body").innerHTML = `
    <div class="hint mb12">Loggue une seance faite hors generateur (salle, cours, perso). Tes perfs comptent pour ta progression, tes stats et ton rang.</div>
    <label class="field">Ajouter un exercice</label>
    <div class="row gap8"><select id="libre-sel" style="flex:1">${opts}</select><button class="btn ghost" id="libre-add" style="width:auto;padding:10px 14px;margin:0"><i class="ti ti-plus"></i></button></div>
    <div id="libre-items" class="mt16"></div>
    <label class="field mt16">Duree totale (min)</label><input type="number" id="libre-min" value="20" min="1" />
    <button class="btn green-btn mt16" id="libre-save"><i class="ti ti-check"></i> LOGGER LA SEANCE</button>
    <button class="btn ghost mt8" id="libre-cancel"><i class="ti ti-arrow-left"></i> Annuler</button>
  `;
  document.getElementById("libre-add").addEventListener("click", () => {
    const id = document.getElementById("libre-sel").value;
    const exo = allExercises().find(e => e.id === id);
    if (exo) { libreList.push(exo); renderLibreItems(); }
  });
  document.getElementById("libre-cancel").addEventListener("click", () => go("#express"));
  document.getElementById("libre-save").addEventListener("click", saveLibre);
  renderLibreItems();
}

function renderLibreItems() {
  const host = document.getElementById("libre-items");
  if (!libreList.length) { host.innerHTML = '<div class="hint faint">Aucun exercice ajoute.</div>'; return; }
  host.innerHTML = libreList.map((e, i) => {
    let perf;
    if (e.type === "reps") {
      const w = isWeighted(e) ? `<div style="flex:1"><label class="field">Charge (kg)</label><input type="number" min="0" step="0.5" id="lb-w-${i}" placeholder="kg" /></div>` : "";
      perf = `<div class="row gap12 mt8"><div style="flex:1"><label class="field">Reps / serie</label><input type="number" min="0" id="lb-reps-${i}" value="${e.defaultReps || 10}" /></div>${w}</div>`;
    } else {
      perf = `<div class="mt8"><label class="field">Temps tenu (s) / serie</label><input type="number" min="0" id="lb-work-${i}" value="${e.defaultWork || 30}" /></div>`;
    }
    return `<div class="exo">
      <div class="exo-head"><span class="exo-name">${esc(e.name)}</span><button class="toggle-cues" data-rm="${i}"><i class="ti ti-x"></i></button></div>
      <div class="mt8"><label class="field">Series</label><input type="number" min="1" id="lb-sets-${i}" value="3" /></div>
      ${perf}
      <label class="field">Ressenti</label>
      <div class="chips rpe" data-i="${i}">
        <span class="chip" data-rpe="facile"><i class="ti ti-mood-smile"></i> Facile</span>
        <span class="chip on" data-rpe="correct"><i class="ti ti-flame"></i> Correct</span>
        <span class="chip" data-rpe="dur"><i class="ti ti-mood-sad"></i> Dur</span>
      </div>
    </div>`;
  }).join("");

  host.querySelectorAll("[data-rm]").forEach(btn =>
    btn.addEventListener("click", () => { libreList.splice(parseInt(btn.dataset.rm), 1); renderLibreItems(); }));
  host.querySelectorAll(".rpe").forEach(group =>
    group.querySelectorAll(".chip").forEach(chip =>
      chip.addEventListener("click", () => {
        group.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
        chip.classList.add("on");
      })));
}

function saveLibre() {
  if (!libreList.length) { toast("Ajoute au moins un exercice."); return; }
  const num = (id, def) => { const el = document.getElementById(id); if (!el) return def; const v = parseFloat(el.value); return isNaN(v) ? def : v; };
  const exercises = libreList.map((e, i) => {
    const sets = Math.max(1, Math.round(num(`lb-sets-${i}`, 3)));
    const rpe = document.querySelector(`.rpe[data-i="${i}"] .chip.on`)?.dataset.rpe || "correct";
    const entry = { id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, sets, type: e.type, weighted: isWeighted(e), rpe };
    if (e.type === "reps") {
      entry.actualReps = Math.round(num(`lb-reps-${i}`, e.defaultReps || 10));
      entry.plannedReps = entry.actualReps;
      if (isWeighted(e)) { const w = num(`lb-w-${i}`, NaN); entry.weight = isNaN(w) ? null : w; }
    } else {
      entry.actualWork = Math.round(num(`lb-work-${i}`, e.defaultWork || 30));
      entry.plannedWork = entry.actualWork;
    }
    return entry;
  });
  const durationMin = Math.max(1, Math.round(num("libre-min", 20)));
  const result = recordSession({ type: "libre", durationMin, exercises });
  renderFinish(result);
}
