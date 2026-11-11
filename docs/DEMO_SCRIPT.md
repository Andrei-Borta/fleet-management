# Demo video: script and storyboard (≤ 5 min)

One continuous story through the four roles: a new excavator joins the fleet, a site manager books it
after a conflict, the fleet manager approves it, an operator's safety check blocks a broken loader, a
mechanic repairs it, and the dashboard shows what all of this cost.

| Time | Role | Scene |
|---|---|---|
| 0:00–0:25 | – | 1. The problem |
| 0:25–1:05 | Fleet manager | 2. Dashboard overview → add an excavator |
| 1:05–2:00 | Site manager | 3. Request a machine → **conflict** → book the suggested alternative |
| 2:00–2:40 | Fleet manager | 4. Approve and reject in the inbox → calendar → site manager's bell |
| 2:40–3:20 | Operator | 5. Daily safety checklist → critical failure → **auto-block** |
| 3:20–4:15 | Mechanic | 6. Bell → maintenance board → plan, start, parts and labour, complete |
| 4:15–4:45 | Fleet manager | 7. Site costs: the repair pushes Pipera further over budget |
| 4:45–5:00 | – | 8. Wrap-up |

About 420 words of narration (about 3:30 read calmly), leaving time for the clicks. Every number below
comes from a dry run on a fresh seed
(see [Dry run](#dry-run)).

---

## Before recording

1. **Same-day seed.** Start the stack and reseed on the day you record. Seed dates move with the run
   date, so "today" in the app is always the seed's today:
   ```bash
   docker compose -f docker-compose.prod.yml -p fleet-prod up --build -d          # http://localhost:8080
   docker compose -f docker-compose.prod.yml -p fleet-prod exec backend python seed.py --reset
   ```
   Or in dev mode: `python seed.py --reset` in `backend/`, then the backend and `npm start` (http://localhost:4200).
2. **Dates.** `T` is the day you seed. Booking dates in this script are offsets from `T`
   (for a recording on **12 Nov 2026**: T+7 = 19 Nov, T+11 = 23 Nov).
3. **Browser.** 1920×1080 window, zoom 100%, light theme, one tab, bookmarks bar and extensions
   hidden. Open the app once and set the role to **Fleet manager** so it starts on the dashboard.
4. **Do not touch the data before recording.** Each scene relies on what the previous one created.
   To retake from the start, reseed.
5. **Recording.** 1080p, system sounds off. Record each scene as its own clip; cut on the role switch.

---

## Storyboard

Each scene lists the click path (**bold** = what you click or type), what must be on screen, and the
narration. Keep the mouse still while the narration explains a screen.

### 1. The problem (0:00–0:25)

**Screen:** title card "Fleet Management", then the dashboard with no clicks.

> Construction companies juggle dozens of machines across many sites. Machines get double-booked, a
> broken loader keeps working until someone notices, and nobody knows what a site really costs until
> the invoices arrive. Fleet Management puts equipment, bookings, repairs and costs in one place,
> with a view for each role.

### 2. Fleet manager: overview and a new excavator (0:25–1:05)

**Click path**
1. Dashboard (role **Fleet manager**). Point at the KPI tiles, then the **Service due** card, then the
   bell (badge **2**).
2. Side nav **Equipment** → **Add equipment**.
3. Name **CAT 323 Excavator**, Type **excavator**, Serial number **CAT323-0001**,
   Hourly cost (RON) **190** → **Save**.

**On screen:** 20 machines (12 available, 5 reserved, 1 in service, 1 defective, 1 retired). Service due
lists **CAT D8 Bulldozer** and **Volvo EC220E Excavator** as *Overdue*. After saving, the new excavator
is listed as *Available*.

> The fleet manager starts on the dashboard: twenty machines, which ones are reserved, in service or
> broken, and how much each one is used. Two machines are overdue for service, and the bell has
> already flagged them: overdue machines can't be booked until they're serviced. Today a new
> excavator arrives, so it goes into the fleet.

### 3. Site manager: request, conflict, alternative (1:05–2:00)

**Click path**
1. Role switcher → **Site manager** (lands on the dashboard).
2. Side nav **Sites** → **North Ring Road** → **Reserve equipment**.
3. Start date **T+7**, End date **T+11**.
4. **Equipment** → search **CAT 320** → **CAT 320 Excavator** → **Submit request**.
5. On *Equipment unavailable*, next to **CAT 323 Excavator** → **Request this**.

**On screen:** the picker marks CAT 320 *Unavailable for these dates*. The conflict reads "This
equipment is reserved from T-1 to T+9". Alternatives: **JCB 220X**, **Hitachi ZX210**, **CAT 323**.
After *Request this*: "Request sent" and the reservations list.

> The site manager at North Ring Road needs an excavator next week. The CAT 320 is the first choice, but it's
> still booked until the ninth. Instead of a phone call, the app shows the overlapping booking and
> suggests free excavators of the same type for exactly those dates, including the one that just
> arrived. One click, and the request goes to the fleet manager.

### 4. Fleet manager: approvals and the calendar (2:00–2:40)

**Click path**
1. Role → **Fleet manager**. Dashboard **Pending requests** card → **View requests** (Pending tab).
2. Row for **CAT 323 Excavator** at North Ring Road → **Approve reservation** (check icon).
3. Row for the seeded **CAT 320 Excavator** at North Ring Road, T+7–T+11 → **Approve reservation**: the inline
   message explains the conflict. → **Reject reservation** → **Reject**.
4. Side nav **Calendar** → **Month**.
5. Role → **Site manager**, open the bell.

**On screen:** "Reservation approved"; the CAT 320 approval fails with "Equipment is already booked or in
maintenance for this period". The calendar shows CAT 323 at North Ring Road from T+7 to T+11. The site
manager's bell shows *Reservation approved* and *Reservation rejected*.

> Requests land in the fleet manager's inbox. Approving re-checks the fleet, so an older request for
> the same CAT 320 is refused with the reason, so it gets rejected. The booking appears on the central
> calendar next to maintenance, and the site manager is notified straight away.

### 5. Operator: safety checklist and auto-block (2:40–3:20)

**Click path**
1. Role → **Operator** (lands on **Operations**, *Safety checklist* tab).
2. Equipment **CAT 950M Loader (DEMO-LOA-01)**.
3. **OK** on every item except **Brakes** → **Not OK**. Pause on the red warning.
4. **Submit checklist**.
5. Side nav **Equipment** → **CAT 950M Loader**.

**On screen:** "Do not operate this machine. Submitting this checklist will block the equipment because
a critical item has failed: Brakes." After submitting: "Checklist submitted. Equipment is blocked." The
loader's page shows *Defective*.

> Before every shift the operator runs a safety check. The brakes on the loader at Pipera Business Park
> fail. That's a critical item, so the app says not to operate it, records a critical defect, and
> blocks the machine. From this moment nobody can book it.

### 6. Mechanic: repair with parts and labour (3:20–4:15)

**Click path**
1. Role → **Mechanic** (lands on **Maintenance**). Open the bell: *Defect reported: CAT 950M Loader*.
   Close it.
2. *Open defects* → CAT 950M Loader → **Plan repair**. The card appears in **Planned**.
3. On the card → **Start**. It moves to **In progress**.
4. **Parts and labour** → Part name **Brake pad set**, Qty **2**, Unit cost (RON) **350** → **Add part**;
   Hours **3**, Rate (RON/h) **150** → **Save labour** → **Close**.
5. **Complete** → confirm.

**On screen:** the total reads **1.150,00 RON** (700 parts + 450 labour). After *Complete* the card is in
**Done** and the defect is gone from *Open defects*.

> The mechanic is notified of the defect, plans the repair from it and starts it, which puts the loader
> in service, then logs the brake pads and three hours of labour. Completing the job resolves the defect,
> and the loader is available again, automatically.

### 7. Fleet manager: costs against budget (4:15–4:45)

**Click path**
1. Role → **Fleet manager**. Dashboard → **Site costs**.
2. Row **Pipera Business Park** → **View cost breakdown**.

**On screen:** Pipera Business Park **over budget, 118%** (it was 112% before the repair), with the
1.150 RON repair under maintenance in the breakdown. Dambovita Bridge at **90%**. North Ring Road now
includes the CAT 323 booking.

> And the money. Every booking and every repair is charged to the site that had the machine. The brake
> repair goes to Pipera Business Park, which was already over budget and is now at a hundred and
> eighteen percent, so the fleet manager sees it today, not at the end of the month.

### 8. Wrap-up (4:45–5:00)

**Screen:** the dashboard, then the closing card with the team names.

> One place for the fleet: no double bookings, broken machines blocked the moment they fail, and
> costs visible per site. Next steps: user accounts with real permissions, and GPS tracking of the
> machines.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| CAT 320 doesn't conflict | Dates outside T-1…T+9, or seeded on another day than today | Check the dates, reseed today |
| CAT 323 isn't among the alternatives | It wasn't saved with type `excavator` | Edit its type, or reseed and redo scene 2 |
| The bell shows nothing new | The feed refreshes every 30 s | Switch role away and back |
| Pipera stays at 112% | The repair was planned on another day than the loader's booking | Reseed and record on one day |
| Any scene fails mid-take | Data left over from a previous take | `seed.py --reset`, then restart from scene 2 |

---

## Seed data per scene

Reviewed against a fresh `python seed.py --reset`. The seed writes its data as of 11 Nov 2026 and moves
every date by the days between then and the day it runs, so the offsets from `T` below always hold.

| Scene | Seed records | Expected result |
|---|---|---|
| Dashboard overview | 20 machines | 12 available, 5 reserved, 1 in service, 1 defective, 1 retired. Service due: CAT D8 Bulldozer and Volvo EC220E Excavator, both overdue. The fleet manager's bell has 2 *Service due* notifications. |
| Request → conflict | CAT 320 Excavator approved at North Ring Road T-1…T+9 | A request for T+7…T+11 conflicts. Alternatives: JCB 220X, Hitachi ZX210 and the new CAT 323 (Komatsu PC210 is booked from T+7). |
| Approve → calendar | Pending CAT 320 request at North Ring Road T+7…T+11 | Approving it returns a conflict, so it is the one to reject. The pending CAT D8 request (T+20…T+34) is refused because the machine is overdue for service. |
| Checklist → auto-block | CAT 950M Loader on site at Pipera Business Park T-3…T+4 | A failed critical item creates a critical defect and the loader becomes *Defective*; booking it is refused. |
| Mechanic repair | The CAT 950M defect; the in-progress Volvo L120H repair is an alternative to show | Plan repair schedules it for today, inside the Pipera booking, so its cost goes to Pipera. Completing it resolves the defect and the loader is *Available*. |
| Costs | Approved bookings and the seeded repairs | Pipera Business Park 112% before the repair, 118% after (+1.150 RON). Dambovita Bridge 90%; approving the pending Tadano ATF 60 request (T+11…T+14) would push it over budget. |

Other seeded data visible during the demo: the operator's *Hours and fuel* tab lists 21 usage logs, and
the maintenance board has one planned revision (CAT 320), one repair in progress (Volvo L120H) and one
finished repair (Tadano ATF 60).

## Dry run

Run on 11 Nov 2026 on a fresh seed, every scene in order:

- Through the API: conflict and alternatives (JCB 220X, Hitachi ZX210, CAT 323), approve and reject,
  the CAT D8 refusal, the site manager's notifications, the checklist auto-block and the refused
  booking, the mechanic's notification, the repair (in service → available, total 1.150 RON) and the
  costs (Pipera 112% → 118%).
- Through the UI: the same flow is covered by the Playwright specs `demo-flow`, `reservation-form`,
  `operations-checklist`, `maintenance-board`, `notifications` and `costs`, which pass on `main`.

Do one full rehearsal with the team on the recorded build before the final take, reading the narration
aloud against the timings.
