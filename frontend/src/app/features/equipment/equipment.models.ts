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

/**
 * Statuses the API accepts when writing. `defective` and `in_service` are set by the maintenance
 * logic and `reserved` is derived from approved reservations; sending them returns 422.
 */
export type EquipmentWritableStatus = Extract<EquipmentStatus, 'available' | 'retired'>;

/** `status` defaults to `available`, `engine_hours` to 0 and the optional fields to null. */
export type EquipmentCreate = Pick<Equipment, 'name' | 'type' | 'serial_no' | 'hourly_cost'> &
  Partial<Omit<Equipment, 'id' | 'name' | 'type' | 'serial_no' | 'hourly_cost' | 'status'>> & {
    status?: EquipmentWritableStatus;
  };

/**
 * PATCH body: send only the changed fields. The optional fields may be set to null. Retiring
 * equipment that has an approved reservation ending today or later returns 409, and so does
 * setting `defective` or `in_service` equipment to `available`.
 */
export type EquipmentUpdate = Partial<Omit<Equipment, 'id' | 'status'>> & {
  status?: EquipmentWritableStatus;
};

/** Query parameters of `GET /equipment`. `available_from` and `available_to` go together. */
export interface EquipmentFilters {
  type?: string;
  status?: EquipmentStatus;
  /** ISO date; equipment must be free from this day (inclusive). */
  available_from?: string;
  /** ISO date; equipment must be free until this day (inclusive). */
  available_to?: string;
}
