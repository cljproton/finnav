# AGENTS.md

Backend (Django + DRF) and mobile frontend (Expo/React Native) for "FinNav" — a finance-site navigation tool.

## Commands

- Backend deps are in `backend/.venv` (`python3` from `.venv/bin`).
- Test: `cd backend && source .venv/bin/activate && python manage.py test apps.navigation`
- System check: `python manage.py check`
- Backend runs via `scripts/start_backend.sh` (localhost:8000, uses `backend/db.sqlite3`) or `docker-compose` in `docker/` (uses `docker/data/db.sqlite3`).

## Test/verification accounts (local DB only)

- Real superuser: `admin` / `Admin@2026`. **Do NOT enable 2FA, reset the password, or otherwise mutate this account during smoke/verification runs.**
- Use a dedicated test superuser for all manual smoke checks (`manage.py shell`, `runserver` checks, admin-page walkthroughs): `testadmin` / `Test@2026`.
- Note: `manage.py test` runs on an in-memory DB and cannot dirty real data; `manage.py shell` and ad-hoc Client requests DO write to the real DB. Always verify against `testadmin`, never `admin`.

## Conventions
- Admin 2FA: login gate = global `AppSetting.twofa_enabled` AND the admin's own `TwoFactor.enabled`. Self-service config page lives at `/admin/twofa/` (entry in the top-right user dropdown, after "修改密码").
- `apps/navigation/templates/admin/index.html` is a vendored copy of django-simpleui `2026.1.13` `templates/admin/index.html`; keep the「双因素认证」dropdown addition when re-syncing on simpleui upgrades.
- Admin standalone pages stay self-contained (inline CSS, no simpleui dependency). Only the data dashboard `overview.html` (and its partials `dashboard_overview.html`/`visit_trends.html`/`download_overview.html`) keeps the dark theme; all other standalone pages (`backup.html`, `twofa.html`, `twofa_login.html`, `upgrade_notes.html`) and the custom change forms use the shared light `--fn-*` tokens (indigo primary `#4F46E5`, borders `#E5E7EB`, radii `--fn-radius-sm` 6px / `--fn-radius-md` 10px). Keep those pages light and token-based when editing.