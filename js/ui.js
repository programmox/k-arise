// K-Arise - primitives d'UI partagees (helpers de rendu communs a tous les ecrans)
import { setSaveErrorHandler } from "./store.js";

export const app = () => document.getElementById("app");
export const esc = s => (s == null ? "" : String(s)).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function toast(msg, ms = 2200) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// Alerte si l'ecriture localStorage echoue (stockage plein/indisponible). Erreur bloquante uniquement.
setSaveErrorHandler(() =>
  toast("Stockage sature : tes donnees n'ont pas pu etre sauvegardees. Exporte ta sauvegarde et libere de l'espace.", 6000));

// Saisie 1-tap : champ numerique entoure de gros boutons -/+ (pas de clavier en salle,
// mains moites). value peut etre "" (champ vide = "non renseigne" pour l'appelant).
export function stepper(id, value, step = 1, min = 0) {
  return `<div class="stepper">
    <button type="button" class="step-btn" data-target="${id}" data-inc="${-step}" aria-label="Moins">&minus;</button>
    <input type="number" id="${id}" value="${value}" min="${min}" step="${step}" inputmode="decimal" />
    <button type="button" class="step-btn" data-target="${id}" data-inc="${step}" aria-label="Plus">+</button>
  </div>`;
}
// Delegation globale : un seul listener pour tous les steppers de l'app.
document.addEventListener("click", e => {
  const b = e.target.closest(".step-btn");
  if (!b) return;
  const input = document.getElementById(b.dataset.target);
  if (!input) return;
  const inc = parseFloat(b.dataset.inc);
  const min = input.min !== "" ? parseFloat(input.min) : 0;
  const v = (parseFloat(input.value) || 0) + inc;
  input.value = Math.max(min, Math.round(v * 100) / 100);
});

export function panel(inner) {
  return `<div class="panel"><span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>${inner}</div>`;
}

export function go(hash) { location.hash = hash; }

// Navigation robuste : si la cible == hash courant, location.hash ne declenche pas
// hashchange (donc pas de re-rendu). On force alors le routeur manuellement.
// Corrige le cas "Retour au statut" quand la quete a ete lancee via Reprendre (hash deja #status).
export function navTo(hash) {
  const target = hash.startsWith("#") ? hash : "#" + hash;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = target;
}

// Barre superieure : titre + retour (history.back, repli sur le statut)
export function setHeader(title, showBack) {
  let h = document.getElementById("topbar");
  if (!h) { h = document.createElement("div"); h.id = "topbar"; document.body.insertBefore(h, document.body.firstChild); }
  h.className = "topbar";
  h.style.display = "flex";
  h.innerHTML = `
    ${showBack ? '<button class="tb-btn" id="tb-back" aria-label="Retour"><i class="ti ti-chevron-left"></i></button>' : '<span class="tb-btn" style="visibility:hidden"></span>'}
    <span class="tb-title">${esc(title)}</span>
    <span class="tb-btn" style="visibility:hidden"></span>`;
  if (showBack) document.getElementById("tb-back").addEventListener("click", () => {
    if (history.length > 1) history.back(); else go("#status");
  });
}

export function hideHeader() {
  const h = document.getElementById("topbar");
  if (h) h.style.display = "none";
}

// File de pop-ups "System" plein ecran (rang up, niveau, titre, serie)
function eventContent(ev) {
  if (ev.type === "rank") return { tag: "RANG SUPERIEUR", lead: "Ta capacite reelle franchit un palier", main: `[ ${ev.from} ] &nbsp;&#9654;&#9654;&nbsp; [ ${ev.to} ]`, sub: "Standards de force atteints" };
  if (ev.type === "level") return { tag: "NIVEAU SUPERIEUR", lead: "Ton investissement grandit", main: `NIVEAU ${ev.level}`, sub: "" };
  if (ev.type === "title") return { tag: "NOUVEAU TITRE", lead: "Titre debloque", main: `[ ${esc(ev.label)} ]`, sub: `${esc(ev.hint)} &middot; +${ev.xp} XP` };
  if (ev.type === "streak") return { tag: "SERIE", lead: "Discipline recompensee", main: `${ev.days} JOURS`, sub: "Ne lache rien" };
  return { tag: "SYSTEM", lead: "", main: "", sub: "" };
}

export function showSystemEvents(events, onDone) {
  const queue = (events || []).slice();
  if (!queue.length) { if (onDone) onDone(); return; }

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:100;background:rgba(2,6,14,0.92);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)";
  document.body.appendChild(overlay);

  let i = 0;
  function render() {
    const ev = queue[i];
    const c = eventContent(ev);
    const isTitle = ev.type === "title";
    const accent = isTitle ? "var(--green)" : "var(--cyan)";
    const glow = isTitle ? "var(--green-glow)" : "var(--cyan)";
    overlay.innerHTML = `
      <div style="position:relative;width:330px;background:rgba(8,18,36,0.95);border:1px solid var(--line-strong);border-radius:6px;padding:24px 20px;box-shadow:0 0 36px rgba(29,155,209,0.4),inset 0 0 30px rgba(29,155,209,0.08);font-family:var(--mono);color:var(--text)">
        <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
        <div style="text-align:center;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px">
          <span style="display:inline-flex;width:24px;height:24px;border:1px solid var(--cyan);border-radius:50%;align-items:center;justify-content:center;color:var(--cyan);text-shadow:var(--glow-text);font-size:13px">!</span>
          <span style="font-size:16px;letter-spacing:4px;color:var(--white);text-shadow:var(--glow-text)">NOTIFICATION</span>
        </div>
        <div class="center faint" style="font-size:11px;margin-bottom:6px">${esc(c.lead)}</div>
        <div class="center" style="font-size:10px;letter-spacing:2px;color:var(--cyan-soft);margin-bottom:12px">${c.tag}</div>
        <div style="border:1px solid ${accent};border-radius:4px;padding:16px;text-align:center;box-shadow:0 0 16px ${isTitle ? "rgba(111,224,74,0.35)" : "rgba(70,212,255,0.3)"};margin-bottom:12px">
          <span style="font-size:20px;letter-spacing:2px;color:${accent};text-shadow:0 0 12px ${glow}">${c.main}</span>
        </div>
        ${c.sub ? `<div class="center faint" style="font-size:11px;margin-bottom:14px">${c.sub}</div>` : '<div style="height:8px"></div>'}
        <button class="btn" id="ev-ok">${i < queue.length - 1 ? "SUIVANT" : "OK"}</button>
      </div>`;
    overlay.querySelector("#ev-ok").addEventListener("click", () => {
      i++;
      if (i >= queue.length) { overlay.remove(); if (onDone) onDone(); }
      else render();
    });
  }
  render();
}
