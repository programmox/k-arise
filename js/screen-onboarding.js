// K-Arise - ONBOARDING (wizard en 4 etapes)
import { getState, saveState, recomputeDerived } from "./store.js";
import { GOAL_CHOICES, EQUIPMENT_LABELS, MUSCLE_LABELS, BENCHMARKS } from "./engine.js";
import { app, esc, toast, panel, go } from "./ui.js";

const OB_STEPS = 4;
let obStep = 0;
let obDraft = null;

export function renderOnboarding() {
  const s = getState();
  obDraft = {
    name: s.profile.name, job: s.profile.job, age: s.profile.age, sex: s.profile.sex,
    weightKg: s.profile.weightKg, heightCm: s.profile.heightCm, experience: s.profile.experience,
    goals: s.goals.slice(), equipment: s.equipment.slice(),
    benchmarks: Object.assign({}, s.profile.benchmarks)
  };
  obStep = 0;
  renderObStep();
}

function obProgress() {
  return `<div style="display:flex;gap:6px;margin:0 0 16px">${Array.from({ length: OB_STEPS }, (_, i) =>
    `<div style="flex:1;height:4px;border-radius:2px;background:${i <= obStep ? "var(--cyan)" : "var(--track)"};${i <= obStep ? "box-shadow:0 0 6px var(--cyan)" : ""}"></div>`).join("")}</div>`;
}

function obStep0() {
  return `<label class="field">Nom de Hunter</label><input type="text" id="ob-name" value="${esc(obDraft.name || "")}" placeholder="Karim" />
    <label class="field">Profession (impact posture / sedentarite)</label><input type="text" id="ob-job" value="${esc(obDraft.job || "")}" placeholder="Motion Designer" />`;
}
function obStep1() {
  return `<div class="row gap12">
      <div style="flex:1"><label class="field">Age</label><input type="number" id="ob-age" value="${obDraft.age ?? ""}" placeholder="30" /></div>
      <div style="flex:1"><label class="field">Sexe</label><select id="ob-sex"><option value="">--</option><option value="h" ${obDraft.sex === "h" ? "selected" : ""}>Homme</option><option value="f" ${obDraft.sex === "f" ? "selected" : ""}>Femme</option></select></div>
    </div>
    <div class="row gap12">
      <div style="flex:1"><label class="field">Poids (kg)</label><input type="number" id="ob-weight" value="${obDraft.weightKg ?? ""}" placeholder="75" /></div>
      <div style="flex:1"><label class="field">Taille (cm)</label><input type="number" id="ob-height" value="${obDraft.heightCm ?? ""}" placeholder="178" /></div>
    </div>
    <label class="field">Niveau d'experience</label>
    <select id="ob-exp">
      <option value="debutant" ${obDraft.experience === "debutant" ? "selected" : ""}>Debutant</option>
      <option value="intermediaire" ${obDraft.experience === "intermediaire" ? "selected" : ""}>Intermediaire</option>
      <option value="avance" ${obDraft.experience === "avance" ? "selected" : ""}>Avance</option>
    </select>`;
}
function obStep2() {
  const goalChips = GOAL_CHOICES.map(g => `<span class="chip" data-goal="${g}"><i class="ti ti-flame ic"></i>${esc(MUSCLE_LABELS[g] || g)}</span>`).join("");
  const equipChips = Object.entries(EQUIPMENT_LABELS).map(([k, v]) => `<span class="chip" data-equip="${k}"><i class="ti ${v.icon} ic"></i>${esc(v.label)}</span>`).join("");
  return `<div class="hint mb8">Ce que tu veux travailler.</div><div class="chips" id="ob-goals">${goalChips}</div>
    <div class="section-label mt16">MATERIEL DISPONIBLE</div><div class="hint mb8">Coche ce que tu as. Le reste se fera au poids du corps.</div><div class="chips" id="ob-equip">${equipChips}</div>`;
}
function obStep3() {
  return `<div class="hint mb12">Tes perfs habituelles, pour calibrer la difficulte. Laisse vide si tu ne sais pas (0 tractions si aucune).</div>
    ${BENCHMARKS.map(b => `<label class="field">${esc(b.label)}</label><input type="number" min="0" id="bm-${b.key}" value="${obDraft.benchmarks[b.key] ?? ""}" placeholder="${esc(b.placeholder)}" />`).join("")}`;
}

function renderObStep() {
  const titles = ["IDENTITE", "PROFIL PHYSIQUE", "OBJECTIFS & MATERIEL", "BENCHMARKS"];
  const bodies = [obStep0, obStep1, obStep2, obStep3];
  const isLast = obStep === OB_STEPS - 1;

  app().innerHTML = panel(`
    <div class="center mb12"><div class="system-tag">SYSTEM</div><div class="title-box">INITIALISATION</div></div>
    ${obProgress()}
    <div class="section-label">ETAPE ${obStep + 1}/${OB_STEPS} &middot; ${titles[obStep]}</div>
    ${bodies[obStep]()}
    <div class="btn-row mt24">
      ${obStep > 0 ? '<button class="btn ghost" id="ob-prev"><i class="ti ti-chevron-left"></i> Precedent</button>' : ""}
      <button class="btn green-btn" id="ob-next">${isLast ? '<i class="ti ti-check"></i> VALIDER' : 'Suivant <i class="ti ti-chevron-right"></i>'}</button>
    </div>
    <div class="hint center faint mt8">K-Arise n'est pas un avis medical. En cas de douleur, arrete et consulte un pro.</div>
  `);

  if (obStep === 2) {
    obDraft.goals.forEach(g => app().querySelector(`[data-goal="${g}"]`)?.classList.add("on"));
    obDraft.equipment.forEach(e => app().querySelector(`[data-equip="${e}"]`)?.classList.add("on"));
    app().querySelectorAll("[data-goal],[data-equip]").forEach(chip =>
      chip.addEventListener("click", () => chip.classList.toggle("on")));
  }
  if (obStep > 0) document.getElementById("ob-prev").addEventListener("click", () => { obCollect(); obStep--; renderObStep(); window.scrollTo(0, 0); });
  document.getElementById("ob-next").addEventListener("click", obNext);
}

function obCollect() {
  const v = id => document.getElementById(id);
  if (obStep === 0) { obDraft.name = v("ob-name").value.trim(); obDraft.job = v("ob-job").value.trim(); }
  else if (obStep === 1) {
    obDraft.age = parseInt(v("ob-age").value) || null;
    obDraft.sex = v("ob-sex").value;
    obDraft.weightKg = parseFloat(v("ob-weight").value) || null;
    obDraft.heightCm = parseFloat(v("ob-height").value) || null;
    obDraft.experience = v("ob-exp").value;
  } else if (obStep === 2) {
    obDraft.goals = [...document.querySelectorAll("#ob-goals .chip.on")].map(c => c.dataset.goal);
    obDraft.equipment = [...document.querySelectorAll("#ob-equip .chip.on")].map(c => c.dataset.equip);
  } else if (obStep === 3) {
    const bm = {};
    BENCHMARKS.forEach(b => { const val = v(`bm-${b.key}`).value; if (val !== "") bm[b.key] = parseInt(val) || 0; });
    obDraft.benchmarks = bm;
  }
}

function obNext() {
  obCollect();
  if (obStep === 0 && !obDraft.name) { toast("Indique au moins un nom de Hunter."); return; }
  if (obStep === 2 && obDraft.goals.length === 0) { toast("Choisis au moins un objectif."); return; }
  if (obStep < OB_STEPS - 1) { obStep++; renderObStep(); window.scrollTo(0, 0); return; }

  const s = getState();
  Object.assign(s.profile, {
    name: obDraft.name, job: obDraft.job, age: obDraft.age, sex: obDraft.sex,
    weightKg: obDraft.weightKg, heightCm: obDraft.heightCm, experience: obDraft.experience,
    benchmarks: obDraft.benchmarks
  });
  s.goals = obDraft.goals;
  s.equipment = obDraft.equipment;
  s.onboarded = true;
  saveState();
  recomputeDerived();
  obDraft = null;
  toast("Scan complet. Bienvenue, " + s.profile.name + ".");
  go("#status");
}
