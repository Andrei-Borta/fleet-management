import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { PageHeader } from '../../shared/page-header/page-header';

@Component({
  selector: 'app-reservation-form-page',
  imports: [MatButtonModule, RouterLink, PageHeader],
  template: `
    <app-page-header title="New reservation">
      <a mat-button routerLink="/reservations">Back to reservations</a>
    </app-page-header>
    <section class="card">
      <p>The reservation form is not yet available.</p>
    </section>
  `,
})
export class ReservationFormPage {}
