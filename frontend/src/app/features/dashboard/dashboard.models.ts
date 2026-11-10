import { EquipmentStatus } from '../equipment/equipment.models';

/** Inclusive ISO calendar dates. */
export interface FleetPeriod {
  from: string;
  to: string;
}

export interface StatusCount {
  status: EquipmentStatus;
  count: number;
}

export interface TypeCount {
  type: string;
  count: number;
}

export interface EquipmentUtilization {
  equipment_id: number;
  name: string;
  type: string;
  reserved_days: number;
  period_days: number;
  utilization_percent: number;
}

/** Mirrors the response from GET /dashboard/fleet. */
export interface FleetStats {
  start_date: string;
  end_date: string;
  period_days: number;
  total_equipment: number;
  by_status: StatusCount[];
  by_type: TypeCount[];
  utilization: EquipmentUtilization[];
  top_used: EquipmentUtilization[];
  least_used: EquipmentUtilization[];
}
