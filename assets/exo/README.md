# Visuels d'exercices (posture)

Dépose ici une image ou animation par exercice, nommée par l'`id` de l'exo
(voir `data/exercises.json`). Format conseillé : **webp** (image fixe ou animée), léger.

- Convention auto : `assets/exo/<id>.webp` (ex. `hollow-hold.webp`).
- Surcharge possible dans `exercises.json` via les champs `image` ou `anim` (chemin ou URL).

Local-first : aucun appel réseau. Si le fichier manque, le rendu masque
proprement l'emplacement (carte d'exercice ET chrono) — l'app reste fonctionnelle.

Le visuel s'affiche dans la carte d'exercice (aperçu de quête) et dans le
lecteur chrono pendant l'effort (masqué au repos).
