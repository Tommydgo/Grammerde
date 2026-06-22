# Grammerde

Application web de correction de texte gamifiée. Des articles Wikipedia ou Le Monde, des fautes injectées par GPT-4o, et un chrono. Trouve-les toutes.

## Fonctionnalités

- **Solo** : article aléatoire, difficultés et types de fautes configurables
- **Mode VS** : affrontement en temps réel via WebSocket, 120 secondes
- **Leaderboard** : top 10 par score moyen (semaine / mois / tout temps)
- **Profil** : graphique d'évolution, statistiques, historique paginé
- **Auth** : inscription / connexion JWT, jeu anonyme possible

## Stack

| Couche | Techno |
|--------|--------|
| Backend | Node.js 18+ / Express 4 |
| Base de données | SQLite via better-sqlite3 |
| IA | OpenAI GPT-4o |
| Temps réel | WebSocket (ws) |
| Scraping | node-fetch + cheerio |
| Frontend | HTML / CSS / JS vanilla |

## Installation

### Prérequis

- Node.js 18+ (testé sur 24)
- Une clé API OpenAI

### Étapes

```bash
# 1. Cloner le projet
git clone <repo>
cd grammerde

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditer .env et renseigner OPENAI_API_KEY

# 4. Lancer le serveur
npm start
# ou en mode dev (rechargement auto)
npm run dev
```

Le serveur tourne sur [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

Créez un fichier `.env` à la racine :

```env
OPENAI_API_KEY=sk-...
JWT_SECRET=changez-moi-en-production
PORT=3000
```

## Architecture

```
grammerde/
├── backend/
│   ├── server.js       # Express + WebSocket + routes
│   ├── db.js           # Initialisation SQLite
│   ├── auth.js         # bcrypt + JWT
│   ├── scraper.js      # Wikipedia / Le Monde
│   └── ai.js           # Injection de fautes GPT-4o
├── frontend/
│   ├── index.html      # Landing page + configurateur
│   ├── game.html       # Jeu solo
│   ├── vs.html         # Mode VS
│   ├── profile.html    # Profil joueur
│   ├── css/style.css
│   └── js/
│       ├── app.js
│       ├── game.js
│       ├── vs.js
│       ├── profile.js
│       └── auth.js
└── package.json
```

## API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/auth/register` | — | Créer un compte |
| POST | `/api/auth/login` | — | Se connecter |
| GET | `/api/auth/me` | JWT | Profil courant |
| POST | `/api/game/start` | optionnel | Démarrer une partie |
| POST | `/api/game/submit` | optionnel | Soumettre corrections |
| GET | `/api/game/history` | JWT | Historique |
| GET | `/api/leaderboard` | — | Top 10 (filtre `?period=week\|month\|all`) |
| POST | `/api/vs/create` | JWT | Créer une room VS |
| POST | `/api/vs/join` | JWT | Rejoindre une room |
| GET | `/api/vs/room/:code` | — | État d'une room |

## WebSocket

Connexion : `ws://localhost:3000`

Messages client → serveur :
```json
{ "type": "join_room", "room_code": "ABC123", "user_id": 1, "username": "Alice" }
{ "type": "correction", "room_code": "ABC123", "user_id": 1, "corrections_count": 5 }
```

Messages serveur → client :
```json
{ "type": "game_start", "corrupted_text": "...", "total_errors": 12, "duration": 120 }
{ "type": "tick", "remaining": 89 }
{ "type": "score_update", "scores": { "1": 3, "2": 5 } }
{ "type": "game_over", "scores": {...}, "winner_id": 2 }
```
