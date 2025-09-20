export type LatLng={lat:number;lng:number};
export interface Query{origin:LatLng;destination:LatLng;window:[string,string];demand:{type:'normal'|'cold'|'hazmat'|'fragile';weightKg:number;temperature?:[number,number]|null};}
export interface Vendor{ id:string; name:string; location:LatLng; serviceRadiusKm:number; capabilities:{types:Array<'normal'|'cold'|'hazmat'|'fragile'>;maxWeightKg:number;cold?:{min:number;max:number}|null;certifications?:string[]}; metrics:{rating:number;onTimeRate:number;priceIndex:number;capacityUtilization:number}; tags?:string[]; }
export interface MatchItem{vendor:Vendor;distanceKm:number;feasible:boolean;reasons:string[];buckets:string[];score:number;}

// 路线评估指标（最小定义，覆盖现有用例）
export interface RouteMetrics{
	distanceKm:number;
	durationMin:number;
	waypoints?:LatLng[];
	// 允许扩展其他字段
	[k:string]:unknown;
}
