# Running the app

## Dev mode (recommended)
```bash
# 1. Database
docker compose up -d db

# 2. Backend (from backend/, venv active)
alembic upgrade head
python seed.py
uvicorn app.main:app --reload            # http://localhost:8000/docs

# 3. Frontend (from frontend/)
npm start                                # http://localhost:4200 (proxies /api → :8000)
```

## Tests and linters (run them all before pushing; CI runs the same commands)
```bash
# backend/
ruff check .                       # lint  (ruff check . --fix to autofix)
ruff format .                      # format
pytest --cov --cov-fail-under=80   # service tests and coverage gate

# frontend/
npm run lint
npm run build
npm run e2e                        # Playwright; backend must be running on :8000
npm run e2e:ui                     # interactive Playwright UI
```

## Full stack in Docker (like production)
```bash
docker compose -f docker-compose.prod.yml up --build -d  # http://localhost:8080
docker compose -f docker-compose.prod.yml exec backend python seed.py   # demo data
```
The backend applies migrations on start; the database starts empty until you seed it.
If the dev database is also running, add `-p fleet-prod` so the two stacks don't share containers.

To run the demo storyline against this stack instead of the dev server (from `frontend/`):
```bash
E2E_BASE_URL=http://localhost:8080 E2E_API_URL=http://localhost:8080/api/v1 npx playwright test e2e/demo-flow.spec.ts
```

## Database tasks
```bash
alembic revision --autogenerate -m "add equipment table"   # after changing models
alembic upgrade head
alembic downgrade -1
docker compose down -v        # wipe the DB completely
```

## Troubleshooting
- `connection refused :5432`: run `docker compose up -d db` and check `docker compose ps`.
- Port 4200 or 8000 already in use: stop the old dev server, or use `--port`.
- Playwright says the browser is missing: run `npx playwright install chromium`.
