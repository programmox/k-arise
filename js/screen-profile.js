// K-Arise - PROFIL / REGLAGES (profil, sons/vibrations, export/import/reset)
import {
  getState, saveState, getSettings, setSetting,
  exportSave, importSave, resetAll
} from "./store.js";
import { MUSCLE_LABELS, BENCHMARKS } from "./engine.js";
import { setTimerConfig } from "./timer.js";
import { app, esc, panel, go, toast } from "./ui.js";
import { isConfigured, isConnected, connect, disconnect } from "./strava.js";

// Panneau connexion Strava (app API personnelle de l'utilisateur)
function stravaPanel(s) {
  const st = s.strava;
  const connected = isConnected();
  const status = connected
    ? `<div class="green mb8" style="font-size:12px"><i class="ti ti-circle-check"></i> Connecte${st.athleteName ? " : " + esc(st.athleteName) : ""}${st.lastSyncAt ? ` &middot; dernier sync ${new Date(st.lastSyncAt).toLocaleDateString("fr-FR")}` : ""}</div>`
    : isConfigured()
      ? `<div class="hint mb8">Cles enregistrees. Connecte-toi pour synchroniser tes courses.</div>`
      : `<div class="hint mb8">Cree ton app sur <span class="white">strava.com/settings/api</span> (gratuit, 5 min).
         "Authorization Callback Domain" = <span class="white">${esc(location.hostname)}</span>. Puis colle tes cles ici.</div>`;
  const err = st.lastSyncError ? `<div class="hint orange mb8">${esc(st.lastSyncError)}</div>` : "";
  return panel(`
    <div class="section-label"><i class="ti ti-brand-strava"></i> STRAVA (COURSE A PIED)</div>
    ${status}${err}
    <label class="field">Client ID</label>
    <input type="text" id="sv-id" value="${esc(st.clientId)}" placeholder="123456" />
    <label class="field">Client Secret</label>
    <input type="text" id="sv-secret" value="${esc(st.clientSecret)}" placeholder="abc123..." />
    <div class="hint faint mt8">Stocke uniquement sur cet appareil (et dans tes exports de sauvegarde). Jamais envoye ailleurs qu'a Strava.</div>
    <div class="btn-row mt12">
      <button class="btn ghost" id="sv-save"><i class="ti ti-device-floppy"></i> Enregistrer</button>
      ${connected
        ? '<button class="btn danger" id="sv-disc"><i class="ti ti-plug-off"></i> Deconnecter</button>'
        : '<button class="btn green-btn" id="sv-conn"><i class="ti ti-plug"></i> Connecter</button>'}
    </div>
    <div class="row mt12" style="padding:4px 0"><span class="dim" style="font-size:13px"><i class="ti ti-refresh"></i> Sync auto (6h)</span>
      <button class="chip ${st.autoSync ? "on" : ""}" id="sv-auto">${st.autoSync ? "ACTIVE" : "COUPE"}</button></div>
  `);
}

function benchSummary(s) {
  const bm = s.profile.benchmarks || {};
  const rows = BENCHMARKS.filter(b => bm[b.key] != null && bm[b.key] !== "").map(b =>
    `<div class="row" style="font-size:12px;margin-top:5px"><span class="dim">${esc(b.label.split(" (")[0])}</span><span class="white">${esc(bm[b.key])} ${esc(b.unit)}</span></div>`).join("");
  if (!rows) return "";
  return `<div class="divider"></div><div class="section-label">BENCHMARKS</div>${rows}`;
}

export function renderProfile() {
  const s = getState();
  app().innerHTML =
    panel(`
      <div class="center mb16"><div class="title-box">PROFIL</div></div>
      <div class="row" style="font-size:13px;margin-bottom:6px"><span class="dim">Hunter</span><span class="white">${esc(s.profile.name || "-")}</span></div>
      <div class="row" style="font-size:13px;margin-bottom:6px"><span class="dim">Profession</span><span class="white">${esc(s.profile.job || "-")}</span></div>
      <div class="row" style="font-size:13px;margin-bottom:6px"><span class="dim">Age / Poids / Taille</span><span class="white">${s.profile.age || "-"} / ${s.profile.weightKg || "-"}kg / ${s.profile.heightCm || "-"}cm</span></div>
      <div class="row" style="font-size:13px;margin-bottom:6px"><span class="dim">Experience</span><span class="white">${esc(s.profile.experience)}</span></div>
      <div class="divider"></div>
      <div class="section-label">OBJECTIFS</div>
      <div class="chips">${s.goals.map(g => `<span class="chip on">${esc(MUSCLE_LABELS[g] || g)}</span>`).join("") || '<span class="faint">-</span>'}</div>
      ${benchSummary(s)}
      <button class="btn ghost mt16" id="pf-edit"><i class="ti ti-edit"></i> MODIFIER LE PROFIL</button>
      <button class="btn ghost mt8" id="pf-equip"><i class="ti ti-barbell"></i> MATERIEL / INVENTAIRE</button>
    `) +
    stravaPanel(s) +
    panel(`
      <div class="section-label"><i class="ti ti-settings"></i> REGLAGES</div>
      <div class="row" style="padding:8px 0"><span class="dim" style="font-size:13px"><i class="ti ti-volume"></i> Sons du chrono</span>
        <button class="chip ${getSettings().sound ? "on" : ""}" data-set="sound">${getSettings().sound ? "ACTIVE" : "COUPE"}</button></div>
      <div class="row" style="padding:8px 0"><span class="dim" style="font-size:13px"><i class="ti ti-device-mobile-vibration"></i> Vibrations</span>
        <button class="chip ${getSettings().vibration ? "on" : ""}" data-set="vibration">${getSettings().vibration ? "ACTIVE" : "COUPE"}</button></div>
      <div class="row" style="padding:8px 0"><span class="dim" style="font-size:13px"><i class="ti ti-download"></i> Sauvegarde auto (hebdo)</span>
        <button class="chip ${getSettings().autoBackup ? "on" : ""}" data-set="autoBackup">${getSettings().autoBackup ? "ACTIVE" : "COUPE"}</button></div>
    `) +
    panel(`
      <div class="section-label"><i class="ti ti-database"></i> DONNEES (portabilite)</div>
      <div class="hint mb12">Exporte ta sauvegarde pour la transferer sur un autre appareil (Mac vers Pixel). Tout est local, rien sur un serveur.</div>
      <div class="btn-row">
        <button class="btn ghost" id="pf-export"><i class="ti ti-download"></i> Exporter</button>
        <button class="btn ghost" id="pf-import"><i class="ti ti-upload"></i> Importer</button>
      </div>
      <input type="file" accept="application/json" id="pf-import-file" style="display:none" />
      <button class="btn danger mt12" id="pf-reset"><i class="ti ti-trash"></i> Tout effacer</button>
    `);

  document.querySelectorAll("[data-set]").forEach(btn =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.set;
      const val = !getSettings()[key];
      setSetting(key, val);
      setTimerConfig(getSettings());
      btn.classList.toggle("on", val);
      btn.textContent = val ? "ACTIVE" : "COUPE";
    }));

  document.getElementById("pf-edit").addEventListener("click", () => go("#onboarding"));
  document.getElementById("pf-equip").addEventListener("click", () => go("#equipment"));

  // Strava
  document.getElementById("sv-save")?.addEventListener("click", () => {
    s.strava.clientId = document.getElementById("sv-id").value.trim();
    s.strava.clientSecret = document.getElementById("sv-secret").value.trim();
    saveState();
    toast("Cles Strava enregistrees.");
    renderProfile();
  });
  document.getElementById("sv-conn")?.addEventListener("click", () => {
    s.strava.clientId = document.getElementById("sv-id").value.trim();
    s.strava.clientSecret = document.getElementById("sv-secret").value.trim();
    saveState();
    if (!isConfigured()) { toast("Renseigne Client ID et Secret d'abord."); return; }
    connect(); // quitte la page vers Strava
  });
  document.getElementById("sv-disc")?.addEventListener("click", () => {
    if (confirm("Deconnecter Strava ? Les courses deja importees restent.")) {
      disconnect(); toast("Strava deconnecte."); renderProfile();
    }
  });
  document.getElementById("sv-auto")?.addEventListener("click", () => {
    s.strava.autoSync = !s.strava.autoSync;
    saveState();
    renderProfile();
  });
  document.getElementById("pf-export").addEventListener("click", () => { exportSave(); toast("Sauvegarde exportee."); });
  const imp = document.getElementById("pf-import-file");
  document.getElementById("pf-import").addEventListener("click", () => imp.click());
  imp.addEventListener("change", async () => {
    if (!imp.files[0]) return;
    try { await importSave(imp.files[0]); toast("Sauvegarde importee."); go("#status"); }
    catch (e) { toast("Fichier invalide."); }
  });
  document.getElementById("pf-reset").addEventListener("click", () => {
    if (confirm("Effacer toutes tes donnees K-Arise ? Action irreversible.")) {
      resetAll(); toast("Donnees effacees."); go("#onboarding");
    }
  });
}
