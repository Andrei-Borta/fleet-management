// Mirrors the equipment response schemas in backend/app/modules/equipment/schemas.py.

export type EquipmentStatus = 'available' | 'reserved' | 'in_service' | 'defective' | 'retired';

export interface Equipment {
  id: number;
  name: string;
  type: string;
  /** Unique across the fleet. */
  serial_no: string;
  status: EquipmentStatus;
  engine_hours: number;
  /** RON per hour. */
  hourly_cost: number;
  service_interval_days: number | null;
  service_interval_hours: number | null;
  /** UTC ISO datetime. */
  last_service_at: string | null;
  last_service_hours: number | null;
}

/** `status` defaults to `available`, `engine_hours` to 0 and the optional fields to null. */
export type EquipmentCreate = Pick<Equipment, 'name' | 'type' | 'serial_no' | 'hourly_cost'> &
  Partial<Omit<Equipment, 'id' | 'name' | 'type' | 'serial_no' | 'hourly_cost'>>;

/** PATCH body: send only the changed fields. The optional fields may be set to null. */
export type EquipmentUpdate = Partial<Omit<Equipment, 'id'>>;

/** Query parameters of `GET /equipment`. `available_from` and `available_to` go together. */
export interface EquipmentFilters {
  type?: string;
  status?: EquipmentStatus;
  /** ISO date; equipment must be free from this day (inclusive). */
  available_from?: string;
  /** ISO date; equipment must be free until this day (inclusive). */
  available_to?: string;
}
