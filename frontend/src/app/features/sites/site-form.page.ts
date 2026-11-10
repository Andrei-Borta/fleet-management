import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { asConflict } from '../../core/api-error';
import { NotificationService } from '../../core/notification.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { Site, SiteCreate } from './sites.models';
import { SitesService } from './sites.service';

const nonBlank = Validators.pattern(/\S/);
const dateFormat = Validators.pattern(/^\d{4}-\d{2}-\d{2}$/);

const dateOrder: ValidatorFn = (group) => {
  const start: string | undefined = group.get('start_date')?.value;
  const end: string | undefined = group.get('end_date')?.value;
  return start && end && end < start ? { dateOrder: true } : null;
};

@Component({
  selector: 'app-site-form-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    PageHeader,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './site-form.page.html',
  styles: `
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
    .form-error {
      color: var(--color-danger);
    }
  `,
})
export class SiteFormPage {
  private readonly service = inject(SitesService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private original: Site | null = null;

  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly form = this.fb.group(
    {
      name: this.fb.nonNullable.control('', [
        Validators.required,
        nonBlank,
        Validators.maxLength(200),
      ]),
      address: this.fb.nonNullable.control('', [
        Validators.required,
        nonBlank,
        Validators.maxLength(500),
      ]),
      budget: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.pattern(/^\d{1,12}(\.\d{1,2})?$/),
      ]),
      start_date: this.fb.nonNullable.control('', [Validators.required, dateFormat]),
      end_date: this.fb.nonNullable.control('', [Validators.required, dateFormat]),
    },
    { validators: dateOrder },
  );
  protected readonly endDateMatcher: ErrorStateMatcher = {
    isErrorState: (control, parent) =>
      Boolean(
        (control?.invalid || this.form.hasError('dateOrder')) &&
        (control?.touched || parent?.submitted),
      ),
  };

  constructor() {
    this.load();
  }

  protected load(): void {
    if (!this.id) return;
    this.loading.set(true);
    this.failed.set(false);
    this.service
      .get(this.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (site) => {
          this.original = site;
          this.form.reset(site);
        },
        error: () => this.failed.set(true),
      });
  }

  protected save(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    const values = this.form.getRawValue();
    if (this.form.invalid || values.budget === null) return;

    const body: SiteCreate = {
      ...values,
      name: values.name.trim(),
      address: values.address.trim(),
      budget: values.budget,
    };
    const original = this.original;
    const changed = Object.fromEntries(
      Object.entries(body).filter(
        ([key, value]) => !original || original[key as keyof SiteCreate] !== value,
      ),
    );
    if (this.id && !Object.keys(changed).length) {
      void this.router.navigate(['/sites', this.id]);
      return;
    }

    this.saving.set(true);
    this.saveError.set('');
    const request = this.id ? this.service.update(this.id, changed) : this.service.create(body);
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (site) => {
          this.notifications.success(this.id ? 'Site saved' : 'Site added');
          void this.router.navigate(['/sites', site.id]);
        },
        error: (error: unknown) => {
          this.saveError.set(asConflict(error)?.detail ?? 'Changes could not be saved.');
        },
      });
  }
}
