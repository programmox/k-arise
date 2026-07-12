// K-Arise - course en direct : chrono + GPS (distance, allure) + coaching vocal d'allure.
// API natives uniquement : Geolocation (position), SpeechSynthesis (voix), WakeLock (ecran allume).
// Limite honnete des PWA : l'ecran doit rester ALLUME pendant la course (wake lock actif) ;
// telephone verrouille = GPS coupe par Android. Brassard ou poche ecran actif conseille.
import { getState, recordRun } from "./store.js";
import { formatPace, paceToKmh, KIND_LABELS, STRETCHES, WARMUP_RUN } from "./running.js";
import { app, esc, toast, panel, navTo, setHeader, showSystemEvents } from "./ui.js";
import { computeNeeds } from "./nutrition.js";

// ---------- Voix ----------
let voiceOn = true;
let lastSpokenAt = 0;
function speak(msg, minGapMs = 15000) {
  if (!voiceOn || !("speechSynthesis" in window)) return;
  const now = Date.now();
  if (now - lastSpokenAt < minGapMs) return;
  lastSpokenAt = now;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(msg);
    u.lang = "fr-FR";
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (e) { /* voix indisponible : silencieux */ }
}

// ---------- GPS ----------
const R_EARTH = 6371;
function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

let wakeLock = null;
async function acquireWakeLock() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
}

/*
 renderRunLive(workout?, planWeek?, planDay?)
 workout = jour du plan { kind, km, paceTarget, desc } ou null (course libre).
*/
export function renderRunLive(workout = null, planWeek = null, planDay = null) {
  setHeader("EXPLORATION EN DIRECT", true);
  const target = workout ? workout.paceTarget : null;

  const s = getState();
  voiceOn = s.settings.sound !== false;

  app().innerHTML = panel(`
    <div class="center"><div class="system-tag" id="rl-status">EN ATTENTE DU GPS...</div></div>
    <div class="timer-wrap">
      <div class="timer-clock" id="rl-clock">0:00</div>
      <div class="row gap12 mt12" style="text-align:center">
        <div style="flex:1"><div class="big-num" id="rl-dist" style="font-size:28px">0.00</div><div class="faint" style="font-size:10px;letter-spacing:1px">KM</div></div>
        <div style="flex:1"><div class="big-num" id="rl-pace" style="font-size:28px">-</div><div class="faint" style="font-size:10px;letter-spacing:1px">ALLURE /KM</div></div>
        <div style="flex:1"><div class="big-num" id="rl-kmh" style="font-size:28px">-</div><div class="faint" style="font-size:10px;letter-spacing:1px">KM/H</div></div>
      </div>
    </div>
    ${workout ? `<div class="center hint mb8">Objectif : ${esc(KIND_LABELS[workout.kind])} &middot; ${workout.km} km &middot; ${formatPace(target)} (${paceToKmh(target)})</div>
    <div class="center" id="rl-advice" style="font-size:13px;letter-spacing:2px;color:var(--cyan-soft);min-height:20px"></div>` : ""}
    <div class="btn-row mt16">
      <button class="btn green-btn" id="rl-toggle"><i class="ti ti-player-play"></i> DEMARRER</button>
      <button class="btn danger" id="rl-stop" disabled><i class="ti ti-flag"></i> TERMINER</button>
    </div>
    <div class="row mt12" style="padding:4px 0"><span class="dim" style="font-size:12px"><i class="ti ti-volume"></i> Coach vocal</span>
      <button class="chip ${voiceOn ? "on" : ""}" id="rl-voice">${voiceOn ? "ACTIVE" : "COUPE"}</button></div>
    <div class="hint faint mt8"><i class="ti ti-alert-triangle"></i> L'ecran doit rester allume pendant la course (le GPS se coupe si le telephone est verrouille). Mets la luminosite au minimum.</div>
  `) + `<div id="rl-warmup">${panel(`
    <div class="section-label"><i class="ti ti-flame"></i> ECHAUFFEMENT AVANT DE PARTIR (~5 MIN)</div>
    <div class="hint mb8">Muscles et articulations prets = allure plus fluide et moins de blessures. Fais-le pendant que le GPS accroche.</div>
    ${WARMUP_RUN.map(w => `
      <div style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div class="row"><span class="white" style="font-size:13px">${esc(w.name)}</span><span class="faint" style="font-size:11px">${esc(w.dose)}</span></div>
        <figure class="exo-figure"><img loading="lazy" alt="${esc(w.name)}" src="${w.img}" onerror="this.closest('.exo-figure').remove()" /></figure>
        <div class="hint faint">${esc(w.cue)}</div>
      </div>`).join("")}
  `)}</div>`;

  const positions = [];      // { lat, lon, t }
  let totalKm = 0;
  let elapsed = 0;           // secondes
  let running = false;
  let watchId = null;
  let tickInt = null;
  let startedAt = null;

  const el = id => document.getElementById(id);

  // allure glissante sur ~45s (lissee, ignore le bruit GPS)
  function rollingPace() {
    if (positions.length < 2) return null;
    const now = positions[positions.length - 1].t;
    let i = positions.length - 2;
    let dist = 0;
    while (i >= 0 && now - positions[i].t < 45000) {
      dist += haversineKm(positions[i], positions[i + 1]);
      i--;
    }
    const dtMin = (now - positions[Math.max(0, i + 1)].t) / 60000;
    if (dist < 0.005 || dtMin <= 0) return null; // quasi immobile
    return dtMin / dist;
  }

  function coach(pace) {
    if (!target || !pace) return;
    const adviceEl = el("rl-advice");
    if (pace > target + 0.4) {
      if (adviceEl) { adviceEl.textContent = "ACCELERE"; adviceEl.style.color = "var(--orange)"; }
      speak("Accélère un peu.");
    } else if (pace < target - 0.4) {
      if (adviceEl) { adviceEl.textContent = "RALENTIS"; adviceEl.style.color = "var(--orange)"; }
      speak("Ralentis, garde ton allure cible.");
    } else {
      if (adviceEl) { adviceEl.textContent = "BONNE ALLURE"; adviceEl.style.color = "var(--green)"; }
      speak("Bonne allure, continue.", 60000); // encouragement plus espace
    }
  }

  function onPos(p) {
    if (!running) return;
    if (p.coords.accuracy > 30) return; // point GPS trop imprecis, ignore
    const pt = { lat: p.coords.latitude, lon: p.coords.longitude, t: Date.now() };
    const prev = positions[positions.length - 1];
    if (prev) {
      const d = haversineKm(prev, pt);
      if (d < 0.15) totalKm += d; // saut > 150 m entre 2 points = glitch GPS, ignore
    }
    positions.push(pt);
    el("rl-dist").textContent = totalKm.toFixed(2);
    const pace = rollingPace();
    if (pace) {
      el("rl-pace").textContent = formatPace(pace).replace(" /km", "");
      el("rl-kmh").textContent = paceToKmh(pace).replace(" km/h", "");
      coach(pace);
    }
    el("rl-status").textContent = "GPS OK · EN COURSE";
  }

  function startWatch() {
    if (!("geolocation" in navigator)) { toast("GPS indisponible sur cet appareil."); return false; }
    watchId = navigator.geolocation.watchPosition(onPos,
      err => { el("rl-status").textContent = "GPS : " + (err.code === 1 ? "PERMISSION REFUSEE" : "SIGNAL FAIBLE"); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return true;
  }

  function fmtClock(sec) {
    const m = Math.floor(sec / 60), ss = sec % 60;
    return `${m}:${String(ss).padStart(2, "0")}`;
  }

  el("rl-toggle").addEventListener("click", async () => {
    if (!running) {
      if (watchId == null && !startWatch()) return;
      if (!startedAt) { startedAt = Date.now(); speak(workout ? `C'est parti. Objectif ${workout.km} kilomètres.` : "C'est parti.", 0); }
      running = true;
      await acquireWakeLock();
      tickInt = setInterval(() => { elapsed++; el("rl-clock").textContent = fmtClock(elapsed); }, 1000);
      el("rl-toggle").innerHTML = '<i class="ti ti-player-pause"></i> PAUSE';
      el("rl-stop").disabled = false;
      const wu = el("rl-warmup"); if (wu) wu.style.display = "none"; // echauffement fait, on degage l'ecran
    } else {
      running = false;
      clearInterval(tickInt);
      el("rl-toggle").innerHTML = '<i class="ti ti-player-play"></i> REPRENDRE';
      el("rl-status").textContent = "EN PAUSE";
    }
  });

  // re-acquiert le wake lock quand on revient sur l'app (Android le relache en arriere-plan)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && running) acquireWakeLock();
  });

  el("rl-stop").addEventListener("click", () => {
    if (totalKm < 0.05 || elapsed < 30) {
      if (!confirm("Course tres courte (GPS a peine demarre). Enregistrer quand meme ?")) return;
    }
    running = false;
    clearInterval(tickInt);
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    try { speechSynthesis.cancel(); } catch (e) {}

    const distanceKm = Math.max(0.1, Math.round(totalKm * 100) / 100);
    const durationMin = Math.max(1, Math.round(elapsed / 60));
    speak(`Course terminée. ${distanceKm} kilomètres. Bien joué.`, 0);
    renderRunBilan({ distanceKm, durationMin, kind: workout ? workout.kind : null, planWeek, planDay });
  });
}

// ---------- Bilan course : effort ressenti + douleur (nourrit la charge unifiee et les garde-fous) ----------
export function renderRunBilan(data) {
  setHeader("BILAN D'EXPLORATION", false);
  app().innerHTML = panel(`
    <div class="center mb16"><div class="system-tag">SYSTEM</div><div class="title-box">BILAN</div></div>
    <div class="center white mb12" style="font-size:15px">${data.distanceKm} km &middot; ${data.durationMin} min</div>

    <div class="section-label">EFFORT RESSENTI (charge d'entrainement)</div>
    <div class="chips mb12" id="rb-rpe">
      <span class="chip" data-v="3"><i class="ti ti-mood-smile"></i> Facile</span>
      <span class="chip on" data-v="5"><i class="ti ti-flame"></i> Correct</span>
      <span class="chip" data-v="7"><i class="ti ti-mood-sad"></i> Dur</span>
      <span class="chip" data-v="9"><i class="ti ti-skull"></i> Tres dur</span>
    </div>

    <div class="section-label">DOULEUR TIBIAS / GENOUX ?</div>
    <div class="hint mb8">Signal precoce de periostite ou de genou du coureur : aucun capteur ne le voit, toi si.</div>
    <div class="chips mb12" id="rb-pain">
      <span class="chip on" data-v=""><i class="ti ti-circle-check"></i> Aucune</span>
      <span class="chip" data-v="legere"><i class="ti ti-alert-triangle"></i> Legere</span>
      <span class="chip" data-v="forte"><i class="ti ti-hand-stop"></i> Forte</span>
    </div>

    <button class="btn green-btn mt8" id="rb-save"><i class="ti ti-check"></i> VALIDER</button>
  `);

  ["rb-rpe", "rb-pain"].forEach(gid =>
    document.querySelectorAll(`#${gid} .chip`).forEach(chip =>
      chip.addEventListener("click", () => {
        document.querySelectorAll(`#${gid} .chip`).forEach(c => c.classList.remove("on"));
        chip.classList.add("on");
      })));

  document.getElementById("rb-save").addEventListener("click", () => {
    const rpeScore = parseInt(document.querySelector("#rb-rpe .chip.on")?.dataset.v) || 5;
    const pain = document.querySelector("#rb-pain .chip.on")?.dataset.v || null;
    const result = recordRun(Object.assign({}, data, { rpeScore, pain: pain || null }));
    if (data.kind === "test") toast("Test 5K enregistre. Regenere ton plan (onglet Course) : tes allures seront recalibrees dessus.", 5000);
    showSystemEvents(result.events, () => renderRunFinish(result, data.distanceKm, data.durationMin));
    if (!result.events.length) renderRunFinish(result, data.distanceKm, data.durationMin);
  });
}

// ---------- Fin de course : XP + etirements + nutrition de recup ----------
export function renderRunFinish(result, distanceKm, durationMin) {
  setHeader("EXPLORATION TERMINEE", false);
  const s = getState();
  const needs = computeNeeds(s.profile, s.history[0]); // history[0] = la course qu'on vient d'enregistrer
  const pace = durationMin / distanceKm;

  const stretchRows = STRETCHES.map(st => `
    <div style="padding:7px 0;border-bottom:1px solid var(--line)">
      <div class="row"><span class="white" style="font-size:13px">${esc(st.name)}</span><span class="faint" style="font-size:11px">${st.sec}s</span></div>
      <figure class="exo-figure"><img loading="lazy" alt="${esc(st.name)}" src="${st.img}" onerror="this.closest('.exo-figure').remove()" /></figure>
      <div class="hint faint">${esc(st.cue)}</div>
    </div>`).join("");

  app().innerHTML = panel(`
    <div class="center notif-flash">
      <div class="system-tag">SYSTEM</div>
      <div class="title-box" style="border-color:var(--green);color:var(--green);text-shadow:0 0 10px var(--green-glow)">EXPLORATION TERMINEE</div>
    </div>
    <div class="center mt16">
      <div class="big-num green">+${result.gained}</div>
      <div class="faint" style="font-size:11px;letter-spacing:2px">XP GAGNES${result.isPacePr ? " · PR D'ALLURE" : ""}</div>
    </div>
    <div class="row gap12 mt16" style="text-align:center">
      <div style="flex:1"><div class="white" style="font-size:18px">${distanceKm}</div><div class="faint" style="font-size:10px">KM</div></div>
      <div style="flex:1"><div class="white" style="font-size:18px">${durationMin}</div><div class="faint" style="font-size:10px">MIN</div></div>
      <div style="flex:1"><div class="white" style="font-size:18px">${formatPace(pace).replace(" /km", "")}</div><div class="faint" style="font-size:10px">/KM</div></div>
    </div>
  `) + panel(`
    <div class="section-label"><i class="ti ti-stretching"></i> ETIREMENTS DE RECUPERATION (5 MIN)</div>
    <div class="hint mb8">A faire maintenant, muscles chauds : reduit les courbatures et protege tes prochaines seances.</div>
    ${stretchRows}
  `) + panel(`
    <div class="section-label"><i class="ti ti-flame"></i> RECUP NUTRITION (dans l'heure)</div>
    <div class="row gap12" style="text-align:center;margin:8px 0">
      <div style="flex:1"><div class="white" style="font-size:18px">${needs.post.protein}g</div><div class="faint" style="font-size:10px">PROTEINES</div></div>
      <div style="flex:1"><div class="white" style="font-size:18px">${needs.post.carbs}g</div><div class="faint" style="font-size:10px">GLUCIDES</div></div>
      <div style="flex:1"><div class="white" style="font-size:18px">${needs.post.kcal}</div><div class="faint" style="font-size:10px">KCAL</div></div>
    </div>
    <div class="hint mb8">Les glucides rechargent le glycogene brule en course, les proteines reparent. Bois ${(needs.daily.water / 1000).toFixed(1)} L sur la journee.</div>
    <button class="btn green-btn" id="rf-recipe"><i class="ti ti-tools-kitchen-2"></i> VOIR LES RECETTES DE RECUP</button>
  `) + panel(`
    <button class="btn" id="rf-course"><i class="ti ti-run"></i> RETOUR A L'EXPLORATION</button>
    <button class="btn ghost mt8" id="rf-status"><i class="ti ti-layout-grid"></i> STATUT</button>
  `);

  document.getElementById("rf-recipe").addEventListener("click", () => navTo("#nutrition"));
  document.getElementById("rf-course").addEventListener("click", () => navTo("#course"));
  document.getElementById("rf-status").addEventListener("click", () => navTo("#status"));
}
