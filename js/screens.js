// K-Arise - barrel : surface publique des ecrans (re-export depuis les modules par ecran)
// Le rendu est decoupe par ecran dans js/screen-*.js ; ce fichier preserve l'API importee par app.js.
export { setHeader, hideHeader, toast, showSystemEvents } from "./ui.js";
export { renderStatus } from "./screen-status.js";
export { renderOnboarding } from "./screen-onboarding.js";
export { renderEquipment } from "./screen-equipment.js";
export { renderExpress, renderSessionPlayer, renderBilan, renderFinish, pauseActiveTimer } from "./screen-session.js";
export { renderLibre } from "./screen-libre.js";
export { renderSuivi, renderSessionEdit } from "./screen-suivi.js";
export { renderNutrition } from "./screen-nutrition.js";
export { renderProfile } from "./screen-profile.js";
export { renderCourse } from "./screen-course.js";
