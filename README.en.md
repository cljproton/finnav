| |
|:---:|
| ![finnav logo](docs/screenshots/icon.png) |

# finnav





A finance / Web3 website navigation app. One frontend codebase ships to Web / Android / iOS, with a Django admin backend for freely managing categories and sites.

- The UI supports **Chinese/English switching**: tap the floating "中 / EN" pill in the top-right corner of the frontend to switch instantly; backend API errors and validation messages follow the client language (Chinese by default).
- **中文版**：见 [README.md](README.md)。

## Screenshots

![Index](docs/screenshots/index.png)
![Search](docs/screenshots/search.png)
![Favorite](docs/screenshots/favorite.png)
![Me](docs/screenshots/me.png)

## Features

- Home: category filter + site cards (logo / name / description / tags); tap into site detail; pull-to-refresh
- Site detail: text tutorials, video tutorials, application (e.g. Xianyu) links (multiple of each), APP download (with version), visit the official site
- One-tap share: share site name/description/link from the detail page (native share sheet / Web `navigator.share`)
- Star rating: email-registered users can rate sites (0-5 stars, half-star steps), optional comment; each site shows average rating and rating count, one vote per user
- Visit stats: opening a site detail page counts one visit
- Search: real-time search by name / description / tag
- Favorites: persisted locally (AsyncStorage); auto-sync with the server once logged in for cross-device consistency
- Account: email-code registration (Resend; without a key the code is printed to the backend log), login, forgot password; sign out from the "My" page; search history and favorites stay in sync across devices
- UI: Ant Design theme, indigo finance palette, dark/light mode follows the system; bottom tabs, search, cards, modals all use AntD components (sub-path imports)
- Admin: Simpleui theme. Overview page aggregates per-site visits and ranks TOP10 by visits + average rating + rating count; freely manage categories and sites, upload logos and APP packages, maintain tutorials/videos/application links

## Project structure

```
finnav/
├── backend/     # Django + DRF backend (API + admin)
├── frontend/    # Expo (React Native) cross-platform frontend
├── scripts/     # start/stop/status scripts for dev servers
├── docs/
│   ├── api.md   # frontend/backend API contract
│   └── screenshots/  # screenshot
├── docker/      # Docker‑Compose deployment (single‑port entry, includes backend, frontend, Nginx reverse‑proxy)
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
- Frontend API base defaults to `http://localhost:8000`, overridable with `EXPO_PUBLIC_API_BASE_URL`
- Sub-scripts can be invoked directly: `./scripts/start_backend.sh`, `./scripts/stop_backend.sh`, `./scripts/start_frontend.sh`, `./scripts/stop_frontend.sh`, `./scripts/status.sh`

## Tech stack

- Frontend: Expo SDK 57 (React Native 0.86) + expo-router + TanStack Query + AsyncStorage + @ant-design/react-native (Ant Design theme) + i18next / react-i18next / expo-localization
  - Note: always import AntD components via sub-paths (e.g. `@ant-design/react-native/es/button`), never `from "@ant-design/react-native"` — the barrel entry cannot be bundled under RNGH v3 (it depends on the removed `DrawerLayout`)
- Backend: Django 5.2 LTS (with `gettext` i18n) + Django REST Framework + djangorestframework-simplejwt + django-simpleui + django-cors-headers + Pillow

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
npm run android    # Android (Expo Go or emulator)
npm run ios        # iOS (Expo Go or emulator)
```

- API base: `http://localhost:8000` for web/iOS, `http://10.0.2.2:8000` for the Android emulator; override with `EXPO_PUBLIC_API_BASE_URL` (e.g. a LAN IP for real-device debugging)
- Real-device debugging: backend on `runserver 0.0.0.0:8000`, frontend `EXPO_PUBLIC_API_BASE_URL=http://<LAN_IP>:8000`
- Run: `./scripts/start_frontend.sh` (or `npm run web`)
- Checks: `npx tsc --noEmit`, `npx expo export --platform web`
- Note: `react` and `react-dom` must stay on the exact same version (currently 19.2.3, aligned with Expo SDK 57); adjust via `npx expo install react react-dom`, not by editing `package.json` directly

## One‑Click Deployment Script (Linux)

FinNav ships a ready‑to‑run Bash script (`deploy_finnav.sh`) that can set up the project on most mainstream Linux distributions (Ubuntu/Debian, CentOS/RHEL, Fedora, Arch). It handles:

- Installing system packages (git, curl, build tools, Python, Node.js 20 LTS)
- Creating a dedicated service user and fixing file permissions
- Cloning the repository, creating a Python virtualenv, and installing backend requirements
- Running Django migrations, collecting static files and **optionally** seeding demo data (`seed_demo`)
- Starting the service with systemd (Gunicorn) for easy management
- Optional Nginx + Let’s Encrypt HTTPS setup (automatic certificate retrieval)
- Opening the required firewall ports automatically

### Usage

```bash
# Make the script executable if needed
chmod +x deploy_finnav.sh
# Run as root – the script will interactively ask for options (demo data imported by default)
sudo ./deploy_finnav.sh
```

### Common flags (can be supplied interactively)

| Flag | Meaning |
|------|---------|
| `--https` | Enable HTTPS and configure Nginx + Certbot |
| `--cert-email <email>` | Email address for Certbot |
| `--db-type <sqlite|postgres|mysql>` | Choose database backend |
| `--db-host <host>` | Database host (required for non‑SQLite) |
| `--db-port <port>` | Database port |
| `--db-name <name>` | Database name |
| `--db-user <user>` | Database user |
| `--db-pass <pwd>` | Database password |
| `--run-user <user>` | System user that will run the service (default `finnav`) |
| `--install-dir <path>` | Installation directory (default `/opt/finnav`) |
| `--workers <n>` | Manually set Gunicorn workers (default auto‑detect `$(nproc)`) |
| `--no-demo` | Skip the `seed_demo` import |

> **Note**: Each prompt shows a default value; press *Enter* to accept it.

## Docker Deployment

The project includes a Docker‑Compose based one‑click deployment for production or quick demo environments. Follow the steps below:

1. **Prerequisites**  
   - Docker Engine (>= 20.10) and Docker Compose v2 must be installed.  
   - To customize ports or environment variables, edit `docker/.env.example` and copy it to `docker/.env`.

2. **Start**  
   ```bash
   cd docker
   cp .env.example .env   # first time, adjust secret keys, ports, etc.
   docker compose up -d --build
   ```

3. **Access endpoints** (default port **80**, can be overridden by `PORT` in `.env`)  

   | Service | URL |
   |---------|-----|
   | Frontend Web | http://localhost/ |
   | Admin panel | http://localhost/admin/ |
   | API | http://localhost/api/ |

4. **Common management commands**  

   ```bash
   # Show container status
   docker compose ps
   # Follow logs
   docker compose logs -f backend   # backend logs (verification codes, etc.)
   docker compose logs -f frontend  # frontend logs
   # Stop containers but keep data volume
   docker compose down
   # Stop and delete data volume (full clean)
   docker compose down -v
   ```

5. **Data persistence**  
   - SQLite file and media are stored under `docker/data/`. This directory is mounted as a volume, so data survives container restarts.  
   - To use MySQL/PostgreSQL, set `DB_ENGINE=mysql` or `postgres` in `.env` and provide `DB_*` variables. The compose file does **not** spin up a database container; you must point to an external DB instance.

6. **Backup / Restore** (via backend admin UI or CLI)  

   ```bash
   # Create a zip backup
   docker compose exec backend python manage.py backup -o backup.zip
   # Restore from a backup (will overwrite current data)
   docker compose exec backend python manage.py restore backup.zip
   ```

> **Note**: For production HTTPS, terminate TLS at an external reverse‑proxy (Nginx/Traefik) and forward traffic to the Docker‑exposed port.

## Disclaimer

This project is purely a personal development/research effort and may contain bugs or incomplete features. Please use it in compliance with applicable laws and regulations. Any legal disputes or damages arising from the use of this code are the sole responsibility of the user.

## Donation

If you find this project useful, you can support its maintenance by donating:
- USDT (ERC20) address: `0xAdf7CBcF1afC6a0692aEb6a0deE13110cc65C0EF`
- USDC (ERC20) address: `0xAdf7CBcF1afC6a0692aEb6a0deE13110cc65C0EF`

Thank you for your support! If you cannot donate, feel free to contribute via Issues or Pull Requests.



This project is released under the **MIT License**. See the `LICENSE` file at the repository root for details.


