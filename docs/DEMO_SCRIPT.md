# Demo video: storyline (≤ 5 min)

| Time | Role | Scene |
|---|---|---|
| 0:00–0:30 | – | Problem: equipment is double-booked, machines break mid-project, costs are invisible |
| 0:30–1:15 | Fleet manager | Dashboard overview → equipment list → add an excavator |
| 1:15–2:30 | Site manager | Request the excavator for a site → **conflict** → choose a suggested alternative |
| 2:30–3:00 | Fleet manager | Approve the request → it shows in the calendar |
| 3:00–4:00 | Operator → Mechanic | Report a defect → equipment is **auto-blocked** → mechanic logs parts and cost → closes the intervention |
| 4:00–4:45 | Fleet manager | Dashboard: availability and cost vs. budget update |
| 4:45–5:00 | – | Wrap-up and next steps |

The seed data (`backend/seed.py`) must make every scene reproducible from a fresh database.

## Seed data per scene

Reviewed against a fresh `python seed.py --reset` on 2026-11-11. Use these records so every scene
behaves the same in the dry run and the recording.

The dates below are for a seed run on **11 Nov 2026**. The seed moves every date by the days between
that day and the day it runs, so reseeding on another day keeps every scene working: add the same
number of days to the dates in this table (a seed run on 12 Nov books CAT 320 for 11–21 Nov, and so on).

| Scene | Use | Expected result |
|---|---|---|
| Dashboard overview | Fleet manager opens the dashboard | 20 machines: 12 available, 5 reserved, 1 in service, 1 defective, 1 retired. Service due lists CAT D8 and Volvo EC220E as overdue. |
| Add an excavator | Any new name and serial number, type `excavator` | The new machine is listed as available. |
| Request → conflict | Site manager, **North Ring Road**, **CAT 320 Excavator**, 18–22 Nov 2026 | Conflict with the approved 10–20 Nov booking. Alternatives: JCB 220X and Hitachi ZX210 (Komatsu PC210 is booked from 18 Nov). Choose one. The new excavator has no bookings, so requesting it does not conflict. |
| Approve → calendar | Fleet manager approves the request just created; it appears on the calendar week of 16 Nov | Status *Approved*. The seeded pending CAT 320 request (18–22 Nov) is the one to **reject**: approving it returns a conflict. The pending CAT D8 request is blocked because the machine is overdue for service. |
| Report defect → auto-block | Operator reports a **critical** defect on **CAT 950M Loader** (on site at Pipera Business Park, 8–15 Nov) | The loader becomes *Defective* and cannot be reserved. |
| Mechanic repair | Mechanic (lands on **Maintenance**) opens **Parts and labour** on the in-progress repair of **Volvo L120H Loader** (hose and fittings already logged), adds labour and selects **Complete**; or selects **Plan repair** on the CAT 950M defect | Closing the repair resolves its defect and the loader returns to *Available*. |
| Dashboard: cost vs. budget | Fleet manager opens *Site costs* | Pipera Business Park is over budget (112%), Dambovita Bridge is at 90%. Approving the pending Tadano ATF 60 request (22–25 Nov, Dambovita Bridge) pushes Dambovita over budget. |

### Review findings

- Sites (Bucharest, Voluntari, Giurgiu) and machines (CAT, Komatsu, Volvo, Liebherr, JCB, Bomag) are
  realistic, and every must-have scene has data that reproduces from a fresh database.
- Seed dates move with the run date, so the *Reserved* count, utilization and the current calendar
  week stay filled whenever the seed runs ([#90](https://github.com/Andrei-Borta/fleet-management/issues/90), fixed).
- The machines already working on site (CAT D6, Liebherr LTM 1050, CAT 950M, CAT 320, Bomag BW 213,
  and Tadano ATF 60 before its repair) have daily hours and fuel logs ([#91](https://github.com/Andrei-Borta/fleet-management/issues/91), fixed).
- CAT D6 Bulldozer was serviced in September, so its approved booking no longer contradicts the
  auto-block rule ([#92](https://github.com/Andrei-Borta/fleet-management/issues/92), fixed).
