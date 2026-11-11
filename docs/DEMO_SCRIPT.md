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

| Scene | Use | Expected result |
|---|---|---|
| Dashboard overview | Fleet manager opens the dashboard | 20 machines: 12 available, 5 reserved, 1 in service, 1 defective, 1 retired. Service due lists CAT D8, CAT D6 and Volvo EC220E as overdue. |
| Add an excavator | Any new name and serial number, type `excavator` | The new machine is listed as available. |
| Request → conflict | Site manager, **North Ring Road**, **CAT 320 Excavator**, 18–22 Nov 2026 | Conflict with the approved 10–20 Nov booking. Alternatives: JCB 220X and Hitachi ZX210 (Komatsu PC210 is booked from 18 Nov). Choose one. The new excavator has no bookings, so requesting it does not conflict. |
| Approve → calendar | Fleet manager approves the request just created; it appears on the calendar week of 16 Nov | Status *Approved*. The seeded pending CAT 320 request (18–22 Nov) is the one to **reject**: approving it returns a conflict. The pending CAT D8 request is blocked because the machine is overdue for service. |
| Report defect → auto-block | Operator reports a **critical** defect on **CAT 950M Loader** (on site at Pipera Business Park, 8–15 Nov) | The loader becomes *Defective* and cannot be reserved. |
| Mechanic repair | Mechanic opens the in-progress repair on **Volvo L120H Loader** (hose and fittings already logged), adds labour and closes it; or creates a repair for the CAT 950M defect | Closing the repair resolves its defect and the loader returns to *Available*. Needs the maintenance board (#27). |
| Dashboard: cost vs. budget | Fleet manager opens *Site costs* | Pipera Business Park is over budget (112%), Dambovita Bridge is at 90%. Approving the pending Tadano ATF 60 request (22–25 Nov, Dambovita Bridge) pushes Dambovita over budget. |

### Review findings

- Sites (Bucharest, Voluntari, Giurgiu) and machines (CAT, Komatsu, Volvo, Liebherr, JCB, Bomag) are
  realistic, and every must-have scene has data that reproduces from a fresh database.
- The seed uses fixed dates in November 2026. After about 20 Nov the *Reserved* count, utilization and
  the current calendar week empty out, so recordings after that date need the seed to move with the
  run date ([#90](https://github.com/Andrei-Borta/fleet-management/issues/90)).
- No usage hours or fuel logs are seeded, so the operator's history (OPS-02) starts empty ([#91](https://github.com/Andrei-Borta/fleet-management/issues/91)).
- CAT D6 Bulldozer is overdue for service but holds an approved booking until 14 Nov, which
  contradicts the auto-block story if someone opens it during the demo ([#92](https://github.com/Andrei-Borta/fleet-management/issues/92)).
