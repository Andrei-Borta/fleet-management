// Mirrors backend/app/modules/equipment/models.py until the equipment API schemas exist.
// Update this file to match the response schemas when they land (docs/API_CONVENTIONS.md).

export type EquipmentStatus = 'available' | 'reserved' | 'in_service' | 'defective' | 'retired';

export interface Equipment {
  id: number;
  name: string;
  type: string;
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

export type EquipmentCreate = Omit<Equipment, 'id'>;
export type EquipmentUpdate = Partial<EquipmentCreate>;
