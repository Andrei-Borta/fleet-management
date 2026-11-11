import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Validate an inclusive ISO date range, optionally constrained by an outer range. */
export function dateRangeErrors(
  start: string,
  end: string,
  bounds?: { start: string; end: string },
): ValidationErrors | null {
  if (start && end && end < start) return { dateOrder: true };
  if (bounds && ((start && (start < bounds.start || start > bounds.end)) ||
    (end && (end < bounds.start || end > bounds.end)))) {
    return { outsideBounds: true };
  }
  return null;
}

/** Read a string value from a form group without relying on untyped form values. */
export function stringField(group: AbstractControl, name: string): string {
  const value: unknown = group.get(name)?.value;
  return typeof value === 'string' ? value : '';
}
