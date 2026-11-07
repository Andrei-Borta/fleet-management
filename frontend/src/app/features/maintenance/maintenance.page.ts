import { Component } from '@angular/core';

import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-maintenance-page',
  imports: [PageHeader],
  template: `
    <app-page-header title="Maintenance" />
    <section class="card">
      <div class="empty-state">
        <span class="material-symbols-rounded" aria-hidden="true">construction</span>
        <p>Not implemented yet. See the GitHub issues labelled mod:maintenance.</p>
      </div>
    </section>
  `,
})
export class MaintenancePage {}
