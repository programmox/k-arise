// K-Arise - integration Strava : OAuth (app API personnelle de l'utilisateur) + sync des courses.
// Tout le reseau Strava vit ici. Offline-first : un echec de sync ne bloque jamais l'app.
import { getState, saveState, insertRuns, getRuns } from "./store.js";
import { adaptPlan } from "./running.js";

const AUTH_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";

export function isConfigured() {
  const st = getState().strava;
  return Boolean(st.clientId && st.clientSecret);
}

export function isConnected() {
  return Boolean(getState().strava.refreshToken);
}

// Redirige vers l'ecran d'autorisation Strava. redirect_uri = l'app elle-meme
// (fonctionne en local http://localhost:4173/ ET sur GitHub Pages sous /repo/).
export function connect() {
  const st = getState().strava;
  const redirectUri = location.origin + location.pathname;
  const params = new URLSearchParams({
    client_id: st.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all"
  });
  location.href = `${AUTH_URL}?${params}`;
}

export function disconnect() {
  const st = getState().strava;
  st.accessToken = null; st.refreshToken = null; st.expiresAt = 0;
  st.athleteName = null; st.lastSyncError = null;
  saveState();
}

async function tokenRequest(body) {
  const st = getState().strava;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(Object.assign({ client_id: st.clientId, client_secret: st.clientSecret }, body))
  });
  if (!res.ok) throw new Error(`Strava token ${res.status}`);
  return res.json();
}

function storeTokens(data) {
  const st = getState().strava;
  st.accessToken = data.access_token;
  st.refreshToken = data.refresh_token;
  st.expiresAt = data.expires_at || 0;
  if (data.athlete && data.athlete.firstname) st.athleteName = data.athlete.firstname;
  st.lastSyncError = null;
  saveState();
}

// Appele au boot si l'URL contient ?code= (retour d'autorisation Strava).
// Echange le code, nettoie l'URL, lance un premier sync complet. Retourne true si un code a ete traite.
export async function handleOAuthRedirect() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return false;
  // Nettoie l'URL immediatement : un reload ne doit pas reconsommer le code.
  history.replaceState(null, "", location.pathname + (location.hash || "#profile"));
  if (params.get("error")) return true; // acces refuse cote Strava
  try {
    const data = await tokenRequest({ code, grant_type: "authorization_code" });
    storeTokens(data);
    await sync({ full: true });
  } catch (e) {
    const st = getState().strava;
    st.lastSyncError = "Connexion Strava echouee (code invalide ou expire). Reessaie.";
    saveState();
  }
  return true;
}

// Renouvelle l'access token si expire (marge 5 min). Jette si reconnexion requise.
async function ensureToken() {
  const st = getState().strava;
  if (!st.refreshToken) throw new Error("Non connecte a Strava.");
  if (Date.now() / 1000 < st.expiresAt - 300) return st.accessToken;
  try {
    const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: st.refreshToken });
    storeTokens(data);
    return data.access_token;
  } catch (e) {
    st.lastSyncError = "Session Strava expiree : reconnecte-toi depuis le Profil.";
    saveState();
    throw e;
  }
}

// Mappe une activite Strava -> donnees run locales
function mapActivity(a) {
  return {
    date: a.start_date,
    source: "strava",
    stravaId: a.id,
    distanceKm: (a.distance || 0) / 1000,
    durationMin: Math.round((a.moving_time || 0) / 60),
    avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    elevation: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : null,
    kind: null
  };
}

/*
 sync({ full }) -> { added, skipped }
 full=true : fenetre 12 mois (2 pages max). Sinon : depuis lastSync - 7 jours.
*/
export async function sync({ full = false } = {}) {
  const s = getState();
  const st = s.strava;
  const token = await ensureToken();
  const after = full || !st.lastSyncAt
    ? Math.floor(Date.now() / 1000) - 365 * 86400
    : Math.floor(new Date(st.lastSyncAt).getTime() / 1000) - 7 * 86400;

  const activities = [];
  for (let page = 1; page <= (full ? 2 : 1); page++) {
    const res = await fetch(`${API}/athlete/activities?after=${after}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 429) throw new Error("Limite Strava atteinte, reessaie dans 15 min.");
    if (!res.ok) throw new Error(`Strava ${res.status}`);
    const batch = await res.json();
    activities.push(...batch);
    if (batch.length < 100) break;
  }

  const runs = activities
    .filter(a => a.type === "Run" || (a.sport_type || "").includes("Run"))
    .filter(a => (a.distance || 0) >= 500) // ignore les activites < 500 m
    .map(mapActivity);

  const result = insertRuns(runs);

  // recalage du plan si l'utilisateur decroche du volume prevu
  if (s.running.plan) {
    const adapted = adaptPlan(s.running.plan, getRuns(), s.running.raceDate);
    if (adapted) { s.running.plan = adapted; s.running.planGeneratedAt = adapted.generatedAt; }
  }

  st.lastSyncAt = new Date().toISOString();
  st.lastSyncError = null;
  saveState();
  return result;
}

// Sync silencieux au boot / retour online : jamais bloquant, jamais de popup d'erreur.
export function syncIfDue() {
  const st = getState().strava;
  if (!isConnected() || !navigator.onLine || !st.autoSync) return;
  const due = !st.lastSyncAt || (Date.now() - new Date(st.lastSyncAt).getTime() > 6 * 3600000);
  if (!due) return;
  sync({}).catch(() => { /* silencieux : lastSyncError deja pose si pertinent */ });
}
