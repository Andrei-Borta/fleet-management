# Architecture

```
backend/app/
  main.py                  FastAPI app, CORS, /api/health
  core/config.py           Settings (env / .env)
  core/db.py               Engine, SessionLocal, Base, get_db
  core/deps.py             DbSession, CurrentRole (X-Role header)
  api/v1/router.py         Mounts every module router under /api/v1
  modules/<module>/
    models.py              SQLAlchemy models (inherit core.db.Base)
    schemas.py             Pydantic request/response models
    service.py             Business logic: pure functions taking a Session. ALL logic lives here.
    router.py              Thin HTTP layer: validate → call service → return schema
backend/tests/modules/test_<module>_service.py   service tests (required)

frontend/src/app/
  core/                    role service + X-Role interceptor, API base URL, shared services
  shared/                  reusable UI (status badge, confirm dialog, …)
  features/<feature>/      one folder per feature: <feature>.page.ts, components, <feature>.service.ts, models
frontend/e2e/<feature>.spec.ts   Playwright specs (required)
```

## Modules
| Backend module | Frontend feature | Owns |
|---|---|---|
| equipment | equipment | Equipment, types, status |
| sites | sites | Construction sites, budgets |
| reservations | reservations, calendar | Requests, approvals, conflicts, alternatives |
| maintenance | maintenance | Defects, interventions, parts, auto-block |
| operations | operations | Checklists, usage and fuel logs |
| dashboard | dashboard | Read-only aggregates |
| notifications | (top bar bell) | In-app notifications |

## Core data relationships

- An equipment record has a unique serial number, status, operating hours, costs and optional
  service intervals and last-service readings. A site has a budget and date range.
- Each reservation links one equipment record to one site. Its date range is inclusive and its
  status starts as `pending`. Conflict detection and status transitions belong to the services.
- Each defect belongs to equipment. Each service intervention belongs to equipment and may link to
  a defect; planned servicing can therefore be recorded without a defect. Each intervention can
  have multiple parts, with quantity and unit cost; labour cost is stored on the intervention.
- Foreign keys preserve references; numeric checks prevent negative costs and readings, and date
  checks reject reversed ranges. Timestamps are timezone-aware. Service intervals and completion
  timestamps may be absent until known. All monetary values use fixed decimal precision in RON.

Rules:
- Modules talk to each other **only through `service.py` functions**. Never import another module's router.
- The router layer contains no business logic, so services can be tested without HTTP.
- Schema changes go through an Alembic migration (`alembic revision --autogenerate -m "..."`).
