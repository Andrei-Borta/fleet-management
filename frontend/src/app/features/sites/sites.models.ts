export interface Site {
  id: number;
  name: string;
  address: string;
  budget: number;
  start_date: string;
  end_date: string;
}

export type SiteCreate = Omit<Site, 'id'>;
export type SiteUpdate = Partial<SiteCreate>;
