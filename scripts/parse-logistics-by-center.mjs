#!/usr/bin/env node
/**
 * 只聚焦形如 "XX号分拣中心" 的中心，以及该中心内出现的 "N号" 仓库记录。
 * 主键: centerKey = "XX号分拣中心" 完整文本（去除空格统一格式）
 * 输出结构: { schemaVersion:1, centers: [{ key, rawTitle, hubs:[{ code, name, rawLines, phones, regions }] }] }
 * 解析逻辑: 
 *  1. 扫描每行，若某单元格匹配 /(\d+号)分拣中心/ 认为是中心标题。记录当前中心。
 *  2. 在当前中心上下文内，搜集包含 "(\d+)号" 的片段，解析为 hub。名称为编号后到行尾或下一个编号前的中文/字母串。
 *  3. 电话用 /(1[3-9]\d{9}|\d{3,4}[- ]?\d{5,8})/ 识别；区域切分用常用分隔符。
 *  4. 同一编号多次出现合并 (phones/regions/rawLines 追加去重)。
 */
import fs from 'fs';
import path from 'path';

if (process.argv.length < 4) {
  console.error('Usage: node parse-logistics-by-center.mjs <inputCsv> <outputJson>');
  process.exit(1);
}

const input = process.argv[2];
const output = process.argv[3];

const raw = fs.readFileSync(input,'utf8');
const lines = raw.split(/\r?\n/);

// 识别 1~8号 分拣/分拨 中心 (允许 "分拨中心" or "分拣中心")
const centerTitleRegex = /([1-8]号)(分拣|分拨)中心/;
// 括号形式，例如：山东鑫鲁顺金亮物流（2号分拣中心）
const bracketCenterRegex = /（([1-8]号)(分拣|分拨)中心）/;
const hubCodeRegexGlobal = /(\d+)号/g; // to split hubs in lines
const phoneRegex = /(1[3-9]\d{9}|\d{3,4}[- ]?\d{5,8})/g;

function normalizeCenterKey(t){
  return t.replace(/\s+/g,'').trim();
}

function extractPhones(text){
  const set = new Set();
  let m; while ((m = phoneRegex.exec(text))) { set.add(m[0].replace(/\s+/g,'').replace(/-/g,'')); }
  return [...set];
}

function extractRegions(text){
  const rawParts = text
    .split(/[\s,;，；\/→<>\-\n\r]+/)
    .map(s=>s.trim())
    .filter(Boolean);
  const out = [];
  const ban = /(电话|业务|服务|中心|分拣)/;
  for (const p of rawParts) {
    if (ban.test(p)) continue;
    if (/^(\d+)号$/.test(p)) continue;
    if (/^(1[3-9]\d{9}|\d{3,4}[-]?\d{5,8})$/.test(p)) continue;
    if (!out.includes(p)) out.push(p);
    if (out.length >= 50) break;
  }
  return out;
}

const centers = new Map(); // key -> { key, rawTitle, centerNumber, hubs: Map(code -> hub) }
let currentCenter = null;

for (const line of lines) {
  if (!line.trim()) continue;
  const cells = line.split(',').map(c=>c.trim().replace(/^"|"$/g,''));
  for (const cell of cells) {
    if (!cell) continue;
    const mt = cell.match(centerTitleRegex);
    if (mt) {
      const rawTitle = cell.trim();
      const centerNumber = mt[1].replace('号','');
      const key = normalizeCenterKey(mt[0]);
      if (!centers.has(key)) centers.set(key, { key, rawTitle, centerNumber, hubs: new Map() });
      currentCenter = centers.get(key);
      break; // 一行内优先以第一个匹配为中心
    }
    const mb = cell.match(bracketCenterRegex);
    if (mb) {
      const rawTitle = cell.trim();
      const centerNumber = mb[1].replace('号','');
      const inner = mb[0].slice(1,-1); // 去掉外括号
      const key = normalizeCenterKey(inner);
      if (!centers.has(key)) centers.set(key, { key, rawTitle, centerNumber, hubs: new Map() });
      currentCenter = centers.get(key);
      break;
    }
  }
  if (!currentCenter) continue;

  // 收集当前行中的 hub 片段
  const joined = cells.join(' ');
  if (!/(\d+)号/.test(joined)) continue; // 没有编号跳过

  // 将行按编号切割
  const segments = joined.split(/(?=(\d+(?:-\d+)?)号)/).map(s=>s.trim()).filter(Boolean);
  for (const seg of segments) {
    const m = seg.match(/^(\d+(?:-\d+)?)号\s*(.*)/);
    if (!m) continue;
    const codeRaw = m[1];
    // 展开区间 code 如 15-17 -> 15,16,17
    const codes = codeRaw.includes('-') ? (()=>{ const [a,b] = codeRaw.split('-').map(n=>parseInt(n,10)); if (isNaN(a)||isNaN(b)||a>b) return [codeRaw]; const arr=[]; for(let x=a;x<=b;x++) arr.push(String(x)); return arr; })() : [codeRaw];
    const tail = m[2].trim();
    const phones = extractPhones(seg);
    const regions = extractRegions(seg);
    // 名称 heuristics: tail 的第一段（去除明显区域串 & 电话）
    // 名称: 从 tail 中取第一个非空中文/字母连续串，剔除含“分拣/落货/中心/物流/号”
    let nameCandidate = '';
    const tokens = tail.split(/\s+/).map(t=>t.replace(/"/g,''));
    for (const tk of tokens) {
      const cleaned = tk.replace(/(分拣|落货|中心|物流)/g,'').trim();
      if (!cleaned) continue;
      if (/^\d+号$/.test(cleaned)) continue;
      nameCandidate = cleaned; break;
    }
    let name = nameCandidate || regions[0] || '';

    for (const code of codes) {
      // 跳过与中心编号相同的 code（中心自身编号，不作为仓库编号）
      if (code === currentCenter.centerNumber) continue;
      if (!currentCenter.hubs.has(code)) {
        currentCenter.hubs.set(code, { code, name, phones:[], regions:[], rawLines:[] });
      }
      const hub = currentCenter.hubs.get(code);
      if (name && name.length > hub.name.length) hub.name = name;
      if (!hub.rawLines.includes(seg)) hub.rawLines.push(seg);
      // 过滤纯数字或与编号重复的 region
      for (const p of phones) if (!hub.phones.includes(p)) hub.phones.push(p);
      for (const r of regions) {
        if (/^\d+$/.test(r)) continue;
        if (r.endsWith('号')) continue;
        if (!hub.regions.includes(r)) hub.regions.push(r);
      }
    }
  }
}

let out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  centers: [...centers.values()].map(c => ({
    key: c.key,
    rawTitle: c.rawTitle,
    hubCount: c.hubs.size,
    hubs: [...c.hubs.values()].sort((a,b)=>Number(a.code)-Number(b.code))
  }))
};

// 回填 1~8 号若缺失：扫描所有行中是否有孤立 "N号" 出现
const existingNums = new Set(out.centers.map(c => c.key.match(/([1-8])号/)?.[1]));
const needed = [1,2,3,4,5,6,7,8].filter(n => !existingNums.has(String(n)));
if (needed.length) {
  for (const n of needed) {
    const pattern = new RegExp(`(^|[^0-9])${n}号(?!.*(分拣中心|分拨中心))`);
    const hasStray = lines.some(L => pattern.test(L));
    if (hasStray) {
      out.centers.push({
        key: `${n}号分拣中心`,
        rawTitle: `${n}号分拣中心 (fallback)`,
        hubCount: 0,
        hubs: []
      });
    }
  }
}

// 按编号排序
out.centers.sort((a,b)=>Number(a.key.match(/([1-8])号/)?.[1]||0)-Number(b.key.match(/([1-8])号/)?.[1]||0));

fs.writeFileSync(output, JSON.stringify(out,null,2),'utf8');
console.log(`Parsed center-focused dataset: centers=${out.centers.length}`);
