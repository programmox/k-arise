// K-Arise - SUIVI (calendrier mensuel, recuperation, historique, courbes) + edition de quete
import {
  getState, monthlyStats, recoveryStatus,
  updateSessionPerfs, deleteSession, trainingLoad
} from "./store.js";
import { MUSCLE_LABELS, rebuildSession, loadExercises } from "./engine.js";
import { app, esc, panel, go, toast, setHeader } from "./ui.js";
import { renderSessionPlayer } from "./screen-session.js";

// Exercices logues (avec perfs) presents dans l'historique
function loggedExos() {
  const s = getState();
  const map = {};
  s.history.forEach(h => h.exercises.forEach(e => {
    if (e.actualReps != null || e.actualWork != null) map[e.id] = e.name;
  }));
  return Object.entries(map);
}

// Serie temporelle d'un exercice (du plus ancien au plus recent)
function exoSeries(exoId) {
  const s = getState();
  const out = [];
  [...s.history].reverse().forEach(h => {
    const e = h.exercises.find(x => x.id === exoId && (x.actualReps != null || x.actualWork != null));
    if (e) out.push({ date: h.date, value: e.actualReps != null ? e.actualReps : e.actualWork, unit: e.actualReps != null ? "reps" : "s" });
  });
  return out;
}

function progressionChart(series) {
  if (!series.length) return '<div class="hint faint">Pas encore de donnees.</div>';
  const unit = series[0].unit;
  const W = 300, H = 130, pl = 8, prr = 8, pt = 14, pb = 18;
  const vals = series.map(p => p.value);
  const max = Math.max(...vals), min = Math.min(...vals), span = (max - min) || 1, n = series.length;
  const x = i => n === 1 ? W / 2 : pl + i * (W - pl - prr) / (n - 1);
  const y = v => pt + (H - pt - pb) * (1 - (v - min) / span);
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const dots = series.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="#46d4ff" style="filter:drop-shadow(0 0 3px #46d4ff)"/>`).join("");
  const last = series[series.length - 1].value;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible">
    <polyline points="${pts}" fill="none" stroke="#46d4ff" stroke-width="2" style="filter:drop-shadow(0 0 4px #46d4ff)"/>
    ${dots}
    <text x="${pl}" y="9" fill="#7fb4d2" font-size="9" font-family="monospace">record ${max} ${unit}</text>
    <text x="${pl}" y="${H - 4}" fill="#7fb4d2" font-size="9" font-family="monospace">${n} seance${n > 1 ? "s" : ""}</text>
    <text x="${W - prr}" y="9" fill="#9fe66a" font-size="10" font-family="monospace" text-anchor="end">actuel ${last} ${unit}</text>
  </svg>`;
}

export function renderSuivi() {
  const s = getState();
  const m = monthlyStats();
  const rec = recoveryStatus();
  const monthName = new Date(m.year, m.month, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // grille calendrier (semaine commence lundi)
  const firstDow = (new Date(m.year, m.month, 1).getDay() + 6) % 7;
  let cells = "";
  for (let i = 0; i < firstDow; i++) cells += `<div></div>`;
  for (let d = 1; d <= m.daysInMonth; d++) {
    const trained = m.days[d];
    const isToday = d === m.today;
    const bg = trained ? "background:rgba(70,212,255,0.18);border-color:var(--cyan);color:var(--white)" : "";
    const todayMark = isToday ? "box-shadow:0 0 0 1px var(--green)" : "";
    cells += `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:11px;border:1px solid var(--line);border-radius:4px;color:var(--text-faint);${bg};${todayMark}">${d}</div>`;
  }

  // recuperation par groupe
  const order = ["dos", "lombaires", "pectoraux", "epaules", "bras", "jambes", "fessiers", "abdos", "obliques", "core", "mobilite-genou", "cardio"];
  const present = order.filter(k => rec[k]);
  const recRows = present.length ? present.map(k => {
    const r = rec[k];
    const ok = r.recovered;
    const color = ok ? "var(--green)" : (r.hoursLeft >= 24 ? "var(--red)" : "var(--orange)");
    const txt = ok ? "Pret" : `~${r.hoursLeft}h`;
    return `<div class="row" style="font-size:12px;margin-top:7px">
      <span class="dim">${esc(MUSCLE_LABELS[k] || k)}</span>
      <span style="color:${color}"><i class="ti ${ok ? "ti-circle-check" : "ti-hourglass-low"}"></i> ${txt}</span></div>`;
  }).join("") : `<div class="hint faint">Aucune seance encore. La recuperation s'affichera apres ta premiere quete.</div>`;

  app().innerHTML =
    panel(`
      <div class="center mb16"><div class="title-box">SUIVI</div></div>
      <div class="row gap12 mb12">
        <div style="flex:1"><div class="big-num">${m.count}</div><div class="faint" style="font-size:10px;letter-spacing:1px">SEANCES CE MOIS</div></div>
        <div style="flex:1"><div class="big-num">${s.history.length}</div><div class="faint" style="font-size:10px;letter-spacing:1px">TOTAL</div></div>
      </div>
      <div class="section-label" style="text-transform:capitalize">${esc(monthName)}</div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px">
        ${["L", "M", "M", "J", "V", "S", "D"].map(x => `<div class="faint center" style="font-size:10px">${x}</div>`).join("")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells}</div>
    `) +
    (() => {
      const load = trainingLoad();
      const color = load.level === "stop" ? "var(--red)" : load.level === "caution" ? "var(--orange)" : "var(--green)";
      const label = load.ratio == null ? "Pas encore assez d'historique (28 jours de donnees necessaires)."
        : load.level === "stop" ? "Tres au-dessus de ton habitude : leve le pied."
        : load.level === "caution" ? "Progression rapide : prudence."
        : "Charge equilibree, continue.";
      return panel(`
        <div class="section-label"><i class="ti ti-gauge"></i> CHARGE D'ENTRAINEMENT (muscu + course)</div>
        <div class="hint mb8">Effort ressenti x minutes, tout cumule : ton corps est un seul systeme de recuperation.</div>
        <div class="row gap12" style="text-align:center;margin-bottom:8px">
          <div style="flex:1"><div class="white" style="font-size:18px">${load.weekLoad}</div><div class="faint" style="font-size:10px">CHARGE 7J</div></div>
          <div style="flex:1"><div class="white" style="font-size:18px">${load.chronic}</div><div class="faint" style="font-size:10px">MOY/JOUR 28J</div></div>
          <div style="flex:1"><div style="font-size:18px;color:${color}">${load.ratio ?? "-"}</div><div class="faint" style="font-size:10px">RATIO 7J/28J</div></div>
        </div>
        <div class="hint" style="color:${color}">${label}</div>
        <div class="hint faint mt8">Indicateur de prudence (ratio > 1.3 = progression rapide, > 1.5 = risque), pas une loi. La douleur declaree passe toujours avant.</div>
      `);
    })() +
    panel(`
      <div class="section-label"><i class="ti ti-heartbeat"></i> RECUPERATION PAR GROUPE</div>
      <div class="hint mb8">Temps estime avant de re-solliciter un groupe pour des gains optimaux (gros muscles ~48h, abdos ~24h, mobilite ~12h).</div>
      ${recRows}
      <div class="hint faint mt12">Re-travailler un groupe encore en recuperation = volume peu productif et risque de surmenage. Le conseil s'affiche aussi quand tu generes une quete.</div>
    `) +
    panel(`
      <div class="section-label"><i class="ti ti-edit"></i> HISTORIQUE (corriger une quete)</div>
      <div class="hint mb8">Erreur de saisie ? Modifie ou supprime une quete, le Systeme recalcule stats et progression.</div>
      ${s.history.length ? s.history.slice(0, 15).map((h, idx) => `
        <div class="row" data-edit="${idx}" style="cursor:pointer;padding:8px 0;border-bottom:1px solid var(--line)">
          <span class="dim" style="font-size:12px">${new Date(h.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} &middot; ${esc(h.type)}</span>
          <span class="faint" style="font-size:11px">${h.type === "run" && h.run ? `${h.run.distanceKm} km` : `${h.exercises.length} exos`} &middot; ${h.durationMin}min <i class="ti ti-chevron-right"></i></span>
        </div>`).join("") : '<div class="hint faint">Aucune quete a corriger.</div>'}
    `) +
    (() => {
      const logged = loggedExos();
      return panel(`
        <div class="section-label"><i class="ti ti-chart-line"></i> PROGRESSION PAR EXERCICE</div>
        ${logged.length
          ? `<select id="prog-sel" class="mb8">${logged.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join("")}</select><div id="prog-chart" class="mt12"></div>`
          : '<div class="hint faint">Loggue des seances avec tes perfs reelles pour voir tes courbes de progression.</div>'}
      `);
    })();

  document.querySelectorAll("[data-edit]").forEach(row =>
    row.addEventListener("click", () => renderSessionEdit(parseInt(row.dataset.edit))));

  const progSel = document.getElementById("prog-sel");
  if (progSel) {
    const drawProg = () => { document.getElementById("prog-chart").innerHTML = progressionChart(exoSeries(progSel.value)); };
    progSel.addEventListener("change", drawProg);
    drawProg();
  }
}

// Edition des perfs d'une quete passee
export function renderSessionEdit(index) {
  const s = getState();
  const entry = s.history[index];
  if (!entry) { go("#suivi"); return; }
  setHeader("DETAIL DE QUETE", true);

  // Run : vue simplifiee (donnees + suppression, pas d'exos a editer)
  if (entry.type === "run" && entry.run) {
    const r = entry.run;
    const rows = [
      ["Distance", `${r.distanceKm} km`], ["Duree", `${entry.durationMin} min`],
      ["Allure", `${Math.floor(r.paceMinKm)}:${String(Math.round((r.paceMinKm % 1) * 60)).padStart(2, "0")} /km`],
      r.avgHr ? ["FC moyenne", `${r.avgHr} bpm`] : null,
      r.elevation ? ["D+", `${r.elevation} m`] : null,
      ["Source", r === entry.run && entry.source === "strava" ? "Strava" : "Manuel"]
    ].filter(Boolean).map(([k, v]) =>
      `<div class="row" style="font-size:13px;margin-bottom:6px"><span class="dim">${k}</span><span class="white">${v}</span></div>`).join("");
    app().innerHTML = panel(`
      <div class="center mb16"><div class="title-box">EXPLORATION</div></div>
      <div class="hint mb12">${new Date(entry.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
      ${rows}
      <button class="btn danger mt16" id="ed-del"><i class="ti ti-trash"></i> Supprimer cette course</button>
      <button class="btn ghost mt8" id="ed-back"><i class="ti ti-arrow-left"></i> Retour</button>
    `);
    document.getElementById("ed-del").addEventListener("click", () => {
      if (confirm("Supprimer cette course ? Stats et progression recalculees.")) {
        deleteSession(index); toast("Course supprimee."); go("#suivi");
      }
    });
    document.getElementById("ed-back").addEventListener("click", () => go("#suivi"));
    return;
  }

  const rows = entry.exercises.map((e, i) => {
    if (!e.rpe) return ""; // echauffement non logge
    let inputs;
    if (e.type === "reps") {
      const w = e.weight != null
        ? `<div style="flex:1"><label class="field">Charge (kg)</label><input type="number" min="0" step="0.5" id="ed-w-${i}" value="${e.weight}" /></div>`
        : "";
      inputs = `<div class="row gap12 mt8"><div style="flex:1"><label class="field">Reps faites / serie</label><input type="number" min="0" id="ed-reps-${i}" value="${e.actualReps ?? ""}" /></div>${w}</div>`;
    } else {
      inputs = `<div class="mt8"><label class="field">Temps tenu (s) / serie</label><input type="number" min="0" id="ed-work-${i}" value="${e.actualWork ?? ""}" /></div>`;
    }
    return `<div class="exo">
      <div class="exo-head"><span class="exo-name">${esc(e.name)}</span></div>
      ${inputs}
      <label class="field">Ressenti</label>
      <div class="chips rpe" data-i="${i}">
        <span class="chip ${e.rpe === "facile" ? "on" : ""}" data-rpe="facile"><i class="ti ti-mood-smile"></i> Facile</span>
        <span class="chip ${e.rpe === "correct" ? "on" : ""}" data-rpe="correct"><i class="ti ti-flame"></i> Correct</span>
        <span class="chip ${e.rpe === "dur" ? "on" : ""}" data-rpe="dur"><i class="ti ti-mood-sad"></i> Dur</span>
      </div>
    </div>`;
  }).join("");

  app().innerHTML = panel(`
    <div class="center mb16"><div class="title-box">CORRIGER LA QUETE</div></div>
    <div class="hint mb12">${new Date(entry.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} &middot; ${esc(entry.type)}</div>
    ${rows || '<div class="hint faint">Cette quete n\'a pas de perfs enregistrees.</div>'}
    <button class="btn mt16" id="ed-redo"><i class="ti ti-rotate-clockwise"></i> REFAIRE CETTE SEANCE</button>
    <button class="btn green-btn mt8" id="ed-save"><i class="ti ti-check"></i> ENREGISTRER LES CORRECTIONS</button>
    <button class="btn danger mt8" id="ed-del"><i class="ti ti-trash"></i> Supprimer cette quete</button>
    <button class="btn ghost mt8" id="ed-back"><i class="ti ti-arrow-left"></i> Retour</button>
  `);

  document.getElementById("ed-redo").addEventListener("click", async () => {
    await loadExercises();
    const session = rebuildSession(entry.exercises.map(e => ({ id: e.id, sets: e.sets })), s.profile, s.exoState);
    if (!session.main.length) { toast("Impossible de reconstruire cette seance."); return; }
    renderSessionPlayer(session);
  });

  app().querySelectorAll(".rpe").forEach(group =>
    group.querySelectorAll(".chip").forEach(chip =>
      chip.addEventListener("click", () => {
        group.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
        chip.classList.add("on");
      })));

  document.getElementById("ed-save").addEventListener("click", () => {
    const num = (id, def) => { const el = document.getElementById(id); if (!el) return def; const v = parseFloat(el.value); return isNaN(v) ? def : v; };
    const updated = entry.exercises.map((e, i) => {
      if (!e.rpe) return { actualReps: e.actualReps, actualWork: e.actualWork, weight: e.weight, rpe: e.rpe };
      const rpe = app().querySelector(`.rpe[data-i="${i}"] .chip.on`)?.dataset.rpe || e.rpe;
      if (e.type === "reps") {
        const reps = num(`ed-reps-${i}`, e.actualReps);
        const weight = e.weight != null ? num(`ed-w-${i}`, e.weight) : null;
        return { actualReps: reps == null ? null : Math.round(reps), actualWork: null, weight, rpe };
      }
      const work = num(`ed-work-${i}`, e.actualWork);
      return { actualReps: null, actualWork: work == null ? null : Math.round(work), weight: null, rpe };
    });
    updateSessionPerfs(index, updated);
    toast("Quete corrigee. Stats et progression recalculees.");
    go("#suivi");
  });

  document.getElementById("ed-del").addEventListener("click", () => {
    if (confirm("Supprimer cette quete ? Stats et progression seront recalculees.")) {
      deleteSession(index);
      toast("Quete supprimee.");
      go("#suivi");
    }
  });
  document.getElementById("ed-back").addEventListener("click", () => go("#suivi"));
}
