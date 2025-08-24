export type LayerType = 'tileset' | 'geojson';
export type Domain = 'surface' | 'underground' | 'geology';

export interface BaseLayerDef {
  id: string;
  name: string;
  type: LayerType;
  domain: Domain;
  visible: boolean;
  legendColor?: string;
  filters?: {
    typeField?: string;
    timeField?: string;
    statusField?: string;
  };
}

export interface TilesetLayerDef extends BaseLayerDef {
  type: 'tileset';
  url: string;
  highlightProp?: string;
}

export interface GeoJsonLayerDef extends BaseLayerDef {
  type: 'geojson';
  url: string;
  idField?: string;
}

export type LayerDef = TilesetLayerDef | GeoJsonLayerDef;

export const surfaceLayers: LayerDef[] = [
  {
    id: 'green',
    name: '绿化',
    type: 'geojson',
    domain: 'surface',
    url: '/data/geojson/green.geojson',
    visible: true,
    legendColor: '#7ac77a',
    filters: { typeField: 'type', timeField: 'year', statusField: 'status' },
    idField: 'gid'
  }
];

export const undergroundLayers: LayerDef[] = [
  {
    id: 'water',
    name: '给水',
    type: 'geojson',
    domain: 'underground',
    url: '/data/geojson/pipe_water.geojson',
    visible: true,
    legendColor: '#3db7ff',
    filters: { typeField: 'pipeType', timeField: 'install', statusField: 'state' },
    idField: 'pid'
  },
  {
    id: 'power',
    name: '电力',
    type: 'geojson',
    domain: 'underground',
    url: '/data/geojson/pipe_power.geojson',
    visible: false,
    legendColor: '#ffb400',
    filters: { typeField: 'voltage', timeField: 'install', statusField: 'state' },
    idField: 'pid'
  },
  {
    id: 'gas',
    name: '燃气',
    type: 'geojson',
    domain: 'underground',
    url: '/data/geojson/pipe_gas.geojson',
    visible: false,
    legendColor: '#ff7a7a',
    filters: { typeField: 'grade', timeField: 'install', statusField: 'state' },
    idField: 'pid'
  },
  {
    id: 'comm',
    name: '通信',
    type: 'geojson',
    domain: 'underground',
    url: '/data/geojson/pipe_comm.geojson',
    visible: false,
    legendColor: '#b07aff',
    filters: { typeField: 'carrier', timeField: 'install', statusField: 'state' },
    idField: 'pid'
  }
];

export const geologyLayers: LayerDef[] = [
  {
    id: 'strata',
    name: '地质层',
    type: 'geojson',
    domain: 'geology',
    url: '/data/geojson/geology_strata.geojson',
    visible: false,
    legendColor: '#d9b382',
    filters: { typeField: 'layer', timeField: 'year', statusField: 'status' },
    idField: 'layer'
  }
];

export const ALL_LAYERS: LayerDef[] = [
  ...surfaceLayers, ...undergroundLayers, ...geologyLayers
];

export type Mode = 'surface' | 'underground' | 'both';

export function layersByMode(mode: Mode): LayerDef[] {
  if (mode === 'surface') return surfaceLayers;
  if (mode === 'underground') return undergroundLayers;
  return ALL_LAYERS;
}