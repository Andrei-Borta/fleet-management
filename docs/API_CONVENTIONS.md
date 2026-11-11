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
- `"alternatives"` in `409` lists other equipment of the same type that can be reserved for
  the period, as `{id, name, type, status, hourly_cost}`, cheapest first (ties by `id`). It skips
  defective, in service or retired equipment and anything booked or in maintenance then. It may be empty.
- `GET /reservations/alternatives?equipment_id=&start=&end=` returns the same list on demand. All three
  are required and the dates are inclusive (`422` when `end` is before `start`, `404` for unknown equipment).
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
- `POST` and `PATCH /equipment` only accept the status `available` or `retired` (`422` otherwise).
  `defective` and `in_service` are set by the maintenance logic, and `reserved` is derived from approved
  reservations. Retiring equipment with an approved reservation ending today or later is a `409`.
  Setting `defective` or `in_service` equipment to `available` is a `409` too; only the maintenance
  logic clears that block. Such equipment can still be edited otherwise, or retired.
- `GET /reservations/calendar?from=&to=&site_id=&equipment_id=` feeds the central calendar. `from` and
  `to` are required, inclusive ISO dates, at most 93 days apart (`422` otherwise, also when `to` is
  before `from`). It returns events `{type, id, equipment: {id, name, type}, site: {id, name} | null,
  start, end, status}`, ordered by `start`. `type` is `reservation` (pending and approved only) or
  `maintenance` (planned, in progress or done); `id` is the reservation or intervention id. Maintenance
  has no site and `end` is `null` while in progress. Filtering by `site_id` returns reservations only.
- Defects live under `/maintenance/defects`: `POST` reports one (`equipment_id`, `description`,
  `severity` of `low`, `medium` or `critical`) and `GET` lists them, with `?equipment_id=` and
  `?open=true|false` (open or resolved only). Creating a defect, and resolving one by completing its
  repair, recomputes equipment status in that same transaction. An open critical defect sets the
  machine to `defective`, unless it is retired or an intervention is in progress (that stays
  `in_service`). Resolving the last open critical defect frees it again. A missing machine is a `404`.
- Sites with any reservations cannot be deleted (409), preserving reservation history and site
  cost reporting. Remove a site only when no reservations reference it.
- A site's dates cannot be changed to exclude an approved reservation (409). A reservation outside
  the site dates is rejected on creation (422) and on approval, if the site has changed since (409).
- Maintenance interventions: `GET/POST /maintenance/interventions`, `GET/PATCH
  /maintenance/interventions/{id}`, and `POST /maintenance/interventions/{id}/parts`. Lists accept
  `equipment_id` and `status` filters. Create uses equipment, optional defect, kind, scheduled date,
  optional description, labour hours and rate. Status progresses `planned` → `in_progress` → `done`;
  completed interventions cannot be changed. Part creation returns the updated intervention with
  parts and total cost (parts plus labour hours × rate, rounded to two decimals). Revisions cannot
  overlap approved reservations or start before their scheduled date; starting one is rejected if its
  open-ended work would overlap an approved reservation. Repairs can be scheduled and started despite
  approved reservations. Completing a repair resolves its linked defect, if any; completing a revision
  records the equipment's service readings. Status is recomputed on starting and completing work.
- `GET /dashboard/fleet?from=&to=` returns availability and utilization for an inclusive period
  (`422` when `to` is before `from`). `by_status` has every status, including zeroes. It is a
  snapshot at today when today falls inside the period, otherwise at `to`: equipment with an
  approved reservation on that day counts as `reserved` unless it is defective, in service or
  retired. `by_type` is ordered by count. Utilization is approved reservation days / period days,
  clipping reservations to the period and merging overlaps. Retired equipment is counted in
  `by_status`/`by_type` but left out of `utilization`, `top_used` and `least_used`; the rankings
  return at most five items.
- `GET /dashboard/costs?site_id=` returns one row per site (or only the requested site, `404` if it
  does not exist). Equipment cost is approved reservation days × 8h × `hourly_cost`. Maintenance
  cost is labour + parts for an intervention attributed to the site whose approved reservation of
  that equipment contains the intervention's `scheduled_date`; otherwise it is unattributed. Each row
  has `budget`, `equipment_cost`, `maintenance_cost`, `spent`, `remaining`, `percent_used` and
  `over_budget`.
- `GET /maintenance/due?within_days=&within_hours=` lists equipment whose service is overdue or will be
  within the given days (default 7) or engine hours (default 50); both are `>= 0` (`422` otherwise).
  Retired equipment is left out. Each row is `{equipment_id, name, type, status, days_until_due,
  hours_until_due, overdue}`; the `*_until_due` values are negative when overdue and `null` when that
  interval or its last-service reading is not set. Overdue rows come first. This only reports: it does not
  change the equipment status.
- `POST /operations/checklists` records an operator daily safety checklist (`equipment_id`, `date`, `items: [{name, ok, critical}]`). If any critical item fails (`ok` is `false` and `critical` is `true`), an open critical defect is created and the equipment is auto-blocked to `defective` (unless retired or in service). `GET /operations/checklists?equipment_id=&date=` lists checklists with optional equipment and date filters.
