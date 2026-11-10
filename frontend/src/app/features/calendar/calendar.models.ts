// Mirrors the calendar response schema in backend/app/modules/reservations/schemas.py.

export type CalendarEventType = 'reservation' | 'maintenance';

export interface CalendarEquipment {
  id: number;
  name: string;
  type: string;
}

export interface CalendarSite {
  id: number;
  name: string;
}

export interface CalendarEvent {
  type: CalendarEventType;
  /** Reservation id or service intervention id, depending on `type`. */
  id: number;
  equipment: CalendarEquipment;
  /** `null` for maintenance, which belongs to equipment and not to a site. */
  site: CalendarSite | null;
  /** ISO date. */
  start: string;
  /** ISO date; `null` for maintenance in progress. */
  end: string | null;
  /** Reservation: `pending` or `approved`. Maintenance: `planned`, `in_progress` or `done`. */
  status: string;
}

/** Query parameters of `GET /reservations/calendar`. The range is at most 93 days (inclusive). */
export interface CalendarFilters {
  /** ISO date, first day of the range. */
  from: string;
  /** ISO date, last day of the range (inclusive). */
  to: string;
  site_id?: number;
  equipment_id?: number;
}
