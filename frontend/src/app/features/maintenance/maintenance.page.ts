import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-maintenance-page',
  imports: [MatButtonModule, PageHeader, RouterLink],
  template: `
    <app-page-header title="Maintenance">
      <a mat-flat-button routerLink="/maintenance/report">Report defect</a>
    </app-page-header>
    <section class="card">
      <div class="empty-state">
        <span class="material-symbols-rounded" aria-hidden="true">construction</span>
        <p>Not implemented yet. See the GitHub issues labelled mod:maintenance.</p>
      </div>
    </section>
  `,
})
export class MaintenancePage {}
