# Demo test plan

This document defines what "works" means for each demo scene and is the
acceptance checklist for the daily manual run on `main`.

## Test setup

1. Start PostgreSQL and apply the current Alembic migrations.
2. Reset and seed the database with `backend/seed.py`.
3. Start the backend and frontend using the commands in `AGENTS.md`.
4. Use the role switcher to run each scenario as the role listed below.
5. Record the result as `PASS` or `FAIL`. A failure must be reported with the
   [Bug report template](../.github/ISSUE_TEMPLATE/bug.yml), including the
   scenario name and reproduction steps.

The scenarios must be repeatable from a fresh seeded database. Where a
scenario changes data, reset and reseed before rerunning it.

## Scenario acceptance criteria

| ID | Module / scene | Role | Steps | Works when | Issue |
|---|---|---|---|---|---|
| EQ-01 | Equipment | Fleet manager | Open equipment; create an excavator with valid details; edit its name or hourly cost; reopen it. | The new equipment is visible in the list, saved fields persist after reload, and invalid or missing required data is rejected visibly. | [#43](https://github.com/Andrei-Borta/fleet-management/issues/43) |
| SITE-01 | Sites and budgets | Fleet manager | Create or open a construction site; enter its address, budget and date range; save and reopen it. | The site is listed with saved values, and reversed dates or invalid amounts cannot be saved. | [#44](https://github.com/Andrei-Borta/fleet-management/issues/44) |
| RES-01 | Reservation request | Site manager | Request the seeded excavator for the seeded site for a valid date range. | A pending request is created with the selected equipment, site and dates. | [#45](https://github.com/Andrei-Borta/fleet-management/issues/45) |
| RES-02 | Reservation conflict and alternatives | Site manager | Request equipment for an overlapping period; inspect the conflict; choose a suggested same-type alternative. | The conflict is rejected clearly, alternatives are available when appropriate, and selecting one creates a request without double-booking. | [#45](https://github.com/Andrei-Borta/fleet-management/issues/45) |
| RES-03 | Reservation approval | Fleet manager | Open a pending request; approve it; repeat with another request and reject it. | Approval makes the equipment booked; rejection leaves it unreserved and changes the request to rejected. | [#46](https://github.com/Andrei-Borta/fleet-management/issues/46) |
| CAL-01 | Central calendar | Fleet manager | Open the calendar after approving a reservation; inspect the equipment timeline. | The approved reservation appears on the correct equipment and dates, and maintenance periods are visible too. | [#47](https://github.com/Andrei-Borta/fleet-management/issues/47) |
| MAINT-01 | Defect reporting and auto-block | Operator | Report a defect for an available machine. | The defect is saved with its severity, the equipment becomes defective/unavailable, and it cannot be reserved while blocked. | [#48](https://github.com/Andrei-Borta/fleet-management/issues/48) |
| MAINT-02 | Intervention, parts and costs | Mechanic | Create an intervention; add parts and labour cost; mark it done. | Intervention and parts persist, total cost is correct, and equipment becomes available only after repair completion. | [#48](https://github.com/Andrei-Borta/fleet-management/issues/48) |
| DASH-01 | Dashboard | Fleet manager | Open the dashboard before and after reservation and maintenance scenes. | Availability, utilization and site cost are shown and update to reflect bookings, maintenance costs and budget comparison. | [#49](https://github.com/Andrei-Borta/fleet-management/issues/49) |
| OPS-01 | Safety checklist | Operator | Submit a passing daily checklist; repeat with a critical item failing. | A passing checklist submits; a critical failure blocks usage and explains why. | [#50](https://github.com/Andrei-Borta/fleet-management/issues/50) |
| OPS-02 | Usage hours and fuel | Operator | Record usage hours and fuel; reopen history and equipment details. | The log persists, engine hours increase, and the reading feeds service-due logic. | [#50](https://github.com/Andrei-Borta/fleet-management/issues/50) |
| NOTIF-01 | Notifications | Applicable role | Trigger defect, approval or service-due events; open the notification bell. | The correct role receives a readable notification and it can be marked read without duplicates. | [#51](https://github.com/Andrei-Borta/fleet-management/issues/51) |

## Full demo flow checklist

Run this sequence in order to validate [DEMO_SCRIPT.md](./DEMO_SCRIPT.md):

- [ ] Fleet manager sees the dashboard and equipment list.
- [ ] Fleet manager adds an excavator.
- [ ] Site manager requests it for a site.
- [ ] An overlapping request produces a conflict and a same-type alternative.
- [ ] Fleet manager approves the valid request.
- [ ] The approved booking appears in the calendar.
- [ ] Operator reports a defect and the equipment is auto-blocked.
- [ ] Mechanic records an intervention, parts and cost, then closes the repair.
- [ ] Dashboard availability and cost-vs-budget values reflect the changes.
- [ ] No uncaught error, stale loading state or contradictory status is visible.

## Daily run record

Run the full flow on `main` every day. Add a row to the team's QA tracking:

| Date | Commit | Scenarios | Result | Bug issue |
|---|---|---|---|---|
| YYYY-MM-DD | `<short SHA>` | `EQ-01 ... DASH-01` | PASS / FAIL | `#123` or `—` |

For every `FAIL`, file a bug immediately with the scenario ID, expected and
actual result, exact reproduction steps, role, browser, commit SHA and useful
screenshots or console/API details.

Update this plan whenever a demo scene, seed data, acceptance rule or related
issue changes.