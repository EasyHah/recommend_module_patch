export interface LogisticsHub {
  code: string;
  name: string;
  regions?: string[];
  phones?: string[];
  raw?: string;
}

export interface LogisticsCenter {
  id?: string;
  title: string;
  hubs: LogisticsHub[];
}

export interface LogisticsDataFile {
  schemaVersion: number;
  generatedAt: string;
  centers: LogisticsCenter[];
}
