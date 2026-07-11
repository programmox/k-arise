// K-Arise - MATERIEL (inventaire + capture photo locale)
import { getState, saveState } from "./store.js";
import { EQUIPMENT_LABELS } from "./engine.js";
import { app, esc, toast, panel } from "./ui.js";

export function renderEquipment() {
  const s = getState();
  const equipChips = Object.entries(EQUIPMENT_LABELS).map(([k, v]) =>
    `<span class="chip ${s.equipment.includes(k) ? "on" : ""}" data-equip="${k}"><i class="ti ${v.icon} ic"></i>${esc(v.label)}</span>`).join("");

  app().innerHTML =
    panel(`
      <div class="center mb16"><div class="title-box">INVENTAIRE</div></div>
      <div class="hint mb12">Ton arsenal. Le Systeme ne propose que des exos faisables avec ce que tu coches.</div>
      <div class="chips" id="eq-chips">${equipChips}</div>
      <button class="btn green-btn mt16" id="eq-save"><i class="ti ti-check"></i> ENREGISTRER L'INVENTAIRE</button>
    `) +
    panel(`
      <div class="section-label"><i class="ti ti-camera"></i> SCAN PHOTO DU MATERIEL</div>
      <div class="hint mb12">Prends ton materiel en photo. L'analyse automatique (reconnaissance par IA) s'active a la prochaine etape du projet. Pour l'instant, coche manuellement ci-dessus.</div>
      <input type="file" accept="image/*" capture="environment" id="eq-photo" style="display:none" />
      <button class="btn ghost" id="eq-photo-btn"><i class="ti ti-camera"></i> PRENDRE UNE PHOTO</button>
      <div id="eq-photo-preview" class="mt12"></div>
    `);

  app().querySelectorAll("#eq-chips .chip").forEach(chip =>
    chip.addEventListener("click", () => chip.classList.toggle("on")));

  app().querySelector("#eq-save").addEventListener("click", () => {
    s.equipment = [...app().querySelectorAll("#eq-chips .chip.on")].map(c => c.dataset.equip);
    saveState();
    toast("Inventaire mis a jour.");
  });

  const fileInput = app().querySelector("#eq-photo");
  app().querySelector("#eq-photo-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    app().querySelector("#eq-photo-preview").innerHTML =
      `<img src="${url}" style="width:100%;border-radius:4px;border:1px solid var(--line)" />
       <div class="hint faint mt8">Photo chargee localement (non envoyee). Reconnaissance IA a venir.</div>`;
  });
}
