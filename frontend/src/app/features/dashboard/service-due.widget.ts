import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

/** Placeholder until the maintenance service exposes service-due information. */
@Component({
  selector: 'app-service-due-widget',
  imports: [MatButtonModule, RouterLink],
  template: `
    <section class="card" aria-labelledby="service-due-heading">
      <h2 id="service-due-heading">Service due</h2>
      <p>Service-due information is coming soon.</p>
      <a mat-stroked-button routerLink="/maintenance">View maintenance</a>
    </section>
  `,
  styles: `
    :host { display: flex; }
    section { display: flex; flex: 1; flex-direction: column; min-width: 0; }
    a { align-self: flex-start; margin-top: auto; }
  `,
})
export class ServiceDueWidget {}
