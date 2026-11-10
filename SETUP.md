# Setup: installing dependencies

## Required tools
| Tool | Version | Check |
|---|---|---|
| Git | any recent | `git --version` |
| Python | 3.12 | `python --version` |
| Node.js | 22 LTS | `node --version` |
| Docker Desktop | any recent | `docker --version` |
| GitHub CLI (optional, handy) | any | `gh --version` |

## Clone
```bash
git clone https://github.com/Andrei-Borta/fleet-management.git
cd fleet-management
```

## Backend
```bash
cd backend
python -m venv .venv
# Windows (PowerShell):  .venv\Scripts\Activate.ps1
# macOS/Linux:           source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```
Add a runtime dependency with `pip install X`, then pin it in `requirements.txt` (dev-only tools go in `requirements-dev.txt`).

## Frontend
```bash
cd frontend
npm ci
npx playwright install chromium     # browsers for the E2E tests
```
Add a dependency with `npm install X` (commit `package-lock.json`). Always use `npm ci` for clean installs.
Angular CLI usage analytics are disabled for the project (`"analytics": false` in `angular.json`). Never commit an `"analytics": "<id>"` value.

## Database
```bash
docker compose up -d db      # Postgres 16 on localhost:5432, user/pass/db = fleet
```
