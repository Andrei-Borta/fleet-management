import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';

import { PageHeader } from '../../shared/page-header/page-header';
import { DailyChecklist } from './daily-checklist';
import { UsageLog } from './usage-log';

/** The operator's page: the daily safety checklist and the hours and fuel log, one tab each. */
@Component({
  selector: 'app-operations-page',
  imports: [DailyChecklist, MatTabsModule, PageHeader, UsageLog],
  template: `
    <app-page-header
      title="Operations"
      subtitle="Daily safety checks, working hours and fuel"
    />
    <mat-tab-group mat-stretch-tabs="false" animationDuration="0ms">
      <mat-tab label="Safety checklist">
        <app-daily-checklist />
      </mat-tab>
      <mat-tab label="Hours and fuel">
        <ng-template matTabContent>
          <app-usage-log />
        </ng-template>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `
    mat-tab-group { margin-top: calc(-1 * var(--space-2)); }
    app-daily-checklist,
    app-usage-log { display: block; padding-top: var(--space-5); }
  `,
})
export class OperationsPage {}
