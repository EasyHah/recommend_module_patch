#!/usr/bin/env node
/**
 * 将 cleaned_warehouse_final_solution.csv 转换为 center-focused JSON
 * 输入列: 分拣中心, 序号, 物流, 线路/目的地, 电话
 * 输出: src/data/logistics-by-center.json (结构与现有 center-focused 基本兼容)
 * 规则:
 *  - centerKey: <N>号分拣中心 (去空格)
 *  - 序号: 形如 "20号" or "1-2号"; 去掉"号"; 区间展开为多个 code
 *  - name: 取 物流 (为空则取线路/目的地前 1 段); company 字段 = 物流
 *  - regions: 由 线路/目的地 分隔符切分 (空/标点过滤)
 *  - phones: 电话列按 / , 空格 及 ； ， 分割, 保留 7+ 位数字; 去重
 *  - 同一 center+code 多次出现: merge (company/name 合并去重, regions/phones/ rawLines 合并)
 */
import fs from 'fs';
import path from 'path';

if (process.argv.length < 3) {
  console.error('Usage: node scripts/import-cleaned-centers.mjs <cleanedCsv> [outputJson]');
  process.exit(1);
}

const inputCsv = process.argv[2];
const outputJson = process.argv[3] || 'src/data/logistics-by-center.json';

function readLines(p){ return fs.readFileSync(p,'utf8').split(/\r?\n/); }
function splitCsvLine(line){
  // 简单 CSV（无带引号逗号复杂情况）
  return line.split(',').map(c=>c.trim());
}

function normalizeCenter(raw){
  const m = raw.match(/(\d+)号/);
  if (!m) return raw.replace(/\s+/g,'');
  return m[1]+'号分拣中心';
}

function expandCodes(codeRaw){
  if (!codeRaw) return [];
  codeRaw = codeRaw.replace(/号/g,'').trim();
  if (/^\d+-\d+$/.test(codeRaw)) {
    const [a,b] = codeRaw.split('-').map(n=>parseInt(n,10));
    if (!isNaN(a) && !isNaN(b) && a<=b && b-a<=100) return Array.from({length:b-a+1},(_,i)=>String(a+i));
  }
  if (/^\d{1,3}$/.test(codeRaw)) return [codeRaw];
  // 可能包含多个以 - 或 / 组合: e.g. 34-36号 -> 已处理; 15-17号 -> handled; others keep digits groups
  return codeRaw.split(/[^0-9]+/).filter(Boolean);
}

function parseRegions(route){
  if (!route) return [];
  return route
    .replace(/[：:]/g,' ')
    .split(/[\s,/;，；<>→<-]+/)
    .map(r=>r.trim())
    .filter(r=>r && !/(专线|业务|客服|服务|电话)/.test(r) && !/^\d{3,}$/.test(r))
    .slice(0,40);
}

function parsePhones(phoneCol){
  if (!phoneCol) return [];
  return Array.from(new Set(
    phoneCol
      .split(/[\s,/;，；]+/)
      .map(p=>p.trim())
      .filter(p=>p && /\d/.test(p))
      .map(p=>p.replace(/[^0-9]/g,''))
      .filter(p=>p.length>=6)
  ));
}

const lines = readLines(inputCsv).filter(l=>l.trim());
const header = splitCsvLine(lines[0]);
// 简单头校验
if (!/分拣中心/.test(header[0]) || !/序号/.test(header[1])) {
  console.error('Unexpected header, got:', header);
}

const centersMap = new Map(); // centerKey -> { key, rawTitle, hubs: Map(code -> hub) }

for (let i=1;i<lines.length;i++){
  const line = lines[i];
  if (!line.trim()) continue;
  const cols = splitCsvLine(line);
  if (cols.length < 5) continue; // ensure columns
  const [centerCol, seqCol, logisticsCol, routeCol, phoneCol] = cols;
  if (!centerCol || !seqCol) continue;
  const centerKey = normalizeCenter(centerCol);
  if (!centersMap.has(centerKey)) centersMap.set(centerKey, { key:centerKey, rawTitle:centerCol.trim(), hubs:new Map() });
  const center = centersMap.get(centerKey);

  const codes = expandCodes(seqCol);
  if (!codes.length) continue;
  const company = logisticsCol.trim();
  const regions = parseRegions(routeCol);
  const phones = parsePhones(phoneCol);
  const rawLine = line.trim();

  for (const code of codes) {
    if (!center.hubs.has(code)) {
      center.hubs.set(code, { code, name: company || (regions[0]||''), company: company || undefined, regions:[...regions], phones:[...phones], rawLines:[rawLine] });
    } else {
      const hub = center.hubs.get(code);
      if (company) {
        if (!hub.company) hub.company = company; else if (!hub.company.includes(company)) hub.company += ' / '+company;
        if (!hub.name.includes(company)) hub.name += ' / '+company;
      }
      for (const r of regions) if (!hub.regions.includes(r)) hub.regions.push(r);
      for (const p of phones) if (!hub.phones.includes(p)) hub.phones.push(p);
      if (!hub.rawLines.includes(rawLine)) hub.rawLines.push(rawLine);
    }
  }
}

const out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  centers: [...centersMap.values()].map(c=>({
    key: c.key,
    rawTitle: c.rawTitle,
    hubCount: c.hubs.size,
    hubs: [...c.hubs.values()].sort((a,b)=>Number(a.code)-Number(b.code))
  })).sort((a,b)=>Number(a.key.match(/(\d+)号/)?.[1]||0)-Number(b.key.match(/(\d+)号/)?.[1]||0))
};

fs.mkdirSync(path.dirname(outputJson), { recursive:true });
fs.writeFileSync(outputJson, JSON.stringify(out,null,2),'utf8');
console.log(`Imported cleaned centers: ${out.centers.length}`);
let total=0; out.centers.forEach(c=> total+=c.hubCount); console.log('Total hubs:', total);
