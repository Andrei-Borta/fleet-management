# AGENTS.md: instructions for AI coding agents

This file is the **source of truth** for any AI agent working in this repo (Claude Code, Codex,
Copilot, Cursor, …). Humans: read it too, since it is also the team's coding contract.

## Project
Construction fleet & equipment management platform. MVP scope: [docs/SCOPE.md](docs/SCOPE.md).
**No authentication or user management in the MVP**: the role comes from the `X-Role` header (see `backend/app/core/deps.py`).

## Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy 2 (typed `Mapped[]` style), Alembic, Pydantic v2, PostgreSQL 16, pytest, ruff.
- Frontend: Angular 20 (standalone components, signals, new control flow `@if/@for`), Angular Material, Playwright, angular-eslint.

## Layout
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short:
- `backend/app/modules/<module>/{models,schemas,service,router}.py`: put logic in `service.py`, keep `router.py` thin.
- `backend/tests/modules/test_<module>_service.py`: service tests.
- `frontend/src/app/features/<feature>/`: page, components, service, models.
- `frontend/e2e/<feature>.spec.ts`: Playwright specs.

## Commands
| Task | Command (working dir) |
|---|---|
| DB | `docker compose up -d db` (root) |
| Backend run | `uvicorn app.main:app --reload` (backend/) |
| Backend lint | `ruff check . && ruff format --check .` (backend/) |
| Backend tests | `pytest --cov --cov-fail-under=80` (backend/) |
| Migration | `alembic revision --autogenerate -m "msg"` then `alembic upgrade head` (backend/) |
| Frontend run | `npm start` (frontend/) |
| Frontend lint/build | `npm run lint && npm run build` (frontend/) |
| E2E | `npm run e2e` (frontend/, backend must be running) |

## Hard rules
1. **Tests are mandatory.**
   - Every public function in a backend `service.py` MUST have pytest tests covering the happy path
     and the error and edge cases. CI enforces ≥ 80% coverage on `app/modules/*/service.py`.
   - Every UI page or user flow MUST have a Playwright spec in `frontend/e2e/`. Use
     `getByRole` / `getByTestId` locators and add `data-testid` attributes where needed.
   - Never delete, skip, or weaken a test to make CI pass. Fix the code instead.
2. **CI must pass**: the `backend` job (ruff, alembic, pytest and coverage), the `frontend` job (lint and build),
   and the `e2e` job (Playwright). Run these commands locally before you finish.
3. **Stay in scope**: only touch the module or feature of the issue you're working on. Shared files
   (`core/`, `app.routes.ts`, `api/v1/router.py`, `seed.py`) get minimal, additive edits only.
4. **Contract first**: if you change an API schema, update the matching frontend models and
   `docs/API_CONVENTIONS.md` if a convention changes.
5. **DB changes** always come with an Alembic migration. Never edit a migration that is already merged.
6. **No AI attribution, ever.** Do not add `Co-Authored-By:` trailers for AI tools, "Generated with …"
   footers, or AI mentions in commits, PR descriptions, issues or code comments. Commits are authored by the human
   developer only. AI tools must never appear as GitHub contributors.
7. **Git workflow** ([CONTRIBUTING.md](CONTRIBUTING.md)): branch `<type>/<issue#>-slug` from `main`,
   Conventional Commits, PR with `Closes #N`, squash & merge. Never push to `main` directly,
   never force-push shared branches, and never merge your own PR without approval.
8. Never commit secrets, `.env` files, `node_modules`, build output or test reports.
9. Don't add new dependencies unless the issue needs them. If you do, pin them and mention them in the PR.

## Style
- Python: type hints everywhere, ruff-clean, functions in `service.py` take a `Session` as the first arg,
  raise domain errors (`ValueError` / custom exceptions) that the router maps to HTTP status codes.
- Angular: standalone components, `inject()` over constructor DI, signals for state, typed HTTP
  calls through a feature service, no `any`. UI text in English.
- Keep it simple. This is a one-week demo, so prefer readable over clever.
