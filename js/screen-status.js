// K-Arise - ecran STATUT (rang, niveau, stats, energie, mission, dernieres quetes)
import {
  getState, progress, muscleDebt, dailyMission,
  performanceRank, activeTitle, currentStreak,
  getActiveSession, clearActiveSession,
  exportSave, backupReminderDue
} from "./store.js";
import { MUSCLE_LABELS } from "./engine.js";
import { app, esc, toast, panel, go } from "./ui.js";
import { renderSessionPlayer } from "./screen-session.js";
import { renderSessionEdit } from "./screen-suivi.js";

export function renderStatus() {
  const s = getState();
  const p = progress();
  const debt = muscleDebt();
  const mission = dailyMission();
  const pr = performanceRank();
  const title = activeTitle();
  const streak = currentStreak();
  const active = getActiveSession();
  const backupBanner = backupReminderDue() ? panel(`
      <div class="section-label" style="color:var(--orange)"><i class="ti ti-alert-triangle"></i> SAUVEGARDE CONSEILLEE</div>
      <div class="hint mb12">Tes donnees vivent uniquement sur cet appareil. Pas d'export depuis plus de 7 jours : exporte une copie pour ne rien perdre.</div>
      <button class="btn ghost" id="st-backup"><i class="ti ti-download"></i> EXPORTER MA SAUVEGARDE</button>
    `) : "";
  const resumeBanner = active ? panel(`
      <div class="section-label" style="color:var(--green)"><i class="ti ti-player-pause"></i> QUETE EN PAUSE</div>
      <div class="hint mb12">Tu as une quete en cours, mise en pause. Reprends-la quand tu veux.</div>
      <button class="btn green-btn" id="st-resume"><i class="ti ti-player-play"></i> REPRENDRE LA QUETE</button>
      <button class="btn ghost mt8" id="st-resume-abandon"><i class="ti ti-x"></i> Abandonner</button>
    `) : "";
  const statIcons = { force: "ti-barbell", core: "ti-shield", mobilite: "ti-stretching", endurance: "ti-run", discipline: "ti-flame" };
  const statLabels = { force: "Force", core: "Core", mobilite: "Mobilite", endurance: "Endurance", discipline: "Discipline" };
  const debtMuscles = debt.map(d => d.muscle);

  const statsHtml = Object.keys(statLabels).map(k => {
    const isLagging = (k === "mobilite" && debtMuscles.some(m => m.startsWith("mobilite"))) ||
                      (k === "force" && debtMuscles.some(m => ["dos", "lombaires", "jambes", "pectoraux", "epaules", "bras", "fessiers"].includes(m))) ||
                      (k === "core" && debtMuscles.some(m => ["abdos", "obliques", "core"].includes(m)));
    const cls = isLagging ? "orange" : "white";
    return `<div class="stat"><span class="dim"><i class="ti ${statIcons[k]} ic"></i>${statLabels[k]}</span><span class="${cls}">${s.stats[k]}${isLagging ? " &#9888;" : ""}</span></div>`;
  }).join("");

  const energyPct = Math.round(s.energy);
  const intoPct = Math.round((p.intoLevel / p.forNext) * 100);

  const debtHtml = debt.length
    ? `<div class="mt12 section-label"><i class="ti ti-alert-triangle"></i> RETARDS DETECTES (7 derniers jours)</div>
       <div class="hint">${debt.map(d => `${esc(MUSCLE_LABELS[d.muscle] || d.muscle)} : ${d.sets} series`).join(" &middot; ")}</div>
       <div class="hint faint">Le Systeme priorisera ces zones dans tes prochaines quetes.</div>`
    : `<div class="hint mt12 faint">Aucun retard cette semaine. Continue comme ca.</div>`;

  const lastSessions = s.history.slice(0, 3).map((h, idx) => {
    const d = new Date(h.date);
    const detail = h.type === "run" && h.run ? `${h.run.distanceKm} km` : `${h.exercises.length} exos`;
    return `<div class="row clickable" data-detail="${idx}" style="font-size:12px;margin-top:6px;padding:4px 0"><span class="dim">${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} &middot; ${esc(h.type)}</span><span class="faint">${detail} &middot; ${h.durationMin}min <i class="ti ti-chevron-right"></i></span></div>`;
  }).join("") || `<div class="hint faint">Aucune seance enregistree. Lance ta premiere quete.</div>`;

  app().innerHTML = backupBanner + resumeBanner +
    panel(`
      <div class="center mb16"><div class="title-box">STATUS</div></div>
      <div class="row gap12 mb16">
        <div class="badge-rank">${pr.rank}</div>
        <div style="flex:1">
          <div class="white" style="font-size:14px">${esc(s.profile.name || "Hunter")}${title ? ` <span class="faint" style="font-size:10px">&laquo; ${esc(title.label)} &raquo;</span>` : ""}</div>
          <div class="faint" style="font-size:10px">RANG ${pr.rank} (capacite) &middot; Niveau ${p.level}${streak > 0 ? ` &middot; <span class="orange"><i class="ti ti-flame"></i> ${streak}j</span>` : ""}</div>
          <div class="bar mt8"><span style="width:${intoPct}%"></span></div>
          <div class="faint" style="font-size:9px;margin-top:2px">XP ${p.intoLevel} / ${p.forNext}</div>
        </div>
      </div>

      <div class="bar-label"><span>ENERGIE / RECUPERATION</span><span>${energyPct} / 100</span></div>
      <div class="bar green mb16"><span style="width:${energyPct}%"></span></div>

      <div class="section-label">STATISTIQUES</div>
      <div class="stats-grid">${statsHtml}</div>

      ${debtHtml}
    `) +
    panel(`
      <div class="section-label"><i class="ti ti-target"></i> MISSION DU JOUR</div>
      <div class="white mb8" style="font-size:14px">${mission.targets.map(t => esc(MUSCLE_LABELS[t] || t)).join(" + ")} &middot; ${mission.minutes} min</div>
      <div class="hint mb12">${esc(mission.reason)}</div>
      <button class="btn green-btn" id="st-mission"><i class="ti ti-bolt"></i> LANCER LA MISSION</button>
      <a class="btn ghost mt8" href="#express"><i class="ti ti-adjustments"></i> Personnaliser une quete</a>
    `) +
    panel(`
      <div class="section-label"><i class="ti ti-history"></i> DERNIERES QUETES</div>
      ${lastSessions}
    `);

  document.getElementById("st-mission").addEventListener("click", () => {
    sessionStorage.setItem("karise_prefill", JSON.stringify(mission.targets));
    go("#express");
  });

  document.getElementById("st-backup")?.addEventListener("click", () => {
    exportSave();
    toast("Sauvegarde exportee.");
    renderStatus();
  });

  if (active) {
    document.getElementById("st-resume").addEventListener("click", () => renderSessionPlayer(active.session, active.index));
    document.getElementById("st-resume-abandon").addEventListener("click", () => {
      if (confirm("Abandonner la quete en pause ?")) { clearActiveSession(); toast("Quete abandonnee."); renderStatus(); }
    });
  }
  document.querySelectorAll("[data-detail]").forEach(row =>
    row.addEventListener("click", () => renderSessionEdit(parseInt(row.dataset.detail))));
}
