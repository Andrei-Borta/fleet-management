/** Mirrors backend/app/modules/dashboard/schemas.py. Money is RON. */
export interface SiteCost {
  site_id: number;
  site_name: string;
  budget: number;
  equipment_cost: number;
  maintenance_cost: number;
  spent: number;
  remaining: number;
  percent_used: number;
  over_budget: boolean;
}
export interface SiteCostsReport {
  sites: SiteCost[];
}
