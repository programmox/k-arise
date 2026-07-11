// K-Arise - onglet COURSE ("Quetes d'exploration") : saisie de runs, plan d'entrainement, historique.
import { getState, saveState, recordRun, getRuns, deleteSession } from "./store.js";
import { RUN_GOALS, KIND_LABELS, formatPace, paceToKmh, scheduleDays, STRETCHES, estimateFitness, generatePlan, currentWeek, nextWorkout } from "./running.js";
import { app, esc, toast, panel, go, showSystemEvents } from "./ui.js";
import { isConfigured, isConnected, sync as stravaSync } from "./strava.js";
import { renderRunLive } from "./screen-run-live.js";

let showFullPlan = false;

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function agoLabel(iso) {
  if (!iso) return null;
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return "il y a moins d'1h";
  if (h < 48) return `il y a ${h}h`;
  return `il y a ${Math.round(h / 24)}j`;
}

// ---------- Panneau etat sync ----------
function syncPanel(s) {
  const online = navigator.onLine;
  const last = agoLabel(s.strava.lastSyncAt);
  let statusTxt;
  if (!isConfigured()) statusTxt = `<span class="faint">Strava non configure &middot; <span class="clickable" id="run-cfg" style="color:var(--cyan)">configurer dans Profil</span></span>`;
  else if (!isConnected()) statusTxt = `<span class="orange">Strava configure, non connecte &middot; va dans Profil</span>`;
  else if (!online) statusTxt = `<span class="faint"><i class="ti ti-wifi-off"></i> Hors-ligne &middot; donnees locales${last ? " &middot; dernier sync " + last : ""}</span>`;
  else statusTxt = `<span class="faint"><i class="ti ti-refresh"></i> ${last ? "Dernier sync " + last : "Jamais synchronise"}</span>`;
  const syncBtn = (isConnected() && online) ? `<button class="btn ghost" id="run-sync" style="width:auto;padding:8px 12px;margin:0;font-size:11px">SYNC</button>` : "";
  const err = s.strava.lastSyncError ? `<div class="hint orange mt8">${esc(s.strava.lastSyncError)}</div>` : "";
  return panel(`<div class="row"><div style="font-size:11px">${statusTxt}</div>${syncBtn}</div>${err}`);
}

// ---------- Panneau saisie manuelle ----------
function logPanel() {
  const kinds = ["endurance", "tempo", "intervalles", "longue", "course"];
  const chips = kinds.map((k, i) => `<span class="chip ${i === 0 ? "on" : ""}" data-kind="${k}">${esc(KIND_LABELS[k])}</span>`).join("");
  return panel(`
    <div class="section-label"><i class="ti ti-run"></i> LOGGER UNE EXPLORATION</div>
    <div class="row gap12">
      <div style="flex:1"><label class="field">Distance (km)</label><input type="number" id="run-km" min="0.5" step="0.1" placeholder="8.5" /></div>
      <div style="flex:1"><label class="field">Duree (min)</label><input type="number" id="run-min" min="1" placeholder="45" /></div>
    </div>
    <div class="row gap12">
      <div style="flex:1"><label class="field">FC moyenne (opt)</label><input type="number" id="run-hr" min="60" max="220" placeholder="155" /></div>
      <div style="flex:1"><label class="field">D+ (m, opt)</label><input type="number" id="run-elev" min="0" placeholder="120" /></div>
    </div>
    <label class="field">Type de seance</label>
    <div class="chips" id="run-kind">${chips}</div>
    <button class="btn green-btn mt16" id="run-save"><i class="ti ti-check"></i> VALIDER L'EXPLORATION</button>
    <button class="btn ghost mt8" id="run-free-live"><i class="ti ti-player-play"></i> COURSE LIBRE EN DIRECT (GPS)</button>
  `);
}

// ---------- Panneau recuperation (etirements post-course, toujours visible) ----------
function recoveryPanel() {
  const rows = STRETCHES.map(st => `
    <div style="padding:6px 0;border-bottom:1px solid var(--line)">
      <div class="row"><span class="dim" style="font-size:12px">${esc(st.name)}</span><span class="faint" style="font-size:11px">${st.sec}s</span></div>
      <figure class="exo-figure"><img loading="lazy" alt="${esc(st.name)}" src="${st.img}" onerror="this.closest('.exo-figure').remove()" /></figure>
      <div class="hint faint">${esc(st.cue)}</div>
    </div>`).join("");
  return panel(`
    <div class="section-label"><i class="ti ti-stretching"></i> ETIREMENTS POST-COURSE (5 MIN)</div>
    <div class="hint mb8">Apres CHAQUE course, muscles chauds. Meme logique que la muscu : la recup fait partie de l'entrainement.</div>
    ${rows}
    <div class="hint faint mt8"><i class="ti ti-tools-kitchen-2"></i> Cote assiette : ouvre l'onglet Repas apres ta course, les besoins post-effort y sont calcules automatiquement.</div>
  `);
}

// ---------- Panneau plan ----------
function dayRow(d, idx, nbDays) {
  const doneMark = d.done ? '<i class="ti ti-circle-check green"></i>' : '<i class="ti ti-circle faint"></i>';
  const weekday = scheduleDays(nbDays)[idx] || "";
  return `<div class="row" style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--line)">
    <span class="${d.done ? "faint" : "dim"}">${doneMark} <span class="white">${esc(weekday)}</span> &middot; ${esc(KIND_LABELS[d.kind] || d.kind)}</span>
    <span class="${d.done ? "faint" : "white"}" style="font-size:11px">${d.km} km &middot; ${formatPace(d.paceTarget)} (${paceToKmh(d.paceTarget)})</span>
  </div>`;
}

function planPanel(s) {
  const plan = s.running.plan;
  if (!plan) return goalPanel(s);

  const cw = currentWeek(plan);
  const next = nextWorkout(plan, s.history); // marque aussi les jours faits
  const week = plan.weeks[cw - 1];
  const doneKm = week.days.filter(d => d.done).reduce((a, d) => a + d.km, 0);
  const pct = Math.min(100, Math.round((doneKm / week.volumeKm) * 100));
  const g = RUN_GOALS[plan.goal];

  const nextIdx = next ? week.days.indexOf(next) : -1;
  const nextDayName = next ? (scheduleDays(week.days.length)[nextIdx] || "") : "";
  const nextHtml = next
    ? `<div class="white mb8" style="font-size:14px">${esc(nextDayName)} : ${esc(KIND_LABELS[next.kind])} &middot; ${next.km} km &middot; ${formatPace(next.paceTarget)} (${paceToKmh(next.paceTarget)})</div>
       <div class="hint mb8">${esc(next.desc)}</div>
       <button class="btn green-btn mb12" id="run-start-live"><i class="ti ti-player-play"></i> DEMARRER (GPS + CHRONO + COACH VOCAL)</button>`
    : `<div class="green mb8" style="font-size:13px"><i class="ti ti-circle-check"></i> Semaine complete. Repos merite, Hunter.</div>
       <div class="hint mb12"><i class="ti ti-stretching"></i> Jour de repos : etirements (voir plus bas) + vise tes objectifs proteines/glucides dans l'onglet Repas pour recuperer plus vite.</div>`;

  const weeksHtml = showFullPlan
    ? plan.weeks.map(w => `
        <div class="section-label mt12">SEMAINE ${w.num}${w.deload ? " &middot; DECHARGE" : ""}${w.taper ? " &middot; AFFUTAGE" : ""} &middot; ${w.volumeKm} KM</div>
        ${w.days.map((d, i) => dayRow(d, i, w.days.length)).join("")}`).join("")
    : week.days.map((d, i) => dayRow(d, i, week.days.length)).join("");

  return panel(`
    <div class="section-label"><i class="ti ti-map"></i> PLAN ${esc(g.label)} &middot; SEMAINE ${cw}/${plan.weeks.length}${week.deload ? " (DECHARGE)" : ""}${week.taper ? " (AFFUTAGE)" : ""}</div>
    <div class="section-label faint">PROCHAINE SEANCE</div>
    ${nextHtml}
    <div class="bar-label"><span>VOLUME SEMAINE</span><span>${Math.round(doneKm * 10) / 10} / ${week.volumeKm} km</span></div>
    <div class="bar green mb12"><span style="width:${pct}%"></span></div>
    ${weeksHtml}
    <div class="btn-row mt16">
      <button class="btn ghost" id="run-toggle-plan">${showFullPlan ? "SEMAINE COURANTE" : "TOUT LE PLAN"}</button>
      <button class="btn ghost" id="run-regen"><i class="ti ti-refresh"></i> REGENERER</button>
    </div>
    <div class="hint faint mt8">Allures : endurance ${formatPace(plan.zones.endurance)} &middot; tempo ${formatPace(plan.zones.tempo)} &middot; intervalles ${formatPace(plan.zones.intervalle)} &middot; course ${formatPace(plan.zones.course)}</div>
  `);
}

// ---------- Panneau choix d'objectif (pas de plan) ----------
function goalPanel(s) {
  const chips = Object.entries(RUN_GOALS).map(([k, v]) =>
    `<span class="chip" data-goal="${k}">${esc(v.label)}</span>`).join("");
  const runs = getRuns();
  const needQuestionnaire = runs.filter(h => Date.now() - new Date(h.date).getTime() < 8 * 7 * 86400000).length < 3;
  const questionnaire = needQuestionnaire ? `
    <div class="section-label mt16">TON NIVEAU (pas assez de courses recentes pour l'estimer)</div>
    <label class="field">Tu cours...</label>
    <select id="rq-level">
      <option value="debutant">Rarement ou jamais (debutant)</option>
      <option value="intermediaire">1-2 fois par semaine</option>
      <option value="avance">3+ fois par semaine</option>
    </select>
    <div class="row gap12">
      <div style="flex:1"><label class="field">Km/semaine habituels</label><input type="number" id="rq-weekly" min="0" placeholder="15" /></div>
      <div style="flex:1"><label class="field">Plus longue sortie (km)</label><input type="number" id="rq-longest" min="0" placeholder="8" /></div>
    </div>` : `<div class="hint mt12">Niveau estime depuis tes ${runs.length} courses enregistrees.</div>`;

  return panel(`
    <div class="section-label"><i class="ti ti-target"></i> CHOISIS TON OBJECTIF</div>
    <div class="hint mb8">Le Systeme genere un plan progressif (+10%/sem max, decharges, affutage) adapte a ton niveau reel.</div>
    <div class="chips" id="run-goals">${chips}</div>
    <label class="field mt12">Date de course (optionnel)</label>
    <input type="date" id="run-race-date" />
    ${questionnaire}
    <button class="btn green-btn mt16" id="run-gen"><i class="ti ti-map"></i> GENERER LE PLAN</button>
  `);
}

// ---------- Panneau historique ----------
function historyPanel(s) {
  const runs = s.history.map((h, idx) => ({ h, idx })).filter(x => x.h.type === "run" && x.h.run).slice(0, 10);
  const rows = runs.length ? runs.map(({ h, idx }) => `
    <div class="row" style="font-size:12px;padding:7px 0;border-bottom:1px solid var(--line)">
      <span class="dim">${h.source === "strava" ? '<i class="ti ti-brand-strava orange"></i> ' : ""}${fmtDate(h.date)}</span>
      <span style="display:flex;align-items:center;gap:10px">
        <span class="white" style="font-size:11px">${h.run.distanceKm} km &middot; ${formatPace(h.run.paceMinKm)}</span>
        <button class="toggle-cues" data-rundel="${idx}" aria-label="Supprimer"><i class="ti ti-x"></i></button>
      </span>
    </div>`).join("")
    : '<div class="hint faint">Aucune exploration enregistree. Loggue ta premiere course ci-dessus.</div>';
  return panel(`<div class="section-label"><i class="ti ti-history"></i> DERNIERES EXPLORATIONS</div>${rows}`);
}

// ---------- Rendu principal ----------
export function renderCourse() {
  const s = getState();
  app().innerHTML =
    syncPanel(s) +
    (s.running.plan ? planPanel(s) : goalPanel(s)) +
    logPanel() +
    recoveryPanel() +
    historyPanel(s);
  if (s.running.plan) saveState(); // nextWorkout a pu marquer des jours "done"

  // course en direct (GPS) : seance du plan ou course libre
  document.getElementById("run-start-live")?.addEventListener("click", () => {
    const plan = s.running.plan;
    const cw = currentWeek(plan);
    const next = nextWorkout(plan, s.history);
    const idx = next ? plan.weeks[cw - 1].days.indexOf(next) : null;
    renderRunLive(next, cw, idx);
  });
  document.getElementById("run-free-live")?.addEventListener("click", () => renderRunLive(null));

  // sync manuel
  document.getElementById("run-sync")?.addEventListener("click", async () => {
    toast("Synchronisation Strava...");
    try { const r = await stravaSync({}); toast(`${r.added} course${r.added > 1 ? "s" : ""} importee${r.added > 1 ? "s" : ""}.`); }
    catch (e) { toast("Echec du sync : " + e.message, 4000); }
    renderCourse();
  });
  document.getElementById("run-cfg")?.addEventListener("click", () => go("#profile"));

  // saisie manuelle
  document.querySelectorAll("#run-kind .chip").forEach(chip =>
    chip.addEventListener("click", () => {
      document.querySelectorAll("#run-kind .chip").forEach(c => c.classList.remove("on"));
      chip.classList.add("on");
    }));
  document.getElementById("run-save")?.addEventListener("click", () => {
    const km = parseFloat(document.getElementById("run-km").value);
    const min = parseFloat(document.getElementById("run-min").value);
    if (!km || !min) { toast("Distance et duree obligatoires."); return; }
    const hr = parseFloat(document.getElementById("run-hr").value) || null;
    const elev = parseFloat(document.getElementById("run-elev").value) || null;
    const kind = document.querySelector("#run-kind .chip.on")?.dataset.kind || null;
    const result = recordRun({ distanceKm: km, durationMin: min, avgHr: hr, elevation: elev, kind });
    toast(`+${result.gained} XP${result.isPacePr ? " · PR d'allure !" : ""}`);
    showSystemEvents(result.events, () => renderCourse());
    if (!result.events.length) renderCourse();
  });

  // plan : generation
  document.querySelectorAll("#run-goals .chip").forEach(chip =>
    chip.addEventListener("click", () => {
      document.querySelectorAll("#run-goals .chip").forEach(c => c.classList.remove("on"));
      chip.classList.add("on");
    }));
  document.getElementById("run-gen")?.addEventListener("click", () => {
    const goal = document.querySelector("#run-goals .chip.on")?.dataset.goal;
    if (!goal) { toast("Choisis un objectif."); return; }
    const raceDate = document.getElementById("run-race-date").value || null;
    let questionnaire = null;
    const lvlEl = document.getElementById("rq-level");
    if (lvlEl) {
      questionnaire = {
        level: lvlEl.value,
        weeklyKm: parseFloat(document.getElementById("rq-weekly").value) || null,
        longestKm: parseFloat(document.getElementById("rq-longest").value) || null
      };
    }
    const fitness = estimateFitness(getRuns(), questionnaire);
    const plan = generatePlan({ goal, raceDate, fitness });
    Object.assign(s.running, { goal, raceDate, questionnaire, plan, planGeneratedAt: plan.generatedAt });
    saveState();
    toast(`Plan ${RUN_GOALS[goal].label} genere : ${plan.weeks.length} semaines.`);
    renderCourse();
  });

  // plan : bascule vue / regeneration
  document.getElementById("run-toggle-plan")?.addEventListener("click", () => { showFullPlan = !showFullPlan; renderCourse(); });
  document.getElementById("run-regen")?.addEventListener("click", () => {
    if (!confirm("Regenerer le plan ? La progression des semaines repart de maintenant.")) return;
    s.running.plan = null;
    saveState();
    renderCourse();
  });

  // historique : suppression
  document.querySelectorAll("[data-rundel]").forEach(btn =>
    btn.addEventListener("click", () => {
      if (!confirm("Supprimer cette course ? Stats et progression recalculees.")) return;
      deleteSession(parseInt(btn.dataset.rundel));
      toast("Course supprimee.");
      renderCourse();
    }));
}
