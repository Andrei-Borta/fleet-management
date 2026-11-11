import { formatNumber } from '@angular/common';

import { DueEquipment } from './maintenance.models';

/**
 * Time and engine hours left before a service, e.g. "3 days left · 12 h left" or "2 days overdue".
 * Shared by the dashboard card and the maintenance page so both read the same.
 */
export function serviceDueRemaining(item: DueEquipment): string {
  const parts: string[] = [];
  if (item.days_until_due !== null) {
    const days = Math.abs(item.days_until_due);
    const unit = days === 1 ? 'day' : 'days';
    parts.push(`${days} ${unit} ${item.days_until_due < 0 ? 'overdue' : 'left'}`);
  }
  if (item.hours_until_due !== null) {
    const hours = formatNumber(Math.abs(item.hours_until_due), 'ro', '1.0-1');
    parts.push(`${hours} h ${item.hours_until_due < 0 ? 'overdue' : 'left'}`);
  }
  return parts.join(' · ');
}
