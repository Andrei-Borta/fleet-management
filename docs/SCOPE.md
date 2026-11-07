# MVP Scope: Demo milestone (deadline Thursday, Nov 12)

The assignment: a video of at most 5 minutes showing the features that bring the **most value to the client**.
User management explicitly does **not** count, so there is **no login** in the MVP.

## Personas (demo roles, chosen with a role switcher in the top bar)
| Role | Cares about |
|---|---|
| Site manager | Requesting equipment for their site, seeing what's booked |
| Fleet manager | Approving requests, avoiding conflicts, fleet health and costs |
| Mechanic | Defects, service interventions, parts |
| Operator | Daily safety checklist, logging hours and fuel |

The selected role is sent as an `X-Role` header. Backend endpoints may use it to restrict actions.

## Must-have (P0): the demo storyline
1. **Equipment & sites**: CRUD for equipment (name, type, status, engine hours, hourly cost,
   service interval) and sites (name, address, budget, dates).
2. **Reservations**: a site manager requests equipment X for site Y from date A to date B.
   - **Conflict detection**: overlaps with approved reservations or blocked equipment are rejected.
   - **Alternatives**: when a request conflicts, the API suggests available equipment of the same type.
   - The fleet manager **approves or rejects** requests.
3. **Central calendar**: timeline of reservations and maintenance per equipment.
4. **Maintenance**: report a defect, track a service intervention (status, parts, costs);
   **equipment is blocked automatically** while defective or under repair, or when service is overdue
   (by date or by engine hours).
5. **Dashboard**: availability (available / reserved / in service), utilization %, and cost per
   site compared with its budget.

## Should-have (P1), if time allows
- Daily safety checklist for operators (blocks usage if a critical item fails).
- Logging of usage hours and fuel (updates the engine hours, which feeds the service-due rule).
- In-app notifications (service due, defect reported, request approved or rejected).

## Deferred (post-demo)
Authentication and user management · GPS tracking and transfers between sites · AI recommendations · email notifications.

## Equipment status model
`available` → `reserved` (during an approved reservation) · `in_service` (open intervention) ·
`defective` (open defect, not yet in service) · `retired`.
Only `available` equipment can be reserved for a period; the backend enforces this.

## Timeline (deadline: Thursday, Nov 12)
| Day | Goal |
|---|---|
| Sun 8 – Mon 9 | Foundations merged: data model (#1), test fixtures and errors (#17), FE shell and theme (#18), API layer (#19), seed skeleton (#13) |
| Mon 9 – Tue 10 | All `priority:must` features in PRs and merged |
| Wed 11 | **Code freeze 18:00.** Bug fixing only, full demo dry run, storyboard final |
| Thu 12 | Record, edit and submit the video |
