| |
|:---:|
| ![finnav logo](docs/screenshots/icon.png) |

# finnav


A finance / Web3 website navigation app: frontend built with Next.js as a static site, with its own Django admin. Beyond a plain navigation site, it embeds a **user-contribution + points-incentive + paid-experience** ecosystem — users submit sites, share tutorials, and upload APP links; once approved by an admin they are auto-published and earn points, which can be spent in-app to unlock experiences, gift to friends, or turn into redeemable vouchers.

- The UI supports **Chinese/English switching**: tap the floating "中 / EN" pill in the top-right corner of the frontend to switch instantly; backend API errors and validation messages follow the client language (Chinese by default).
- **中文版**：见 [README.md](README.md)。

## Highlights

- **Frontend Stack**: Next.js optimized production static site; Ant Design indigo finance theme, dark/light mode follows the system
- **Points incentive loop**: earn points via registration, inviting friends, and having submitted sites / tutorials / APP links approved; spend points on paid experiences, gifting to friends, or redeemable vouchers — rules, values and daily/global caps are all admin-configurable
- **UGC + review workflow**: user-submitted sites, tutorials and APP links go through a single admin review; approval auto-publishes them and awards points, all handled in the admin review center
- **Paid experience marketplace**: users publish point-priced experience posts (5–500 pts), one purchase unlocks permanently, with likes and images; the author receives the full amount in points in real time
- **Solid account security**: graphical captcha, email-code registration (resend cooldown, hashed codes only), password reset, plus TOTP 2FA for both end users and the admin backend

## Screenshots

![Index](docs/screenshots/index.png)
![Search](docs/screenshots/search.png)
![Favorite](docs/screenshots/favorite.png)
![Me](docs/screenshots/me.png)

## Features

### Browsing

- Home: category filter + site cards (logo / name / description / tags); tap into site detail; pull-to-refresh; the announcement bar at the top is configurable from the admin
- Search: real-time search by name / description / tag; search history syncs with your account
- Favorites: persisted locally (AsyncStorage); auto-sync with the server once logged in for cross-device consistency

### Site detail

- Tutorials: text / video / helper-agent (e.g. Xianyu) types, shared by users and shown after admin approval; a top-10 hot list is available
- Star rating: logged-in users rate sites (0–5 stars, half-star steps), optional comment; each site shows average rating and rating count, one vote per user; a separate page lists all reviews
- Visit stats: opening a site detail page counts one visit, timestamped for admin trend charts
- One-tap share: share the site name / description / link (native share sheet / Web `navigator.share`); the shared site-link format is controlled by the "share base URL" admin setting — when set it becomes `<base>/site/<site-id>` (so users without the app can open the web version), otherwise it stays the `finnav:///site/xx` deep link
- My invite code: configure a personal invite code / invite link per site, automatically appended when sharing

### Account & security

- Register / login / password reset: email verification codes (Resend; without a key the code is printed to the backend log), with a 60 s resend cooldown; codes are stored hashed, valid for 10 minutes, max 5 attempts
- Graphical captcha: register / login endpoints include a dynamically rendered, single-use captcha
- 2FA: TOTP setup page + second-step login verification for end users; admin 2FA can be enabled independently (global switch + per-admin opt-in)
- "Me" page: sign out, view points, invite friends, manage search history and favorites

### User contributions (UGC)

- Submit sites: users submit new sites; admin approval auto-creates the site and awards points (default +20)
- Share tutorials: paste a link to share — the title is fetched automatically; after approval it goes public and awards points (default +10); authors can request deletion, reviewed by the admin
- Experiences: users publish point-priced paid posts; one purchase unlocks forever; up to 5 images, likes and sales stats; the author receives the equivalent points in real time

### Points system

- Earn: registration bonus (+20), invite friends (inviter +30 / referee +10), approved site / tutorial / APP-link submissions (+20 / +10 / +10)
- Spend: unlock experiences, gift points (by email, no fee), generate vouchers (deducted from the creator's balance; anyone else can redeem them)
- Management: rules, values and daily/global issuance caps are admin-configurable; the transaction ledger is immutable (with balance snapshots) — approval rewards, gifts and vouchers are all auditable

### Admin (Simpleui theme)

- Data dashboard: per-site visit stats with a TOP10 ranking by visits + average rating + rating count; visit-trend chart and download-overview pages
- Review center: unified review of site submissions, tutorial shares and APP-link submissions
- Backup / restore: one-click zip backup from the UI; `backup` / `restore` management commands
- Sites & categories: freely manage, upload logos and APP packages; logos accept PNG / JPG / WebP / SVG, with SVG auto-converted to PNG (cairosvg, falling back to the original file on failure)
- Global settings: site title / subtitle / icon, SEO, announcement bar, footer copyright, `<head>` injection scripts, items-per-page, email-verification toggle, 2FA toggle, share base URL (share-link prefix)
- Upgrade-notes page: records version changes and upgrade caveats

### UI & internationalization

- Ant Design theme with an indigo finance palette; dark/light mode follows the system; bottom tabs, search, cards, modals are all AntD components (sub-path imports)
- One-tap Chinese/English switching; backend API errors and validation messages follow the client language (Chinese by default)

## Project structure

```
finnav/
├── backend/     # Django + DRF backend (API + admin)
├── frontend/    # Next.js frontend
├── scripts/     # dev server scripts (start/stop)
├── .github/
│   └── workflows/  # CI/CD workflows (image build & push to GHCR)
├── docs/
│   ├── api.md   # frontend/backend API contract
│   └── screenshots/  # screenshot
├── docker/      # Docker‑Compose deployment (single‑port entry, backend + frontend dual containers, optional Nginx HTTPS)
└── deploy_finnav.sh  # One-click deployment script (Docker Compose + GHCR images)
```

## Dev server management (scripts/)

Start / stop / restart / check the dev servers with one command:

```bash
./scripts/dev.sh start           # start backend(8000) + frontend(8081)
./scripts/dev.sh start backend   # backend only
./scripts/dev.sh start frontend  # frontend only
./scripts/dev.sh status          # show running status
./scripts/dev.sh restart         # restart everything
./scripts/dev.sh stop            # stop everything
./scripts/dev.sh stop backend    # stop backend only
```

- All run in the background; logs go to `logs/`, PIDs to `.run/`
- Ports are overridable via `BACKEND_PORT` / `FRONTEND_PORT`
- Frontend API base: Web production build uses relative path `/api` (proxied to backend via nginx)
- Sub-scripts can be invoked directly: `./scripts/start_backend.sh`, `./scripts/stop_backend.sh`, `./scripts/start_frontend.sh`, `./scripts/stop_frontend.sh`, `./scripts/status.sh`

## Tech stack

- Frontend: Next.js + React 19 + Ant Design + TanStack Query + i18next / react-i18next
  - Note: always import AntD components via sub-paths (e.g. `@ant-design/react-native/es/button`), never `from "@ant-design/react-native"` — the barrel entry cannot be bundled under RNGH v3 (it depends on the removed `DrawerLayout`)
- Backend: Django 5.2 LTS (with `gettext` i18n) + Django REST Framework + djangorestframework-simplejwt + django-simpleui + django-cors-headers + Pillow + cairosvg (SVG logo → PNG)

## Backend (backend/)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo      # optional: demo categories and sites
.venv/bin/python manage.py createsuperuser  # admin account
.venv/bin/python manage.py runserver 0.0.0.0:8000
```

- API contract: `docs/api.md`; API root `/api/`, health check `GET /api/health/`
- Admin: http://localhost:8000/admin/ (add/edit categories and sites, upload logos)
- Config: copy `.env.example` to `.env` to override `DEBUG` / `SECRET_KEY` / `ALLOWED_HOSTS` and DB options; real env vars take precedence over `.env`
- Database: SQLite by default (zero config). Switch with `DB_ENGINE=mysql|postgres` — see the `DB_*` docs in `backend/.env.example`
- Tests: `.venv/bin/python manage.py test`
- Run: `./scripts/start_backend.sh` (or `.venv/bin/python manage.py runserver 0.0.0.0:8000`)
- **i18n**: backend API messages follow the `Accept-Language` header (zh→Chinese, en→English, others→English); Chinese by default. Wrap validation messages with `_()` / `gettext_lazy()`, translations live in `backend/apps/navigation/locale/`; after editing a `.po`, run `.venv/bin/python manage.py compilemessages`. Docker deployments auto-compile via `docker/backend/entrypoint.sh`.

## Frontend (frontend/)

```bash
cd frontend
npm install
npm run web        # Web (browser)
```

- Run: `./scripts/start_frontend.sh` (or `npm run web`)
- Checks: `npx tsc --noEmit`, `npm run build`

## One‑Click Deployment Script (Linux)

FinNav ships a ready‑to‑run Bash script (`deploy_finnav.sh`) that can set up the project on most mainstream Linux distributions (Ubuntu/Debian, CentOS/RHEL, Fedora, Arch). It handles:

- Installing Docker Engine + Docker Compose v2
- Optional Nginx + Certbot installation (automatic HTTPS certificates)
- Interactive generation of `docker/.env` (secrets, domain, database, image registry, etc.)
- Pulling pre-built images from GHCR (`finnav-backend`, `finnav-frontend`)
- Starting dual-container services via Docker Compose
- Automatic Nginx reverse proxy + HTTPS configuration (if enabled)

### Usage

```bash
# Make the script executable if needed
chmod +x deploy_finnav.sh
# Run as root – the script will interactively ask for options
sudo ./deploy_finnav.sh
```

### Interactive configuration items

| Item | Description |
|------|-------------|
| HTTPS / Domain | Enable HTTPS, domain name, Certbot email |
| SEO Info | Site title, description (baked into frontend image at build time, runtime fallback) |
| Database | SQLite (local file) / PostgreSQL / MySQL (external instance) |
| Public Port | Default 80 |
| GHCR Owner | Image registry organization/username (default `cljproton`) |
| Email (Resend) | Resend API Key (optional; blank = codes printed to backend logs) |
| Install Directory | Default `/opt/finnav` |
| Firewall | Auto-open ports 80/443 |

> **Note**: Each prompt shows a default value; press *Enter* to accept it.

## Docker Deployment (Manual Mode)

The project includes a Docker‑Compose based deployment for production or quick demo environments. Follow the steps below:

### 1. Prerequisites
- Docker Engine (>= 20.10) and Docker Compose v2 must be installed.
- To customize ports or environment variables, edit `docker/.env.example` and copy it to `docker/.env`.

### 2. Start (Local Build Mode)
```bash
cd docker
cp .env.example .env   # first time, adjust secret keys, ports, etc.
docker compose up -d --build
```

### 3. Start (Production Pull Mode, Recommended)
```bash
cd docker
cp .env.example .env   # configure BACKEND_IMAGE / FRONTEND_IMAGE pointing to GHCR
docker compose pull
docker compose up -d
```

> **Production Recommendation**: Use `deploy_finnav.sh` to automate the above flow, or combine with GitHub Actions to push images to GHCR, then the server only runs `docker compose pull && docker compose up -d`.

### 4. Access Endpoints (Default port **80**, overridable via `PORT` in `.env`)

| Service | URL |
|---------|-----|
| Frontend Web | http://localhost/ |
| Admin panel | http://localhost/admin/ |
| API | http://localhost/api/ |

### 5. Common Management Commands

```bash
# Show container status
docker compose ps
# Follow logs
docker compose logs -f backend   # backend logs (verification codes, etc.)
docker compose logs -f frontend  # frontend logs
# Update images and restart
docker compose pull && docker compose up -d
# Stop containers but keep data volume
docker compose down
# Stop and delete data volume (full clean, ⚠️ data loss)
docker compose down -v
```

### 6. Data Persistence
- SQLite file and media are stored under `docker/data/`. This directory is mounted as a volume, so data survives container restarts.
- To use MySQL/PostgreSQL, set `DB_ENGINE=mysql` or `postgres` in `.env` and provide `DB_*` variables. The compose file does **not** spin up a database container; you must point to an external DB instance.

### 7. Backup / Restore (via backend admin UI or CLI)

```bash
# Create a zip backup
docker compose exec backend python manage.py backup -o backup.zip
# Restore from a backup (will overwrite current data)
docker compose exec backend python manage.py restore backup.zip
```

### 8. GitHub Actions Image Build

The project includes two independent manual-trigger workflows (`.github/workflows/`):

| Workflow | Trigger | Artifacts |
|----------|---------|-----------|
| `build-backend-image.yml` | `workflow_dispatch` | `ghcr.io/<owner>/finnav-backend:latest` + `:sha` |
| `build-frontend-image.yml` | `workflow_dispatch` (with SEO params) | `ghcr.io/<owner>/finnav-frontend:latest` + `:sha` |

**Usage**:
1. Go to GitHub repo → Actions → Select workflow → `Run workflow`
2. Frontend build accepts `seo_origin`, `seo_title`, `seo_description` (passed as build args baked into the image)
3. Once built, images are pushed to GHCR; server runs `docker compose pull && docker compose up -d` to update

> Image tags include `:latest` and `:<short-sha>` for rollback and traceability.

---

## Disclaimer

This project is purely a personal development/research effort and may contain bugs or incomplete features. Please use it in compliance with applicable laws and regulations. Any legal disputes or damages arising from the use of this code are the sole responsibility of the user.

## Donation

If you find this project useful, you can support its maintenance by donating:
- USDT (ERC20) address: `0xAdf7CBcF1afC6a0692aEb6a0deE13110cc65C0EF`
- USDC (ERC20) address: `0xAdf7CBcF1afC6a0692aEb6a0deE13110cc65C0EF`

Thank you for your support! If you cannot donate, feel free to contribute via Issues or Pull Requests.


This project is released under the **MIT License**. See the `LICENSE` file at the repository root for details.