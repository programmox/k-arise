// K-Arise - quete express : config, apercu, lecteur chrono, bilan, fin
import { getState, recoveryAdvice, recordSession, setActiveSession, getActiveSession, clearActiveSession, muscleDebt, interferenceForLegs } from "./store.js";
import { loadExercises, buildSession, toPhaseSequence, videoUrl, exoImageUrl, MUSCLE_LABELS, EQUIPMENT_LABELS, GOAL_CHOICES } from "./engine.js";
import { PhaseTimer, fmt } from "./timer.js";
import { app, esc, toast, panel, go, navTo, setHeader, showSystemEvents, stepper } from "./ui.js";

// ====================================================================
// EXPRESS (configuration)
// ====================================================================
export function renderExpress() {
  const s = getState();
  const debt = muscleDebt().map(d => d.muscle);
  let prefill = null;
  try { prefill = JSON.parse(sessionStorage.getItem("karise_prefill") || "null"); } catch (e) {}
  sessionStorage.removeItem("karise_prefill");
  const targetChips = GOAL_CHOICES.map(g => {
    const pre = prefill ? prefill.includes(g) : (s.goals.includes(g) || debt.includes(g));
    const lag = debt.includes(g);
    return `<span class="chip ${pre ? "on" : ""}" data-t="${g}"><i class="ti ti-flame ic"></i>${esc(MUSCLE_LABELS[g] || g)}${lag ? ' <span class="orange">&#9888;</span>' : ""}</span>`;
  }).join("");

  app().innerHTML = panel(`
    <div class="center mb16"><div class="system-tag">QUETE EXPRESS</div><div class="title-box">CONFIG</div></div>

    <div class="section-label">JE TRAVAILLE</div>
    <div class="hint mb8">Les zones en &#9888; sont en retard cette semaine, le Systeme conseille de les prioriser.</div>
    <div class="chips" id="ex-targets">${targetChips}</div>

    <div class="section-label mt24">TEMPS DISPO</div>
    <div class="btn-row" id="ex-time">
      <button class="btn ghost" data-min="10">10 min</button>
      <button class="btn ghost" data-min="15">15 min</button>
      <button class="btn ghost" data-min="20">20 min</button>
      <button class="btn ghost" data-min="30">30 min</button>
    </div>
    <label class="field mt12">Ou precise (minutes)</label>
    <input type="number" id="ex-min" value="15" min="5" max="90" />

    <button class="btn green-btn mt24" id="ex-build"><i class="ti ti-bolt"></i> GENERER LA QUETE</button>
    <a class="btn ghost mt8" href="#libre"><i class="ti ti-pencil-plus"></i> J'AI DEJA FAIT UNE SEANCE (LOGGER)</a>
  `) + `<div id="ex-result"></div>`;

  app().querySelectorAll("#ex-targets .chip").forEach(chip =>
    chip.addEventListener("click", () => chip.classList.toggle("on")));

  app().querySelectorAll("#ex-time button").forEach(b =>
    b.addEventListener("click", () => {
      app().querySelector("#ex-min").value = b.dataset.min;
      app().querySelectorAll("#ex-time button").forEach(x => x.classList.add("ghost"));
    }));

  app().querySelector("#ex-build").addEventListener("click", async () => {
    const targets = [...app().querySelectorAll("#ex-targets .chip.on")].map(c => c.dataset.t);
    const minutes = parseInt(app().querySelector("#ex-min").value) || 15;
    if (targets.length === 0) { toast("Choisis au moins une zone a travailler."); return; }
    const btn = app().querySelector("#ex-build");
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> GENERATION...';
    try {
      await loadExercises();
      const session = buildSession({ targets, minutes, equipment: s.equipment, profile: s.profile, exoState: s.exoState });
      let advice = recoveryAdvice(targets);
      // interference course -> muscu : une course de qualite < 24h charge deja les jambes
      const inter = interferenceForLegs(targets);
      if (inter && (!advice || advice.level === "go")) {
        advice = { level: "caution", msg: inter, recovering: advice ? advice.recovering : [] };
      }
      window.__karise_session = session;
      renderSessionPreview(session, advice);
      document.getElementById("ex-result").scrollIntoView({ behavior: "smooth" });
    } finally {
      btn.disabled = false; btn.innerHTML = label;
    }
  });
}

export function exerciseCard(block) {
  const e = block.exo;
  const cues = (e.cues || []).map(c => `<li>${esc(c)}</li>`).join("");
  return `
    <div class="exo">
      <div class="exo-head">
        <span class="exo-name">${esc(e.name)}</span>
        <span class="exo-dose">${esc(block.doseText)}</span>
      </div>
      <div class="exo-meta">${esc((MUSCLE_LABELS[e.primaryMuscle] || e.primaryMuscle))}${e.tempo ? " &middot; tempo " + esc(e.tempo) : ""}${e.equipment && e.equipment.length ? " &middot; " + e.equipment.map(x => esc(EQUIPMENT_LABELS[x]?.label || x)).join(", ") : " &middot; poids du corps"}</div>
      <figure class="exo-figure"><img loading="lazy" alt="Posture ideale : ${esc(e.name)}" src="${exoImageUrl(e)}" onerror="this.closest('.exo-figure').remove()" /></figure>
      <div class="exo-links">
        <a class="vid" href="${videoUrl(e)}" target="_blank" rel="noopener"><i class="ti ti-brand-youtube"></i> Voir la technique</a>
        <button class="toggle-cues"><i class="ti ti-info-circle"></i> Consignes & securite</button>
      </div>
      <div class="exo-cues">
        <ul>${cues}</ul>
        <div class="exo-safety"><i class="ti ti-shield"></i> ${esc(e.safety || "")}</div>
      </div>
    </div>`;
}

function adviceBanner(advice) {
  if (!advice) return "";
  const color = advice.level === "go" ? "var(--green)" : advice.level === "caution" ? "var(--orange)" : "var(--red)";
  const icon = advice.level === "go" ? "ti-circle-check" : advice.level === "caution" ? "ti-alert-triangle" : "ti-hand-stop";
  const detail = advice.recovering.length
    ? `<div class="hint faint">${advice.recovering.map(r => `${esc(MUSCLE_LABELS[r.muscle] || r.muscle)} : ~${r.hoursLeft}h de recup restantes`).join(" &middot; ")}</div>`
    : "";
  return `<div style="border:1px solid ${color};border-radius:4px;padding:10px 12px;margin-bottom:12px">
    <div style="font-size:12px;color:${color}"><i class="ti ${icon}"></i> ${esc(advice.msg)}</div>${detail}</div>`;
}

function renderSessionPreview(session, advice) {
  const html = panel(`
    <div class="section-label"><i class="ti ti-list-check"></i> QUETE GENEREE &middot; ~${session.totalMin} MIN</div>
    ${adviceBanner(advice)}
    <div class="hint mb12">Cibles : ${session.targets.map(t => esc(MUSCLE_LABELS[t] || t)).join(", ")}. Echauffement inclus.</div>
    ${session.warmup.length ? `<div class="section-label faint">ECHAUFFEMENT</div>${session.warmup.map(exerciseCard).join("")}` : ""}
    <div class="section-label faint mt12">SEANCE</div>
    ${session.main.map(exerciseCard).join("")}
    <button class="btn green-btn mt16" id="start-session"><i class="ti ti-player-play"></i> DEMARRER LA QUETE (CHRONO)</button>
    <button class="btn ghost mt8" id="regen"><i class="ti ti-refresh"></i> Regenerer</button>
  `);
  document.getElementById("ex-result").innerHTML = html;

  document.querySelectorAll("#ex-result .toggle-cues").forEach(btn =>
    btn.addEventListener("click", () => btn.closest(".exo").querySelector(".exo-cues").classList.toggle("show")));

  document.getElementById("start-session").addEventListener("click", () => renderSessionPlayer(session));
  document.getElementById("regen").addEventListener("click", () => document.getElementById("ex-build").click());
}

// ====================================================================
// LECTEUR DE SEANCE (chrono) + pause / reprise persistante
// ====================================================================
let activeTimer = null;

// Appele par le routeur quand on quitte l'ecran : met en pause le chrono en arriere-plan
export function pauseActiveTimer() {
  if (activeTimer && activeTimer.running) activeTimer.pause();
  activeTimer = null;
}

export function renderSessionPlayer(session, startIndex = 0) {
  const phases = toPhaseSequence(session);
  if (!phases.length) { toast("Seance vide."); return; }
  startIndex = Math.max(0, Math.min(startIndex, phases.length - 1));
  const R = 100, C = 2 * Math.PI * R;

  setHeader("QUETE EN COURS", true);
  setActiveSession({ session, index: startIndex, savedAt: Date.now() });

  app().innerHTML = panel(`
    <div class="center"><div class="system-tag" id="sp-phase">PRET</div></div>
    <div class="timer-ring">
      <svg width="220" height="220" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r="${R}" fill="none" stroke="rgba(45,155,209,0.2)" stroke-width="8"/>
        <circle id="sp-ring" cx="110" cy="110" r="${R}" fill="none" stroke="#46d4ff" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="0" style="filter:drop-shadow(0 0 6px #46d4ff)"/>
      </svg>
      <div class="center-txt">
        <div class="timer-clock" id="sp-clock">0:00</div>
      </div>
    </div>
    <div class="center white" style="font-size:18px;margin-top:6px" id="sp-name"></div>
    <figure class="sp-figure"><img id="sp-figure" alt="" onerror="this.closest('.sp-figure').style.display='none'" /></figure>
    <div class="center" style="font-size:12px;margin-top:4px;color:var(--cyan-soft)" id="sp-sub"></div>
    <div class="center faint" style="font-size:12px;margin-top:4px" id="sp-next"></div>

    <div class="sp-coach" id="sp-coach"></div>

    <div class="btn-row mt24">
      <button class="btn" id="sp-toggle"><i class="ti ti-player-play"></i> ${startIndex > 0 ? "REPRENDRE" : "DEMARRER"}</button>
      <button class="btn ghost" id="sp-skip"><i class="ti ti-player-skip-forward"></i> PASSER</button>
    </div>
    <button class="btn ghost mt8" id="sp-pause"><i class="ti ti-player-pause"></i> Mettre en pause &amp; quitter</button>
    <button class="btn danger mt8" id="sp-quit"><i class="ti ti-x"></i> Abandonner</button>
  `);

  const ringEl = document.getElementById("sp-ring");
  const clockEl = document.getElementById("sp-clock");
  const phaseEl = document.getElementById("sp-phase");
  const nameEl = document.getElementById("sp-name");
  const subEl = document.getElementById("sp-sub");
  const nextEl = document.getElementById("sp-next");
  const figFrame = document.querySelector(".sp-figure");
  const figEl = document.getElementById("sp-figure");
  const coachEl = document.getElementById("sp-coach");
  const toggleBtn = document.getElementById("sp-toggle");

  function renderPhase(p, idx) {
    const isRest = p.kind === "rest";
    phaseEl.textContent = isRest ? "REPOS" : `EFFORT ${p.setNum}/${p.totalSets}`;
    // Visuel de posture pendant l'effort uniquement (masque au repos et si l'asset est absent)
    if (figFrame && figEl) {
      if (isRest) { figFrame.style.display = "none"; }
      else { figFrame.style.display = ""; figEl.src = exoImageUrl(p.exo); }
    }
    // Consignes d'execution + securite (donnees locales de exercises.json) pendant l'effort
    if (coachEl) {
      if (isRest) { coachEl.innerHTML = ""; }
      else {
        const cues = (p.exo.cues || []).map(c => `<li>${esc(c)}</li>`).join("");
        const safety = p.exo.safety
          ? `<div class="sp-safety"><i class="ti ti-shield"></i> ${esc(p.exo.safety)}</div>` : "";
        coachEl.innerHTML = (cues ? `<ul class="sp-cues">${cues}</ul>` : "") + safety;
      }
    }
    clockEl.classList.toggle("rest", isRest);
    ringEl.setAttribute("stroke", isRest ? "#9fe66a" : "#46d4ff");
    ringEl.style.filter = isRest ? "drop-shadow(0 0 6px #6fe04a)" : "drop-shadow(0 0 6px #46d4ff)";
    nameEl.textContent = isRest ? "Recupere" : p.name;
    subEl.innerHTML = isRest ? "" : (p.repsBased ? `${p.reps} reps${p.weight != null ? " @ " + p.weight + "kg" : ""}${p.tempo ? " &middot; " + esc(p.tempo) : ""}` : "tiens la position");
    const nxt = phases[idx + 1];
    nextEl.textContent = nxt ? "A suivre : " + (nxt.kind === "rest" ? "repos" : nxt.name) : "Derniere phase";
  }

  function setRing(remaining, total) {
    const frac = total > 0 ? remaining / total : 0;
    ringEl.setAttribute("stroke-dashoffset", String(C * (1 - frac)));
  }

  const timer = new PhaseTimer(phases, {
    onPhaseStart: (p, idx) => {
      if (!document.getElementById("sp-clock")) { timer.pause(); return; } // ecran quitte
      renderPhase(p, idx);
      setActiveSession({ session, index: idx, savedAt: Date.now() });
    },
    onTick: (remaining, p) => {
      if (!document.getElementById("sp-clock")) { timer.pause(); return; }
      clockEl.textContent = fmt(remaining); setRing(remaining, p.seconds);
    },
    onDone: () => {
      const realMin = session.startedAt ? Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)) : session.totalMin;
      clearActiveSession();
      renderBilan(session, realMin);
    }
  });
  activeTimer = timer;

  timer.index = startIndex;
  timer.remaining = phases[startIndex].seconds;
  renderPhase(phases[startIndex], startIndex);
  clockEl.textContent = fmt(phases[startIndex].seconds);

  toggleBtn.addEventListener("click", () => {
    if (timer.paused && !timer.running) {
      if (!session.startedAt) { session.startedAt = Date.now(); } // horodate le 1er demarrage (mesure de duree reelle)
      timer.start();
      setActiveSession({ session, index: timer.index, savedAt: Date.now() }); // persiste startedAt (survit pause/reprise)
      toggleBtn.innerHTML = '<i class="ti ti-player-pause"></i> PAUSE';
    } else {
      timer.pause();
      toggleBtn.innerHTML = '<i class="ti ti-player-play"></i> REPRENDRE';
    }
  });
  document.getElementById("sp-skip").addEventListener("click", () => timer.skip());
  document.getElementById("sp-pause").addEventListener("click", () => {
    timer.pause();
    setActiveSession({ session, index: timer.index, savedAt: Date.now() });
    activeTimer = null;
    toast("Quete mise en pause. Reprends quand tu veux depuis le Statut.");
    go("#status");
  });
  document.getElementById("sp-quit").addEventListener("click", () => {
    if (!confirm("Abandonner la quete ? Elle ne sera pas enregistree.")) return;
    timer.stop();
    activeTimer = null;
    clearActiveSession();
    toast("Quete abandonnee.");
    go("#status");
  });
}

// Bilan : l'utilisateur saisit ses perfs reelles, qui alimentent la surcharge progressive
// realMin = duree reellement mesuree par le chrono (modifiable), sinon repli sur la duree prevue
export function renderBilan(session, realMin) {
  setHeader("BILAN DE QUETE", false);
  const measuredMin = Math.max(1, Math.round(realMin || session.totalMin));
  const rows = session.main.map((b, i) => {
    const e = b.exo;
    let inputs;
    if (e.type === "reps") {
      const w = b.weighted
        ? `<div style="flex:1"><label class="field">Charge (kg)</label>${stepper(`log-w-${i}`, b.weight ?? "", 0.5)}</div>`
        : "";
      inputs = `<div class="row gap12 mt8">
        <div style="flex:1"><label class="field">Reps faites / serie</label>${stepper(`log-reps-${i}`, b.reps, 1)}</div>${w}</div>`;
    } else {
      inputs = `<div class="mt8"><label class="field">Temps tenu (s) / serie</label>${stepper(`log-work-${i}`, b.work, 5)}</div>`;
    }
    return `<div class="exo">
      <div class="exo-head"><span class="exo-name">${esc(e.name)}</span><span class="exo-dose">${esc(b.doseText)} prevu</span></div>
      ${inputs}
      <label class="field">Ressenti</label>
      <div class="chips rpe" data-i="${i}">
        <span class="chip" data-rpe="facile"><i class="ti ti-mood-smile"></i> Facile</span>
        <span class="chip on" data-rpe="correct"><i class="ti ti-flame"></i> Correct</span>
        <span class="chip" data-rpe="dur"><i class="ti ti-mood-sad"></i> Dur</span>
      </div>
    </div>`;
  }).join("");

  app().innerHTML = panel(`
    <div class="center mb16"><div class="system-tag">SYSTEM</div><div class="title-box">BILAN DE QUETE</div></div>
    <div class="hint mb12">Note ce que tu as vraiment fait. Le Systeme calibre la difficulte de ta prochaine seance avec (surcharge progressive).</div>
    <div class="row gap12" style="align-items:flex-end">
      <div style="flex:1"><label class="field"><i class="ti ti-clock"></i> Duree reelle (min)</label>${stepper("bilan-min", measuredMin, 1, 1)}</div>
      <div style="flex:1"><div class="hint faint">Mesuree par le chrono. Prevu : ${session.totalMin} min. Corrige si besoin.</div></div>
    </div>
    ${rows}
    <button class="btn green-btn mt16" id="bilan-save"><i class="ti ti-check"></i> VALIDER LE BILAN</button>
  `);

  app().querySelectorAll(".rpe").forEach(group =>
    group.querySelectorAll(".chip").forEach(chip =>
      chip.addEventListener("click", () => {
        group.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
        chip.classList.add("on");
      })));

  document.getElementById("bilan-save").addEventListener("click", () => {
    const num = (id, def) => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? def : v; };
    const mainEntries = session.main.map((b, i) => {
      const e = b.exo;
      const rpe = app().querySelector(`.rpe[data-i="${i}"] .chip.on`)?.dataset.rpe || "correct";
      const entry = { id: e.id, name: e.name, primaryMuscle: e.primaryMuscle, sets: b.sets,
        type: e.type, weighted: b.weighted, rpe, plannedReps: b.reps, plannedWork: b.work };
      if (e.type === "reps") {
        entry.actualReps = Math.round(num(`log-reps-${i}`, b.reps));
        if (b.weighted) { const w = num(`log-w-${i}`, NaN); entry.weight = isNaN(w) ? null : w; }
      } else {
        entry.actualWork = Math.round(num(`log-work-${i}`, b.work));
      }
      return entry;
    });
    const warmEntries = session.warmup.map(b => ({
      id: b.exo.id, name: b.exo.name, primaryMuscle: b.exo.primaryMuscle, sets: b.sets, type: b.exo.type
    }));
    const durationMin = Math.max(1, Math.round(num("bilan-min", measuredMin)));
    const result = recordSession({ type: "express", durationMin, exercises: warmEntries.concat(mainEntries) });
    renderFinish(result);
  });
}

export function renderFinish(result) {
  setHeader("QUETE TERMINEE", false);
  const prHtml = result.prs.length
    ? `<div class="center mt24"><div class="white" style="font-size:15px"><i class="ti ti-trophy green"></i> NOUVEAU RECORD</div>${result.prs.map(p => `<div class="green" style="font-size:13px;margin-top:4px">${esc(p.name)} : ${esc(p.label)}</div>`).join("")}</div>`
    : "";
  const changeHtml = result.changes.length
    ? `<div class="section-label mt24"><i class="ti ti-trending-up"></i> PROCHAINE FOIS (difficulte ajustee)</div>${result.changes.map(c =>
        c.note
          ? `<div class="hint">${esc(c.name)} : <span class="green">${esc(c.note)}</span></div>`
          : `<div class="hint">${esc(c.name)} : ${c.from} &rarr; <span class="green">${c.to}</span> ${esc(c.unit)}</div>`).join("")}`
    : "";

  app().innerHTML = panel(`
    <div class="center notif-flash">
      <div class="system-tag">SYSTEM</div>
      <div class="title-box" style="border-color:var(--green);color:var(--green);text-shadow:0 0 10px var(--green-glow)">QUETE TERMINEE</div>
    </div>
    <div class="center mt24">
      <div class="big-num green">+${result.gained}</div>
      <div class="faint" style="font-size:11px;letter-spacing:2px">XP GAGNES${result.prs.length ? " (records inclus)" : ""}</div>
    </div>
    ${prHtml}
    ${changeHtml}
    <div class="hint center mt16">Bilan enregistre. Stats, retards et difficulte mis a jour.</div>
    <button class="btn green-btn mt24" id="fin-status"><i class="ti ti-check"></i> RETOUR AU STATUT</button>
    <button class="btn ghost mt8" id="fin-express"><i class="ti ti-bolt"></i> Nouvelle quete</button>
  `);

  document.getElementById("fin-status").addEventListener("click", () => navTo("#status"));
  document.getElementById("fin-express").addEventListener("click", () => navTo("#express"));

  showSystemEvents(result.events);
}
