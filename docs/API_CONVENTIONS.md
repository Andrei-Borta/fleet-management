# API conventions

- Base path `/api/v1`. Resources are plural nouns: `/equipment`, `/sites`, `/reservations`.
- `GET /x` list (supports `?status=`, `?type=` filters where relevant), `GET /x/{id}`, `POST /x`,
  `PATCH /x/{id}`, `DELETE /x/{id}`. Actions use sub-resources: `POST /reservations/{id}/approve`.
- JSON in **snake_case**. Dates are ISO 8601 (`2026-11-14`), datetimes are UTC ISO.
- Errors: `{"detail": "human readable message"}`, with `404` not found, `409` conflict
  (e.g. a reservation overlaps; the body includes `"alternatives": [...]`), and `422` validation.
- A reservation `409` caused by a booking or blocked equipment also has `"conflicts"`, a list of
  `{kind, id, start_date, end_date, status}`. `kind` is `reservation` or `maintenance`; `end_date`
  is `null` for maintenance in progress. It is empty when the equipment itself is blocked.
- Role: header `X-Role: site_manager | fleet_manager | mechanic | operator` (default `fleet_manager`).
- Money: `Decimal` serialized as a number with 2 decimals. Currency: RON.
- Frontend models mirror the response schemas in `features/<x>/<x>.models.ts`. Check them against
  `/docs` (Swagger) when the backend changes.
- Frontend error handling relies on this error format: the HTTP interceptor shows `detail` (a string,
  or FastAPI's list of validation errors) for every error except `409`, which the calling page
  handles. `alternatives` is optional in a `409` body. See `frontend/src/app/core/README.md`.
- `GET /equipment` filters: `?type=`, `?status=` and `?available_from=&available_to=` (both required
  together, inclusive dates, `422` otherwise). With a period, only equipment that can be reserved for it
  is returned: not defective, in service or retired, with no approved reservation or open maintenance
  overlapping it. A duplicate `serial_no` on create or update is a `409`.
- Equipment with reservations, defects or service history cannot be deleted (409), preserving the
  history. Retire it with `PATCH {"status": "retired"}` instead.
- Sites with any reservations cannot be deleted (409), preserving reservation history and site
  cost reporting. Remove a site only when no reservations reference it.
- A site's dates cannot be changed to exclude an approved reservation (409). A reservation outside
  the site dates is rejected on creation (422) and on approval, if the site has changed since (409).
