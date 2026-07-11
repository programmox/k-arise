# K-Arise

Coach muscu adaptatif, esthetique Solo Leveling. PWA local-first, sans build, sans cloud.
Toutes tes donnees restent sur ton appareil. Le dossier entier est transferable (Mac vers Pixel).

## Lancer l'app (Windows, macOS ou Linux)

L'app utilise des modules JS et un service worker : il faut la servir en HTTP (pas en double-clic sur index.html). Le dossier est portable et fonctionne partout du moment que Python est installe.

Le plus simple, double-clic sur le lanceur :
- Windows : `start-windows.bat`
- macOS : `start-mac.command` (au premier lancement : clic droit > Ouvrir, pour passer la securite Gatekeeper)
- Linux : `./start-mac.command`

Le serveur demarre et ouvre le navigateur tout seul sur http://localhost:4173. Pour arreter : Ctrl + C dans la fenetre.

En ligne de commande (equivalent) :

```bash
# depuis le dossier K-Arise
python3 devserver.py     # macOS / Linux
python devserver.py      # Windows (ou py devserver.py)
```

Prerequis : Python 3 (preinstalle sur macOS/Linux ; sur Windows, https://www.python.org/downloads/ en cochant "Add Python to PATH").

## Installer comme appli (PWA)

- Sur Chrome desktop : icone d'installation dans la barre d'adresse.
- Sur le Pixel 7 plus tard : ouvre l'URL dans Chrome, menu > "Ajouter a l'ecran d'accueil".

## Structure

```
K-Arise/
  index.html              shell de l'app
  devserver.py            serveur de dev no-cache (Windows/macOS/Linux)
  start-windows.bat       lanceur double-clic Windows
  start-mac.command       lanceur double-clic macOS/Linux
  manifest.webmanifest    config PWA
  service-worker.js        cache hors-ligne
  css/style.css           theme neon
  data/exercises.json     base d'exercices (metadonnees + consignes securite + lien video)
  js/
    app.js                routeur + navigation
    store.js              etat + persistance + export/import
    engine.js             generation de seance (filtrage materiel, selection par efficacite)
    timer.js              chronometre (compte a rebours, intervalle, tempo) + bips/vibration
    screens.js            rendu des ecrans
  icons/icon.svg          icone de l'app
```

## Transferer sur un autre appareil

1. Ouvre Profil > Exporter : telecharge `k-arise-save.json` (ton profil + historique).
2. Copie le dossier `K-Arise` sur l'autre machine.
3. Lance l'app, va dans Profil > Importer, choisis `k-arise-save.json`.

## Etat actuel (Phase 1)

Fait :
- Onboarding (profil, objectifs, materiel, benchmarks de perfs : pompes, tractions, gainage, squat, kb swing, dead hang)
- Le Systeme calibre la difficulte et le volume des seances selon les benchmarks
- Inventaire materiel + capture photo locale (reconnaissance IA a venir)
- Seance express : choix zone + temps, generation, consignes + lien video, chrono 3 modes
- Bilan de quete : saisie des perfs reelles (reps, charge kettlebell, ressenti/RPE) en fin de seance
- Surcharge progressive automatique : la difficulte de la prochaine seance s'ajuste selon tes perfs et ton ressenti (Facile -> +reps/+temps, charge mineure -> passe au cran de KB superieur). Records (PR) detectes et recompenses en XP. Les valeurs progressees sont reutilisees a la generation suivante.
- Ecran statut facon Solo Leveling : rang, niveau, XP, stats, energie, retards musculaires
- Mission du jour : suggestion ciblee selon retards + recuperation (passerelle avant le programme long terme)
- Ecran Suivi : calendrier mensuel des seances + recuperation par groupe musculaire
- Modele de recuperation : conseille (feu vert / partiel / contre-productif) avant chaque quete pour optimiser les gains
- Onglet Repas (nutrition) : besoins de recup post-effort + objectifs journaliers (kcal, proteines, glucides, lipides, hydratation) calcules selon profil + seance + objectif (prise de muscle), bases sur le consensus ISSN. Recette chiffree proposee, filtrable selon l'inventaire cuisine, avec substitutions ("Thon -> Poulet") et alternatives realisables.
- Rang E->S base sur la PERFORMANCE REELLE : tes perfs (tractions, pompes, gainage, squat) comparees a des standards de force reconnus. Distinct du Niveau (XP = investissement). Monter de rang signifie une vraie progression mesuree.
- Evenements "System" plein ecran (facon Solo Leveling) : niveau, rang superieur, nouveau titre, palier de serie. Titres meritables (Dos d'Acier, Noyau de Fer, etc.) affiches sur le Statut.
- Seance libre : logger une seance faite hors generateur (choix des exos + perfs), comptee dans la progression.
- Courbe de progression par exercice (graphe dans Suivi) + serie (streak) de jours.
- Barre superieure avec titre d'ecran et bouton retour ; recettes avec lien video (YouTube) et photos (recherche images).
- Pause / reprise d'une seance : mets une quete en pause et reprends-la plus tard (bandeau "Reprendre" sur le Statut). Dernieres quetes cliquables pour revoir le detail.
- Onboarding en 4 etapes (wizard) avec barre de progression. Reglages (sons du chrono, vibrations) dans le Profil. Bouton "Refaire cette seance" depuis le detail d'une quete. Etats de chargement (generation de quete).
- Suivi des seances + montee de niveau + detection des retards (modele "dette de volume")
- Correction/suppression d'une quete passee (recalcul deterministe de stats, rang, progression)
- Export / import / reset des donnees

Dev : le serveur `devserver.py` sert en no-cache (le code se recharge a jour a chaque refresh). Lancer avec `python3 projets/K-Arise/devserver.py` ou via la config preview "karise".

A venir :
- Phase 2 : programme long terme 4-8 semaines, adaptation par IA (cle Anthropic), bilan hebdo
- Phase 3 : analyse photo physique, reconnaissance materiel par IA, comptes amis (cloud)

## Note importante

K-Arise n'est pas un avis medical. En cas de douleur, arrete et consulte un professionnel.
Les consignes de securite de chaque exercice visent a reduire le risque, pas a le supprimer.
