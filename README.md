# Collab Tasks

Storage: **MongoDB** (set `MONGODB_URI`).


Collaborative task tracker with:

1. **Members by email** — invite others to a task; both track completion  
2. **Hierarchy: Category → Task → Work**  
   - Category e.g. *Self Learning*  
   - Task e.g. *Develop App*  
   - Work e.g. *dev*, *deploy*  
3. **Email reminders** for incomplete work (enable/disable + frequency)  
4. **Login / Register**

## Quick start

```bash
# Install
cd collab-tasks
cd server && npm install && cd ..
cd client && npm install && cd ..

# Terminal 1 — API
cd server && node index.js
# → http://localhost:3001

# Terminal 2 — UI
cd client && npm run dev
# → http://localhost:5173
```

**Default account:** `admin@example.com` / `admin123` (username: `admin`)

## How to use

1. **Register** extra users (or invite by email — they register with that email to join).
2. **Categories** → add e.g. *Self Learning*.
3. **Tasks** → add *Develop App* under that category (you become a member automatically).
4. Open the task → **Invite** members by email → **Add Work** (*dev*, *deploy*…).
5. Each member marks their own work **Done**.
6. **Settings** → turn email reminders on/off and set how often (1h … weekly).

## Email (optional)

Without SMTP, invites/reminders are **logged in the server console**.

```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=you@gmail.com
export SMTP_PASS=app-password
export SMTP_FROM="Collab Tasks <you@gmail.com>"
export APP_URL=http://localhost:5173
cd server && node index.js
```

Reminder job runs every 15 minutes and respects each user’s frequency setting.

## Connecting frontend ↔ backend (hosting)

### Same server (easiest)

```bash
cd client && npm run build
cd ../server && node index.js
# API + UI both at http://YOUR_HOST:3001
```

Keep `VITE_API_URL` empty — client uses relative `/api`.

### Separate hosts (Vercel UI + Railway/Render API)

**Backend env** (`server/.env` or host dashboard):

```env
PORT=3001
JWT_SECRET=long-random-secret
FRONTEND_URL=https://your-frontend.vercel.app
APP_URL=https://your-frontend.vercel.app
```

**Frontend env** (must be set **before** `npm run build`):

```env
VITE_API_URL=https://your-api.railway.app/api
```

Copy from examples:

- `client/.env.example` → `client/.env`
- `server/.env.example` → `server/.env`

Then rebuild the client so the API URL is baked in:

```bash
cd client && npm run build
```

### Local dev

No change needed: Vite proxies `/api` → `http://localhost:3001` (see `client/vite.config.js`).

## API overview

| Area | Endpoints |
|------|-----------|
| Auth | `POST /api/register`, `POST /api/login`, `GET /api/me` |
| Notifications | `PUT /api/me/notifications` |
| Categories | `GET/POST /api/categories`, `DELETE /api/categories/:id` |
| Tasks | `GET/POST /api/tasks`, `GET/DELETE /api/tasks/:id` |
| Members | `POST /api/tasks/:id/members`, `DELETE .../members/:id` |
| Work | `POST /api/tasks/:id/works`, `DELETE /api/works/:id` |
| Completion | `PUT /api/works/:id/completion` |
| Export | `GET /api/export/excel` |
| Reminders | `POST /api/reminders/run` (manual test) |
