# core/: HTTP, errors, feedback and loading

App-wide services. Feature code uses them as described here instead of building its own versions.
To see them working, run `npm start` and open <http://localhost:4200/dev/ui-kit> (dev builds only).

| File                                      | What it is                                                     |
| ----------------------------------------- | -------------------------------------------------------------- |
| `api.ts`                                  | `API_URL` (`/api/v1`). Build every request URL from it.        |
| `role.interceptor.ts` / `role.service.ts` | Sends the selected demo role as the `X-Role` header.           |
| `error.interceptor.ts`                    | Shows an error message for failed requests (rules below).      |
| `api-error.ts`                            | Error body types, `asConflict()` and `errorMessage()`.         |
| `notification.service.ts`                 | `NotificationService`: the only way to show feedback messages. |
| `theme.service.ts`                        | Light/dark theme, saved in `localStorage`.                     |

## HTTP errors: what the interceptor does

Every request goes through `errorInterceptor`:

| Response                                | What happens                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2xx                                     | Nothing.                                                                                                    |
| **409 Conflict**                        | **No message.** The error goes to the caller, which decides what to show (e.g. alternatives).               |
| Any other error (403, 404, 422, 5xx, …) | Error message with the backend `detail`; it stays until dismissed. The error is still passed to the caller. |
| Network failure (status 0)              | "Cannot reach the server…" message.                                                                         |

- `detail` can be a string or FastAPI's list of validation errors. A list is shown as
  `field: message; field: message`.
- **Don't** show your own message for a failed request, because the user would see two. Do update
  your page's error state (see below).
- To show the error some other way, opt out per request:
  `http.post(url, body, { context: new HttpContext().set(SKIP_ERROR_NOTIFICATION, true) })`.

### Handling a 409

```ts
import { asConflict } from '../../core/api-error';
import { ReservationConflictBody } from './reservations.models';

this.reservations.create(request).subscribe({
  next: () => this.notifications.success('Request sent'),
  error: (error: unknown) => {
    const conflict = asConflict<ReservationConflictBody>(error);
    if (conflict) {
      this.conflict.set(conflict); // show conflict.detail and conflict.alternatives
    }
  },
});
```

`asConflict()` returns `null` for anything that isn't a 409. The generic `ApiConflict` type has an
**optional** `alternatives` list, because most 409s (e.g. deleting a site that has reservations)
have none. A feature that knows its exact 409 body passes its own type, as above.

## Feedback messages

```ts
private readonly notifications = inject(NotificationService);

this.notifications.success('Equipment saved'); // closes after 3 s
this.notifications.error('Could not read the file'); // stays until dismissed
```

Write short sentence-case messages with no exclamation marks (STYLE_GUIDE §6, §7). For destructive
actions, ask first with `ConfirmService` from `shared/confirm-dialog/`.

## Loading and error state on a page

Each page keeps three signals and shows them inside the affected card, as STYLE_GUIDE §6 requires:
a `mat-progress-bar` at the top of the card while loading, an inline error card with **Retry**
if loading fails, an empty state when the list is empty, and the content otherwise. No full-page
spinners.

```ts
export class SitesPage {
  private readonly sites = inject(SitesService);

  protected readonly items = signal<Site[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.sites
      .list()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: () => this.failed.set(true), // the interceptor already showed the message
      });
  }
}
```

```html
<section class="card">
  @if (loading()) {
  <mat-progress-bar mode="indeterminate" />
  } @if (failed()) {
  <div class="empty-state">
    <span class="material-symbols-rounded" aria-hidden="true">error</span>
    <p>Sites could not be loaded.</p>
    <button mat-stroked-button (click)="load()">Retry</button>
  </div>
  } @else if (!loading() && items().length === 0) {
  <div class="empty-state">…</div>
  } @else {
  <table mat-table [dataSource]="items()">
    …
  </table>
  }
</section>
```

`dev/ui-kit.page.ts` uses the same pattern for its test request.

## Models

Response types live in `features/<feature>/<feature>.models.ts` and mirror the backend response
schemas: snake_case fields, dates and datetimes as ISO strings, and money as `number` (RON).
When a backend schema changes, update the model in the same PR (AGENTS.md rule 4).
