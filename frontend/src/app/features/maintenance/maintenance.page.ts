import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { PageHeader } from '../../shared/page-header/page-header';
import { MaintenanceBoard } from './maintenance-board';
import { ServiceDueSoon } from './service-due-soon';

@Component({
  selector: 'app-maintenance-page',
  imports: [MaintenanceBoard, MatButtonModule, PageHeader, RouterLink, ServiceDueSoon],
  template: `
    <app-page-header title="Maintenance" subtitle="Defects, interventions, parts and costs">
      <a mat-flat-button routerLink="/maintenance/report">Report defect</a>
    </app-page-header>
    <app-service-due-soon #due />
    <app-maintenance-board (statusChanged)="due.load()" />
  `,
  styles: `
    app-service-due-soon {
      display: block;
      margin-bottom: var(--space-5);
    }
  `,
})
export class MaintenancePage {}
