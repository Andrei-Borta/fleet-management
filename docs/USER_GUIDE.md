# User guide

Fleet Management keeps construction equipment, site bookings, repairs and costs in one place.
There is no login in the MVP: pick your role from the **Role** menu in the top bar. The role is
not saved, so it goes back to *Fleet manager* when you reload the page.

Statuses used everywhere:

| Status | Meaning |
|---|---|
| Available | Can be reserved |
| Reserved | On an approved booking today |
| In service | A repair or revision is in progress |
| Defective | Has an open critical defect; it cannot be reserved |
| Retired | Out of the fleet |

Equipment that is overdue for service (by date or engine hours) cannot be reserved either.

---

## Site manager

You request the machines your site needs.

1. Open **Sites**, choose your site and select **Reserve equipment**. You can also use
   **Reservations → New reservation** and pick the site yourself.
2. Enter the start and end dates. They must be inside the site's dates.
3. Click **Equipment**, search or filter by category, and pick a machine. Each machine shows
   whether it is free for your dates.
4. Select **Submit request**. The request is *Pending* until the fleet manager decides.

**If the machine is taken**, you see *Equipment unavailable* with the overlapping booking or
maintenance, and a list of free machines of the same type. Select **Request this** next to one,
or **Edit request** to change the dates.

Your site page lists every booking for the site with its status.

## Fleet manager

You own the fleet, approve requests and watch costs.

- **Dashboard**: equipment counts by status, utilization per machine (1 month to 1 year),
  machines due for service and the number of pending requests.
- **Equipment**: search and filter the fleet, open a machine for its details and bookings,
  **Add equipment** or **Edit equipment** (name, type, serial number, engine hours,
  hourly cost, service interval).
- **Sites**: add or edit sites with their address, budget and dates.
- **Reservations**: the *Pending* tab is your inbox. Use the approve or reject buttons on each row.
  Approval is checked again, so a request that now overlaps a booking or a blocked machine is
  refused with the reason.
- **Calendar**: a week or month timeline per machine with bookings and maintenance. Filter by site
  or equipment type and click an entry for its details.
- **Dashboard → Site costs**: each site's budget, committed cost (bookings plus attributed repairs),
  remaining budget and percentage used. Sites over budget are marked in red. Use the breakdown
  button to split equipment and maintenance costs.

## Operator

You run the machines and report problems.

1. Open the machine under **Equipment** and select **Report defect**, or use
   **Maintenance → Report defect** and pick the machine.
2. Choose a severity and describe the problem, then select **Report defect**.

A **critical** defect blocks the machine straight away: it becomes *Defective* and cannot be
reserved until the repair is closed.

The daily safety checklist and the hours and fuel log are coming in **Operations**.

## Mechanic

You repair machines and record what each repair cost.

- A repair moves from *planned* to *in progress* to *done*. While it is in progress the machine is
  *In service*. Closing it resolves the linked defect and makes the machine available again.
- Record labour hours, the labour rate and every part (quantity and unit cost). The total is
  charged to the site that had the machine booked on the repair date.

The maintenance board for these steps is in progress
([#27](https://github.com/Andrei-Borta/fleet-management/issues/27)); until then the API
(`/api/v1/maintenance/interventions`) supports the full flow.
