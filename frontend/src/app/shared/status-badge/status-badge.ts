import { Component, computed, input } from '@angular/core';

export type Status =
  | 'available'
  | 'reserved'
  | 'in_service'
  | 'defective'
  | 'retired'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'planned'
  | 'in_progress'
  | 'done';

const TONE: Record<Status, string> = {
  available: 'available',
  approved: 'available',
  reserved: 'reserved',
  in_service: 'service',
  defective: 'defective',
  rejected: 'defective',
  retired: 'retired',
  cancelled: 'retired',
  pending: 'pending',
  planned: 'pending',
  in_progress: 'service',
  done: 'available',
};

/** The ONLY way to render a status (docs/STYLE_GUIDE.md §3.3). */
@Component({
  selector: 'app-status-badge',
  template: `<span class="dot"></span>{{ label() }}`,
  host: {
    '[attr.data-status]': 'status()',
    '[style.--fg]': '"var(--status-" + tone() + "-fg)"',
    '[style.--bg]': '"var(--status-" + tone() + "-bg)"',
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      line-height: 20px;
      white-space: nowrap;
      color: var(--fg);
      background: var(--bg);
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
  `,
})
export class StatusBadge {
  readonly status = input.required<Status>();
  protected readonly tone = computed(() => TONE[this.status()]);
  protected readonly label = computed(() => {
    const s = this.status().replace('_', ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}
