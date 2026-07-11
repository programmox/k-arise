// K-Arise - point d'entree : routeur par hash + navigation
import { loadState, getState } from "./store.js";
import { setTimerConfig } from "./timer.js";
import {
  renderStatus, renderOnboarding, renderEquipment,
  renderExpress, renderLibre, renderSuivi, renderNutrition, renderProfile,
  renderCourse,
  setHeader, hideHeader, pauseActiveTimer
} from "./screens.js";
import { handleOAuthRedirect, syncIfDue } from "./strava.js";

const TITLES = {
  status: "STATUT", express: "QUETE EXPRESS", libre: "SEANCE LIBRE",
  course: "EXPLORATION", suivi: "SUIVI", nutrition: "RECUP & REPAS",
  equipment: "INVENTAIRE", profile: "PROFIL"
};

const ROUTES = {
  status: renderStatus,
  onboarding: renderOnboarding,
  equipment: renderEquipment,
  express: renderExpress,
  libre: renderLibre,
  course: renderCourse,
  suivi: renderSuivi,
  nutrition: renderNutrition,
  profile: renderProfile
};

// MATERIEL sort de la nav (accessible via Profil) pour garder 6 items lisibles sur mobile.
const NAV = [
  { hash: "status", icon: "ti-layout-grid", label: "STATUT" },
  { hash: "express", icon: "ti-bolt", label: "EXPRESS" },
  { hash: "course", icon: "ti-run", label: "COURSE" },
  { hash: "suivi", icon: "ti-chart-line", label: "SUIVI" },
  { hash: "nutrition", icon: "ti-tools-kitchen-2", label: "REPAS" },
  { hash: "profile", icon: "ti-user", label: "PROFIL" }
];

function renderNav(active) {
  let nav = document.getElementById("nav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "nav";
    nav.className = "nav";
    document.body.appendChild(nav);
  }
  nav.innerHTML = NAV.map(n =>
    `<a href="#${n.hash}" class="${n.hash === active ? "active" : ""}"><i class="ti ${n.icon} ic"></i>${n.label}</a>`
  ).join("");
  nav.style.display = "flex";
}

function route() {
  pauseActiveTimer(); // met en pause le chrono si on quitte une seance en cours
  const s = getState();
  let hash = location.hash.replace("#", "") || "status";

  // force l'onboarding au premier lancement
  if (!s.onboarded && hash !== "onboarding") {
    location.hash = "onboarding";
    return;
  }

  const fn = ROUTES[hash] || renderStatus;
  fn();

  if (hash === "onboarding") {
    hideHeader();
    const nav = document.getElementById("nav");
    if (nav) nav.style.display = "none";
  } else {
    setHeader(TITLES[hash] || "K-ARISE", hash !== "status");
    renderNav(hash);
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", async () => {
  loadState();
  setTimerConfig(getState().settings);
  // Retour d'autorisation Strava (?code=...) : traite AVANT le routage, puis re-render
  if (location.search.includes("code=") || location.search.includes("error=")) {
    await handleOAuthRedirect().catch(() => {});
  }
  route();
  syncIfDue(); // sync Strava silencieux si connecte, en ligne et sync du (non bloquant)
  window.addEventListener("online", () => syncIfDue());
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});
