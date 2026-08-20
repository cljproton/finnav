| |
|:---:|
| ![finnav logo](docs/screenshots/icon.png) |

# finnav





A finance / Web3 website navigation app: one frontend codebase ships to **Web / Android / iOS**, with its own Django admin. Beyond a plain navigation site, it embeds a **user-contribution + points-incentive + paid-experience** ecosystem — users submit sites, share tutorials, and upload APP links; once approved by an admin they are auto-published and earn points, which can be spent in-app to unlock experiences, gift to friends, or turn into redeemable vouchers.

- The UI supports **Chinese/English switching**: tap the floating "中 / EN" pill in the top-right corner of the frontend to switch instantly; backend API errors and validation messages follow the client language (Chinese by default).
- **中文版**：见 [README.md](README.md)。

## Highlights

- **One codebase, three platforms**: Expo (React Native) builds Web / Android / iOS from a single codebase; Ant Design indigo finance theme, dark/light mode follows the system
- **Points incentive loop**: earn points via registration, inviting friends, and having submitted sites / tutorials / APP links approved; spend points on paid experiences, gifting to friends, or redeemable vouchers — rules, values and daily/global caps are all admin-configurable
- **UGC + review workflow**: user-submitted sites, tutorials and APP links go through a single admin review; approval auto-publishes them and awards points, all handled in the admin review center
- **Paid experience marketplace**: users publish point-priced experience posts (5–500 pts), one purchase unlocks permanently, with likes and images; the author receives the full amount in points in real time
- **Solid account security**: graphical captcha, email-code registration (resend cooldown, hashed codes only), password reset, plus TOTP 2FA for both end users and the admin backend
- **APP distribution & verification**: Android APKs can be cached and distributed from this site with SHA-256 integrity checks; a failed check automatically suspends on-site downloads
- **One-click deployment & multi-platform packaging**: Docker Compose (combined or split), a Linux one-click script; GitHub Actions or EAS to build Android APK / iOS IPA

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
- APP download: Android / Google Play / iOS entry points; Android APKs can be cached and distributed from this site (size, cache time, SHA-256), with automatic integrity verification — a failed check suspends on-site downloads and prompts using the official link
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
- Submit APP links: Android / Google Play / iOS links are all accepted; approval auto-fills the site fields, and Android links trigger a background APK pull to cache locally
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
├── frontend/    # Expo (React Native) cross-platform frontend
├── scripts/     # dev-server & mobile packaging scripts (start/stop/build_android/build_ios)
├── .github/
│   └── workflows/  # Android APK / iOS IPA packaging workflows
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

- Frontend: Expo SDK 55 (React Native 0.83) + expo-router + TanStack Query + AsyncStorage + @ant-design/react-native (Ant Design theme) + i18next / react-i18next / expo-localization
  - Note: always import AntD components via sub-paths (e.g. `@ant-design/react-native/es/button`), never `from "@ant-design/react-native"` — the barrel entry cannot be bundled under RNGH v3 (it depends on the removed `DrawerLayout`)
- Backend: Django 5.2 LTS (with `gettext` i18n) + Django REST Framework + djangorestframework-simplejwt + django-simpleui + django-cors-headers + Pillow + cairosvg (SVG logo → PNG)
- Everything is built in-house: the points economy, paid experiences, review flows and backup/restore are implemented natively on Django / DRF and Expo with no extra third-party services (optional email sending via Resend only)

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
npm run android    # Android (expo run:android, local native build)
npm run ios        # iOS (expo run:ios, local native build)
```

- API base: `http://localhost:8000` for web/iOS, `http://10.0.2.2:8000` for the Android emulator; override with `EXPO_PUBLIC_API_BASE_URL` (e.g. a LAN IP for real-device debugging)
- Real-device debugging: backend on `runserver 0.0.0.0:8000`, frontend `EXPO_PUBLIC_API_BASE_URL=http://<LAN_IP>:8000`
- Run: `./scripts/start_frontend.sh` (or `npm run web`)
- Checks: `npx tsc --noEmit`, `npx expo export --platform web`
- Note: `react` and `react-dom` must stay on the exact same version (currently 19.2.0, aligned with Expo SDK 55); adjust via `npx expo install react react-dom`, not by editing `package.json` directly

## Android / iOS Packaging (local EAS scripts + GitHub Actions Release)

The same frontend codebase can produce **Android APK** and **iOS IPA** packages. Two packaging paths are provided:

1. **Local packaging (EAS cloud build)**: `scripts/build_android.sh` / `scripts/build_ios.sh` upload the code to EAS cloud for compilation (no local Android SDK / Xcode / macOS needed), requires an Expo account.
2. **GitHub Actions packaging + Release publishing**: builds directly on GitHub runners ("Expo prebuild to generate native projects + Gradle / Xcode build"), no EAS required; both manual runs and `v*` tag pushes build and publish a **draft Release**, with configurable inputs.

### 1. Local packaging (EAS cloud build)

No local Android SDK / JDK / Xcode needed, and no macOS required to build the iOS package.

#### One-time prerequisites

```bash
npx eas-cli login                        # log in to Expo (CI: use EXPO_TOKEN env var)
cd frontend && npx eas-cli init          # link the EAS project (generates eas.json + projectId)
npx eas-cli credentials                  # iOS signing credentials (Apple developer account); Android keystore is auto-generated on first build
```

#### Config variables

Resolved by priority **environment variables > `scripts/build.env` (copy from `scripts/build.env.example`) > defaults**:

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | app.json `name` | App display name |
| `APP_VERSION` | app.json `version` | Version (e.g. `1.0.0`) |
| `ANDROID_PACKAGE` | `com.finnav.app` | Android applicationId |
| `ANDROID_VERSION_CODE` | derived from version | Android versionCode (e.g. 1.0.0 → 10000) |
| `IOS_BUNDLE_IDENTIFIER` | `com.finnav.app` | iOS bundleIdentifier |
| `IOS_BUILD_NUMBER` | `1` | iOS build number |
| `IOS_DEPLOYMENT_TARGET` | `15.1` | iOS minimum deployment version (fixed default 15.1, the SDK 55 minimum; supports iPhone 6s Plus iOS 15.8.8 and iPadOS 26.2) |
| `EAS_PROFILE` | `preview` | Build profile: `preview`=installable APK (daily debugging) / `production`=AAB for store |
| `EAS_CLI` | `npx --yes eas-cli@latest` | eas-cli invocation (pin a version in CI) |
| `EXPO_PUBLIC_API_BASE_URL` | empty | **Backend API URL baked into the app** |
| `ANDROID_ALLOW_CLEARTEXT` | empty | Set to `1` to allow cleartext HTTP (debugging/LAN backend only; use HTTPS for release) |
| `EXPO_TOKEN` | empty | Expo access token for CI / non-interactive environments (skips `eas-cli login`) |
| `BUILD_OUTPUT_DIR` | `frontend/build` | Output directory |

#### Packaging

```bash
cd frontend && npm install

# Android (EAS_PROFILE=preview → installable APK; production → AAB for store)
./scripts/build_android.sh
# Output: frontend/build/android/finnav-<version>-<EAS_PROFILE>-android.{apk,aab}

# iOS (configure EAS signing credentials first)
./scripts/build_ios.sh
# Output: frontend/build/ios/finnav-<version>-<EAS_PROFILE>-ios.ipa
```

`EXPO_PUBLIC_API_BASE_URL` is temporarily written into the `env` of the matching profile in `frontend/eas.json`, inlined by the cloud Metro bundle, and the files are restored after the build. If empty, the built-in defaults apply (web/real devices follow the host being accessed; Android emulator uses `10.0.2.2:8000`).

### 2. GitHub Actions packaging + Release publishing

Two workflows are included (`.github/workflows/`), **building directly on the runners, no EAS / Expo account needed**:

- **`build-android.yml`**: `expo prebuild` + Gradle build of the APK/AAB on `ubuntu-latest`
- **`build-ios.yml`**: `expo prebuild` + `xcodebuild` build of the IPA on `macos-26` (Xcode 26.4.1) (default simulator build, unsigned; `iphoneos-unsigned` device build without signing for self-signing tools like 爱思助手)

Triggers:

- **Manual**: Actions page → workflow → `Run workflow`, with inputs for version, package/bundle id, backend API URL, etc.
- **Tag push**: push a `v*` tag (e.g. `v1.0.0`) to build automatically with the tag version

Every successful build publishes a **draft Release** (`v<version>`, the tag is created automatically); go to the Releases page to review and publish. Artifacts are also uploaded via `actions/upload-artifact` to the workflow run page.

#### Configurable inputs (manual runs)

Combined inputs of the two workflows (Android ones live in `build-android.yml`, iOS ones in `build-ios.yml`):

| Input | Default | Description |
|---|---|---|
| `app_version` | empty | Version (empty → app.json / tag version) |
| `version_code` | derived from version | Android versionCode |
| `android_package` | `com.finnav.app` | Android applicationId |
| `build_type` | `release` | Android Gradle build type release / debug |
| `artifact_type` | `apk` | Android artifact apk (installable) / aab (store) |
| `build_number` | `1` | iOS build number |
| `ios_bundle_identifier` | `com.finnav.app` | iOS bundleIdentifier |
| `ios_sdk` | `iphonesimulator` | iOS SDK (`iphonesimulator` simulator build unsigned / `iphoneos-unsigned` device build unsigned for self-signing / `iphoneos` device build with automatic signing) |
| `api_base_url` | empty | **Backend API URL baked into the app** |
| `allow_cleartext` | `false` | Allow cleartext HTTP (debugging/LAN backend only) |

#### Secrets (optional)

| Secret | Description |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 content of the keystore file (release builds use real signing once set) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |
| `IOS_DEVELOPMENT_TEAM` | Apple developer Team ID (automatic signing for the iOS `iphoneos` device build) |

- Android builds without a keystore use the debug signature (the APK is still directly installable)
- iOS defaults to `iphonesimulator`, unsigned (installable on the simulator, not a real device); `iphoneos-unsigned` produces an unsigned device build for self-signing installers (e.g. 爱思助手, no Apple developer account needed); `iphoneos` device builds need `IOS_DEVELOPMENT_TEAM` + automatic signing
- iOS minimum deployment version is 15.1 (the Expo SDK 55 minimum); one device build runs on both iPhone 6s Plus (iOS 15.8.8) and iPadOS 26.2
- On a manual run, if the version tag already exists the draft Release is updated; the auto-created tag also triggers one more tag build (producing the same draft) — this is expected

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

### Deploying backend and frontend separately

By default everything is deployed together. To deploy **backend and frontend independently** (e.g. on different hosts), two standalone compose files are included:

```bash
# Backend only (public port BACKEND_PORT, default 8000; serves API/admin/static/media)
docker compose -f docker-compose.backend.yml up -d --build

# Frontend only (public port PORT, default 80; reverse-proxies /api /admin /static /media to a remote backend)
# First set BACKEND_URL=http://<backend-ip>:8000 in docker/.env
docker compose -f docker-compose.frontend.yml up -d --build
```

- The standalone frontend needs no shared data directory; `BACKEND_URL` can point at any backend (same host or remote)
- `/media/` is reverse-proxied by the frontend nginx to the backend, which also serves `/media/` in production (cache headers preserved)
- See [`docker/README.md`](docker/README.md) for details

### Mobile apps connecting to a backend-only deployment

The Android/iOS apps are independent of the web frontend and only call the backend API, so they work fine with a **backend-only deployment**:

```bash
# 1. Deploy backend only (public port BACKEND_PORT, default 8000)
docker compose -f docker-compose.backend.yml up -d --build
# 2. Build the app pointing at the backend
EXPO_PUBLIC_API_BASE_URL=http://<backend-ip-or-domain>:8000 ./scripts/build_android.sh   # or build_ios.sh
```

- Open `BACKEND_PORT` in the firewall/security group; `ALLOWED_HOSTS=*` accepts any Host by default (set it to the real domain/IP in production)
- Media is served by the backend in production; absolute media URLs in the API are generated from the access address automatically
- **iOS**: connecting to an HTTP backend works out of the box (Expo allows arbitrary loads by default)
- **Android**: release builds block cleartext HTTP by default (Android 9+). For a non‑TLS `http://IP:8000` backend, enable `ANDROID_ALLOW_CLEARTEXT=1` and rebuild for local/LAN debugging; **for production, put the backend behind HTTPS** (no flag needed)

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


