// Defects mirror the database model until the defect API schemas exist.

export type DefectSeverity = 'low' | 'medium' | 'critical';
export type DefectStatus = 'open' | 'resolved';

export interface Defect {
  id: number;
  equipment_id: number;
  description: string;
  severity: DefectSeverity;
  status: DefectStatus;
  /** UTC ISO datetime. */
  reported_at: string;
  resolved_at: string | null;
}

export type InterventionKind = 'repair' | 'revision';
export type InterventionStatus = 'planned' | 'in_progress' | 'done';

export interface Intervention {
  id: number;
  equipment_id: number;
  defect_id: number | null;
  description: string;
  kind: InterventionKind;
  /** ISO date. */
  scheduled_date: string;
  status: InterventionStatus;
  /** UTC ISO datetime. */
  started_at: string;
  completed_at: string | null;
  labor_hours: number;
  /** RON per labour hour. */
  labor_rate: number;
  parts: InterventionPart[];
  /** Parts and labour cost in RON, rounded to two decimals. */
  total_cost: number;
}

export interface InterventionCreate {
  equipment_id: number;
  defect_id?: number | null;
  description?: string;
  kind: InterventionKind;
  scheduled_date: string;
  labor_hours?: number;
  labor_rate?: number;
}

export interface InterventionUpdate {
  status?: InterventionStatus;
  labor_hours?: number;
  labor_rate?: number;
}

export type InterventionPartCreate = Pick<InterventionPart, 'name' | 'qty' | 'unit_cost'>;

export interface InterventionPart {
  id: number;
  intervention_id: number;
  name: string;
  qty: number;
  /** RON. */
  unit_cost: number;
}
