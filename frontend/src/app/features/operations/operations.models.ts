export interface UsageCreate {
  equipment_id: number;
  site_id: number;
  date: string;
  hours: number;
  fuel_liters: number;
}

export interface UsageRead {
  id: number;
  equipment_id: number;
  site_id: number;
  date: string;
  hours: number;
  fuel_liters: number;
}

export interface UsageSummaryRead {
  items: UsageRead[];
  total_hours: number;
  total_fuel_liters: number;
}

export interface ChecklistItemCreate {
  name: string;
  ok: boolean;
  critical: boolean;
}

export interface ChecklistItemRead {
  id: number;
  name: string;
  ok: boolean;
  critical: boolean;
}

export interface ChecklistCreate {
  equipment_id: number;
  date: string;
  items: ChecklistItemCreate[];
}

export interface ChecklistRead {
  id: number;
  equipment_id: number;
  date: string;
  items: ChecklistItemRead[];
}
