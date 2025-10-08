import type { Query, Vendor, MatchItem, LatLng } from '@/types/recommend';
const toRad=(d:number)=>d*Math.PI/180; 
export const haversine=(a:LatLng,b:LatLng)=>{const R=6371;const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng),lat1=toRad(a.lat),lat2=toRad(b.lat);const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
const clamp=(x:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));

// === 线路城市解析与匹配增强 ===
// 解析 route 字段中出现的城市 / 地名（中文连续字符段），带简单标准化
function extractRouteCities(route?:string):string[]{
	if(!route) return []
	const cacheKey='__parsedRouteCities'
	// 尝试缓存（直接挂到字符串不行，挂 vendor 外部实现；这里留接口）
	// 清理常见分隔符为统一空格
	const cleaned = route
		.replace(/<->|->|－|—|--|至|到|→/g,' ') // 分隔符替换
		.replace(/[,/、|]/g,' ') // 其它分隔符
	const tokens = cleaned.match(/[\u4e00-\u9fa5]{2,}/g) || []
	return Array.from(new Set(tokens.map(normCity)))
}
function normCity(c:string):string{ return c.replace(/(省|市|区|县|盟|自治州|地区)$/,'').trim() }
interface RouteMatchInfo{ originMatched:boolean; destMatched:boolean; any:boolean; }
function computeRouteMatch(q:Query,v:Vendor):RouteMatchInfo{
	const cities = (v as any)._routeCities || ((v as any)._routeCities = extractRouteCities(v.route))
	const oName = normMaybe((q as any).fromCityName || (q as any).originCity || '')
	const dName = normMaybe((q as any).toCityName || (q as any).destinationCity || '')
	let originMatched=false,destMatched=false
	if(oName && cities.includes(oName)) originMatched=true
	if(dName && cities.includes(dName)) destMatched=true
	return { originMatched, destMatched, any: originMatched||destMatched }
}
function normMaybe(s:string){return s? normCity(s): s}

export function hardCheck(q:Query,v:Vendor,d:number){
	const r:string[]=[]
	// 重量/类型/温控
	if(q.demand.weightKg>v.capabilities.maxWeightKg)r.push(`重量超过上限(${v.capabilities.maxWeightKg}kg)`)
	if(!v.capabilities.types.includes(q.demand.type))r.push(`不支持类型 ${q.demand.type}`)
	if(q.demand.type==='cold'){
		const c=v.capabilities.cold,t=q.demand.temperature
		if(!c||!t)r.push('冷链/温控能力缺失'); else if(t[0]<c.min||t[1]>c.max)r.push(`温区不覆盖(${c.min}~${c.max}℃)`)
	}
	// 路线匹配放宽服务半径：若线路城市同时匹配 起点+终点，则忽略距离限制；若部分匹配，放宽 1.5 倍
	const routeMatch = computeRouteMatch(q,v)
	const effectiveRadius = routeMatch.originMatched && routeMatch.destMatched ? Infinity : routeMatch.any ? v.serviceRadiusKm*1.5 : v.serviceRadiusKm
	if(d>effectiveRadius) r.push(`超出服务半径(${v.serviceRadiusKm}km)`)
	return { ok: r.length===0, reasons: r }
}

export function softScore(q:Query,v:Vendor,d:number){
	const S_dist=1-clamp(d/50)
	const S_rate=v.metrics.rating/5
	const S_otd=clamp(v.metrics.onTimeRate)
	const S_price=clamp(1.2-v.metrics.priceIndex,0,1)
	const S_cap=1-clamp(v.metrics.capacityUtilization)
	// 线路强匹配加成：如果同时匹配起点+终点，整体乘 1.05；部分匹配 1.02
	const routeMatch = computeRouteMatch(q,v)
	let base = (.25*S_dist+.25*S_otd+.2*S_price+.2*S_rate+.1*S_cap)
	if(routeMatch.originMatched && routeMatch.destMatched) base*=1.05
	else if(routeMatch.any) base*=1.02
	return Math.round(100*base)
}

export function bucketize(q:Query,v:Vendor,d:number){
	const b:string[]=[]
	if(d<=10)b.push('就近优先')
	if(v.capabilities.cold&&v.capabilities.types.includes('cold'))b.push('冷链认证')
	if(v.capabilities.maxWeightKg>=10000)b.push('大吨位')
	if(v.metrics.priceIndex<0.9)b.push('价格友好')
	if(v.metrics.rating>=4.5)b.push('高评分')
	const routeMatch = computeRouteMatch(q,v)
	if(routeMatch.originMatched && routeMatch.destMatched) b.push('线路匹配')
	else if(routeMatch.any) b.push('部分线路覆盖')
	return b
}

export function matchVendors(q:Query,vs:Vendor[]):MatchItem[]{
	return vs.map(v=>{
		const d=haversine(q.origin,v.location)
		const {ok,reasons}=hardCheck(q,v,d)
		const score=ok?softScore(q,v,d):0
		const buckets=bucketize(q,v,d)
		return { vendor:v, distanceKm:Math.round(d*10)/10, feasible:ok, reasons, buckets, score }
	}).sort((a,b)=>b.score-a.score)
}
