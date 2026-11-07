import { Component, input } from '@angular/core';

/**
 * Mandatory header for every routed page (docs/STYLE_GUIDE.md §5.2).
 * Project the page's single primary action as content.
 */
@Component({
  selector: 'app-page-header',
  template: `
    <div class="titles">
      <h1 data-testid="page-title">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="text-muted">{{ subtitle() }}</p>
      }
    </div>
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--space-4);
      margin-bottom: var(--space-5);
    }
    p {
      margin: var(--space-1) 0 0;
    }
    .actions {
      display: flex;
      gap: var(--space-2);
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}
