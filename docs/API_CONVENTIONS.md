# API conventions

- Base path `/api/v1`. Resources are plural nouns: `/equipment`, `/sites`, `/reservations`.
- `GET /x` list (supports `?status=`, `?type=` filters where relevant), `GET /x/{id}`, `POST /x`,
  `PATCH /x/{id}`, `DELETE /x/{id}`. Actions use sub-resources: `POST /reservations/{id}/approve`.
- JSON in **snake_case**. Dates are ISO 8601 (`2026-11-14`), datetimes are UTC ISO.
- Errors: `{"detail": "human readable message"}`, with `404` not found, `409` conflict
  (e.g. a reservation overlaps; the body includes `"alternatives": [...]`), and `422` validation.
- Role: header `X-Role: site_manager | fleet_manager | mechanic | operator` (default `fleet_manager`).
- Money: `Decimal` serialized as a number with 2 decimals. Currency: RON.
- Frontend models mirror the response schemas in `features/<x>/<x>.models.ts`. Check them against
  `/docs` (Swagger) when the backend changes.
- Sites with any reservations cannot be deleted (409), preserving reservation history and site
  cost reporting. Remove a site only when no reservations reference it.
