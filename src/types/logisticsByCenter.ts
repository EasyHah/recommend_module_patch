export interface CenterFocusedHub {
  code: string;
  name: string;
  phones: string[];
  regions: string[];
  rawLines: string[];
}

export interface CenterFocusedCenter {
  key: string;       // 主键: 例如 "2号分拣中心"
  rawTitle: string;  // 原始标题
  hubCount: number;
  hubs: CenterFocusedHub[];
}

export interface CenterFocusedDataFile {
  schemaVersion: number;
  generatedAt: string;
  centers: CenterFocusedCenter[];
}
