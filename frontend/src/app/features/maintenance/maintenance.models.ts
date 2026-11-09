// Mirrors backend/app/modules/maintenance/models.py until the maintenance API schemas exist.
// Update this file to match the response schemas when they land (docs/API_CONVENTIONS.md).

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
}

export interface InterventionPart {
  id: number;
  intervention_id: number;
  name: string;
  qty: number;
  /** RON. */
  unit_cost: number;
}
