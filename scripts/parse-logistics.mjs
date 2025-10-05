#!/usr/bin/env node
/**
 * 目的: 将提供的杂乱 CSV (含大量空列、合并含义、多行备注) 转换为结构化 JSON。
 * 用法: node scripts/parse-logistics.mjs <inputCsv> <outputJson>
 * 假设: 第一块数据描述一个总体分拨中心及其编号 -> 名称映射，后续块包含更多线路说明。
 * 策略: 按行读取; 去除包裹引号; 过滤全空; 对包含 "分拣" / "分拨" / 编号(\d+号) 的单元格解析。
 */
import fs from 'fs';
import path from 'path';

if (process.argv.length < 4) {
  console.error('Usage: node scripts/parse-logistics.mjs <inputCsv> <outputJson>');
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

function readRawLines(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return raw.split(/\r?\n/).map(l => l.trimEnd());
}

function cleanCell(c) {
  if (!c) return '';
  const trimmed = c.trim().replace(/^"|"$/g, '');
  return trimmed.replace(/\s+/g, ' ').trim();
}

// 结构定义
/** 数据结构 (输出 schemaVersion=1)
 * Center {
 *   id?: string  // 规范化英文+数字
 *   title: string
 *   hubs: Hub[]
 * }
 * Hub {
 *   code: string
 *   name: string            // 精简后的主要名称/地区
 *   regions?: string[]      // 解析出的区域列表
 *   phones?: string[]       // 电话号码集合
 *   raw?: string            // 原始合并文本(调试)
 * }
 */

function normalizeCenterTitle(title) {
  return title.replace(/\s+/g, ' ').replace(/（/g, '(').replace(/）/g, ')');
}

const phoneRegex = /(\d{3,4}[- ]?\d{5,8}|1[3-9]\d{9})/g;

function extractPhones(text) {
  const set = new Set();
  let m; while ((m = phoneRegex.exec(text))) { set.add(m[0].replace(/\s+/g,'').replace(/-/g,'')); }
  return [...set];
}

function splitRegions(text) {
  // 将一串地区用常见分隔符切分
  return text.split(/[ ,;\/->←↔\n\r]+/).map(r=>r.trim()).filter(r=>r && !/(电话|服务|业务|专线)/.test(r));
}

function compactName(name){
  return name.replace(/(落货|分拣|分拨|中心|物流)/g,'').replace(/\s+/g,' ').trim();
}

function parse(lines) {
  const centers = [];
  let currentCenter = null;
  const centerKeyword = /(分拣中心|分拨中心)/;

  function ensureCenter(title) {
    if (!currentCenter || currentCenter.title !== title) {
      currentCenter = { title, id: title.replace(/[^A-Za-z0-9一-龥]+/g,'_'), hubs: [] };
      centers.push(currentCenter);
    }
  }

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',').map(cleanCell);
    const nonEmpty = cols.filter(Boolean);
    if (!nonEmpty.length) continue;
    const joined = nonEmpty.join(' ');

    // 新中心 (独占一列)
    if (/(中心)/.test(joined) && /分拣/.test(joined) && nonEmpty.length === 1) {
      ensureCenter(normalizeCenterTitle(joined));
      continue;
    }

    // 行包含中心关键字 -> 第一列中心名称 + 后续 hubs
    if (nonEmpty.some(c => centerKeyword.test(c))) {
      const baseName = normalizeCenterTitle(nonEmpty[0]);
      ensureCenter(baseName);
      for (let i=1;i<nonEmpty.length;i++) {
        const cell = nonEmpty[i];
        const m = cell.match(/(\d+)[号#]?\s*(.*)/);
        if (m) {
          const raw = cell;
          const name = compactName(m[2]);
          currentCenter.hubs.push({ code: m[1], name, raw });
        }
      }
      continue;
    }

    // 解析含多编号的自由文本
    if (/\d+号/.test(joined) && currentCenter) {
      // 按 "<code>号" 分割保持顺序
      const segments = joined.split(/(?=\d+号)/).map(s=>s.trim()).filter(Boolean);
      for (const seg of segments) {
        const m = seg.match(/(\d+)号\s*(.*)/);
        if (m) {
          const rest = m[2];
          const phones = extractPhones(seg);
          const regions = splitRegions(rest).slice(0,15); // 限制长度
          const name = compactName(regions[0] || rest.split(/[\s,]/)[0] || '');
          currentCenter.hubs.push({ code: m[1], name, regions, phones: phones.length?phones:undefined, raw: seg });
        }
      }
      continue;
    }

    // 单一模式: "16号 临朐落货分拣"
    if (/^\d+号/.test(nonEmpty[0]) && currentCenter) {
      const m = nonEmpty[0].match(/(\d+)号\s*(.*)/);
      if (m) {
        const name = compactName(m[2]);
        currentCenter.hubs.push({ code: m[1], name, raw: nonEmpty[0] });
      }
      continue;
    }

    // 如果包含电话但是没有编号, 追加到最近 hub 的 raw/phones/regions
    if (/电话|业务|服务|专线/.test(joined) && currentCenter && currentCenter.hubs.length) {
      const last = currentCenter.hubs[currentCenter.hubs.length-1];
      const phones = extractPhones(joined);
      if (phones.length) last.phones = Array.from(new Set([...(last.phones||[]), ...phones]));
      const regs = splitRegions(joined).filter(r=>!/^(\d{3,}|1[3-9]\d{9})$/.test(r));
      if (regs.length) last.regions = Array.from(new Set([...(last.regions||[]), ...regs]));
      last.raw += ' | '+joined;
      continue;
    }
  }

  // 清洗: 去除空 name, 合并相同 code 的连续条目
  for (const c of centers) {
    const merged = [];
    for (const hub of c.hubs) {
      if (!hub.name && !hub.regions) continue;
      const prev = merged.length?merged[merged.length-1]:null;
      if (prev && prev.code === hub.code) {
        // merge
        prev.raw += ' || '+hub.raw;
        if (hub.regions) prev.regions = Array.from(new Set([...(prev.regions||[]), ...hub.regions]));
        if (hub.phones) prev.phones = Array.from(new Set([...(prev.phones||[]), ...hub.phones]));
        if (hub.name && prev.name !== hub.name) {
          // 保留更长描述
            if (hub.name.length > prev.name.length) prev.name = hub.name;
        }
      } else {
        merged.push(hub);
      }
    }
    c.hubs = merged;
  }
  return { schemaVersion:1, generatedAt: new Date().toISOString(), centers };
}

const lines = readRawLines(inputPath);
const result = parse(lines);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(`Parsed centers: ${result.length}`);
let hubCount = 0; result.centers.forEach(c => hubCount += c.hubs.length);
console.log(`Total hubs: ${hubCount}`);
