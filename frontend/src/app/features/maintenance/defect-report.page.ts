import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PageHeader } from '../../shared/page-header/page-header';
import { DefectForm } from './defect-form';
import { Defect } from './maintenance.models';

@Component({
  selector: 'app-defect-report-page',
  imports: [DefectForm, PageHeader],
  template: `
    <app-page-header title="Report defect" />
    <section class="card">
      <app-defect-form
        [equipmentId]="equipmentId"
        (reported)="onReported($event)"
        (cancelled)="cancel()"
      />
    </section>
  `,
})
export class DefectReportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly equipmentId = this.readEquipmentId();

  private readEquipmentId(): number | null {
    const value = this.route.snapshot.queryParamMap.get('equipment');
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
  }

  protected onReported(defect: Defect): void {
    void this.router.navigate(['/equipment', defect.equipment_id]);
  }

  protected cancel(): void {
    void this.router.navigate(this.equipmentId ? ['/equipment', this.equipmentId] : ['/maintenance']);
  }
}
