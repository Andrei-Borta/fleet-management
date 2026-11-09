export type ReservationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Reservation {
  id: number;
  equipment_id: number;
  site_id: number;
  start_date: string;
  end_date: string;
  status: ReservationStatus;
  requested_by_role: string;
  note: string | null;
}

export interface ReservationCreate {
  equipment_id: number;
  site_id: number;
  start_date: string;
  end_date: string;
  note?: string | null;
}

export interface ReservationConflict {
  kind: 'reservation' | 'maintenance';
  id: number;
  start_date: string;
  /** null for maintenance in progress, which has no known end yet. */
  end_date: string | null;
  status: string;
}

export interface AlternativeEquipment {
  id: number;
  name: string;
  type: string;
  status: 'available' | 'reserved';
  hourly_cost: number;
}

export interface ReservationConflictBody {
  detail: string;
  conflicts: ReservationConflict[];
  alternatives: AlternativeEquipment[];
}
