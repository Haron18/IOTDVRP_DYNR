# Déploiement sur Streamlit Community Cloud — guide complet

Ce paquet contient l'intégralité du projet, prêt à être poussé sur un **nouveau
dépôt GitHub** puis déployé sur Streamlit Cloud.

## Contenu du projet

```
IOTDVRP_complet/
├── app.py                          ← application principale Streamlit
├── benchmark_loader.py             ← chargement des jeux de données
├── dvrp_engine.py                  ← solveur OR-Tools (CVRP multi-trajets)
├── event_handler.py                ← événements dynamiques (annulation, panne...)
├── mqtt_manager.py                 ← télémétrie MQTT (optionnelle)
├── simulate_iot_publisher.py       ← simulateur GPS externe (optionnel, hors app)
├── vehicle_tracker.py              ← interpolation de position sur trajet
├── requirements.txt                ← dépendances Python
├── .gitignore
├── .streamlit/config.toml          ← configuration Streamlit
├── README.md                       ← documentation du projet
└── dvrp_map_component/             ← composant carte en React (carte animée)
    ├── __init__.py                 ← wrapper Python (declare_component)
    └── frontend/
        ├── src/index.jsx           ← code source React (à éditer si besoin)
        ├── package.json
        └── build/                  ← bundle déjà compilé (à committer tel quel)
            ├── index.html
            ├── bundle.js
            └── bundle.css
```

Fonctionnalités incluses : optimisation OR-Tools multi-trajets automatique, horloge
de simulation unique démarrée à 0 (bouton "🚀 Démarrer la simulation"), tracking GPS
simulé, carte animée en React (mouvement fluide côté navigateur, indépendant du rythme
de rafraîchissement serveur), événements dynamiques (annulation manuelle restreinte
aux commandes non livrées, panne, embouteillage...), auto-refresh via `st.fragment`
(pas de rechargement complet de la page), état initial/données finales.

## Étape 1 — Créer le nouveau dépôt GitHub

1. Allez sur [github.com/new](https://github.com/new)
2. Nom du dépôt : ce que vous voulez (ex. `IOTDVRP`)
3. Laissez-le **vide** (ne cochez ni README, ni .gitignore, ni licence — on a déjà les nôtres)
4. Cliquez sur **Create repository**

## Étape 2 — Pousser le code (sans terminal, directement sur GitHub)

1. Dézippez l'archive sur votre ordinateur (double-clic ou clic droit "Extraire")
2. Sur la page de votre nouveau dépôt vide, cliquez sur **uploading an existing file**
   (ou **Add file → Upload files**)
3. Ouvrez le dossier `IOTDVRP_complet` dézippé, sélectionnez **tout son contenu**
   (pas le dossier lui-même — sinon vos fichiers finiront dans un sous-dossier),
   et glissez-le dans la zone de dépôt GitHub
4. Vérifiez dans la liste qui apparaît que ces fichiers sont bien présents :
   - `app.py`, `requirements.txt`
   - `dvrp_map_component/__init__.py`
   - `dvrp_map_component/frontend/build/bundle.js` et `bundle.css`
   - `.streamlit/config.toml` (dossier caché — activez l'affichage des fichiers
     cachés si besoin : `Cmd+Maj+.` sur Mac, "Éléments masqués" sous Windows)
5. Message de commit, puis **Commit changes**

*(Si vous préférez la ligne de commande : `git init && git add . && git commit -m "Version initiale" && git branch -M main && git remote add origin <url> && git push -u origin main`)*

## Étape 3 — Déployer sur Streamlit Cloud

1. Allez sur [share.streamlit.io](https://share.streamlit.io) et connectez-vous avec GitHub
2. Cliquez sur **New app** (ou **Create app**)
3. Sélectionnez votre dépôt, la branche `main`, et le fichier principal `app.py`
4. Cliquez sur **Deploy**
5. Premier démarrage : 1 à 3 minutes (installation de `ortools` notamment)

Vous obtenez une URL publique du type `https://<nom>.streamlit.app`, accessible en
continu, qui se redéploie automatiquement à chaque nouveau commit sur `main`.

## Étape 4 — Vérifier

- Ouvrez l'URL, cliquez sur **🚀 Démarrer la simulation**
- La carte (composant React) doit s'afficher avec le dépôt, les commandes et les camions
- Activez **▶️ Simulation temps réel** pour voir les camions se déplacer en fluide,
  même avec un intervalle de rafraîchissement serveur long (curseur 2–30 sec)
- En cas de souci : **Manage app** (en bas à droite sur Streamlit Cloud) → onglet **logs**

## Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| Carte vide / erreur "component not found" | `frontend/build/` n'est pas arrivé sur GitHub | Revérifiez l'upload, en particulier `bundle.js` (~500 Ko) |
| Erreur au démarrage sur `ortools` | Dépendance manquante | Vérifiez que `requirements.txt` est bien à la racine du repo |
| L'app ne se met pas à jour après un push | Cache Streamlit Cloud | **Manage app** → **Reboot app** |
| Aucune commande visible | Normal avant le clic sur "Démarrer" | C'est le comportement voulu — cliquez sur 🚀 |
| `.streamlit/config.toml` absent après upload | Dossier caché non affiché par l'explorateur de fichiers | Activez l'affichage des fichiers cachés et réuploadez-le |
