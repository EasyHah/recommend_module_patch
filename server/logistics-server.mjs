// Simple logistics CRUD API Server
// Endpoints:
//  GET    /api/logistics/centers        -> list centers (id,title,hubCount)
//  GET    /api/logistics/centers/:id    -> get single center detail
//  GET    /api/logistics/hubs/:centerId/:code -> get a single hub
//  POST   /api/logistics/hubs           -> create/update hub { centerId, code, name, regions, phones, company }
//  PATCH  /api/logistics/hubs/:centerId/:code -> partial update
//  DELETE /api/logistics/hubs/:centerId/:code -> delete
//  GET    /api/logistics/search?q=xxx   -> search hubs by code/name/region/company/phone
// Data persisted to ./src/data/logistics-editable.json (separate from original parse result)

import http from 'node:http';
import url from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.LOGISTICS_PORT ? Number(process.env.LOGISTICS_PORT) : 3001;

// File paths
const baseDataPath = path.join(__dirname, '..', 'src', 'data', 'logistics.json');
const editablePath = path.join(__dirname, '..', 'src', 'data', 'logistics-editable.json');

function loadBase() {
  try { return JSON.parse(fs.readFileSync(baseDataPath,'utf8')); } catch { return { centers: [] }; }
}
function loadEditable() {
  try { return JSON.parse(fs.readFileSync(editablePath,'utf8')); } catch { return { centers: [] }; }
}
function saveEditable(data) {
  fs.writeFileSync(editablePath, JSON.stringify(data, null, 2), 'utf8');
}

// Merge base + editable (editable overrides matching centerId & hub code)
function buildModel() {
  const base = loadBase();
  const edit = loadEditable();
  const centerMap = new Map();
  for (const c of base.centers || []) centerMap.set(c.id || c.title, JSON.parse(JSON.stringify(c)));
  for (const c of edit.centers || []) {
    const key = c.id || c.title;
    if (!centerMap.has(key)) centerMap.set(key, { title: c.title, id: c.id || key, hubs: [] });
    const target = centerMap.get(key);
    const hubMap = new Map(target.hubs.map(h => [h.code, h]));
    for (const h of c.hubs || []) {
      hubMap.set(h.code, { ...hubMap.get(h.code), ...h });
    }
    target.hubs = [...hubMap.values()];
  }
  return { centers: [...centerMap.values()] };
}

function parseBody(req) {
  return new Promise(resolve => {
    let buf='';
    req.on('data', chunk => buf += chunk);
    req.on('end', () => {
      try { resolve(buf?JSON.parse(buf):{}); } catch { resolve({}); }
    });
  });
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

function notFound(res) { send(res, 404, { code:404, message:'Not Found' }); }

function ensureEditableContainer(editData, centerId, title) {
  let center = (editData.centers || []).find(c => (c.id||c.title) === centerId);
  if (!center) {
    center = { id: centerId, title: title || centerId, hubs: [] };
    editData.centers.push(center);
  }
  return center;
}

function upsertHub(editData, centerId, centerTitle, hub) {
  const center = ensureEditableContainer(editData, centerId, centerTitle);
  const idx = center.hubs.findIndex(h => h.code === hub.code);
  if (idx >= 0) center.hubs[idx] = { ...center.hubs[idx], ...hub };
  else center.hubs.push(hub);
}

const server = http.createServer(async (req,res) => {
  const parsed = url.parse(req.url, true);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }

  if (!parsed.pathname.startsWith('/api/logistics')) return notFound(res);

  const model = buildModel();
  const editData = loadEditable();

  // List centers
  if (req.method === 'GET' && parsed.pathname === '/api/logistics/centers') {
    const result = model.centers.map(c => ({ id: c.id || c.title, title: c.title, hubCount: c.hubs.length }));
    return send(res, 200, { code:0, centers: result });
  }

  // Get single center
  const centerMatch = parsed.pathname.match(/^\/api\/logistics\/centers\/([^\/]+)$/);
  if (req.method === 'GET' && centerMatch) {
    const cid = decodeURIComponent(centerMatch[1]);
    const center = model.centers.find(c => (c.id||c.title) === cid);
    if (!center) return send(res,404,{code:404,message:'Center not found'});
    return send(res,200,{code:0, center});
  }

  // Get single hub
  const hubGetMatch = parsed.pathname.match(/^\/api\/logistics\/hubs\/([^\/]+)\/([^\/]+)$/);
  if (req.method === 'GET' && hubGetMatch) {
    const cid = decodeURIComponent(hubGetMatch[1]);
    const code = decodeURIComponent(hubGetMatch[2]);
    const center = model.centers.find(c => (c.id||c.title) === cid);
    if (!center) return send(res,404,{code:404,message:'Center not found'});
    const hub = center.hubs.find(h => h.code === code);
    if (!hub) return send(res,404,{code:404,message:'Hub not found'});
    return send(res,200,{code:0, hub, center:{ id:center.id||center.title, title:center.title }});
  }

  // Search
  if (req.method === 'GET' && parsed.pathname === '/api/logistics/search') {
    const q = String(parsed.query.q||'').trim().toLowerCase();
    if (!q) return send(res,200,{code:0, results:[]});
    const results = [];
    for (const c of model.centers) {
      for (const h of c.hubs) {
        const regionStr = (h.regions||[]).join(' ').toLowerCase();
        const phoneStr = (h.phones||[]).join(' ');
        const company = (h.company||'').toLowerCase();
        if (h.code === q || h.name.toLowerCase().includes(q) || regionStr.includes(q) || company.includes(q) || phoneStr.includes(q)) {
          results.push({ centerId: c.id||c.title, centerTitle: c.title, code: h.code, name: h.name, company: h.company||null });
          if (results.length >= 200) break;
        }
      }
      if (results.length >= 200) break;
    }
    return send(res,200,{code:0, results});
  }

  // Create / Update hub (full upsert)
  if (req.method === 'POST' && parsed.pathname === '/api/logistics/hubs') {
    const body = await parseBody(req);
    const { centerId, centerTitle, code, name, regions, phones, company } = body;
    if (!centerId || !code || !name) return send(res,400,{code:400,message:'centerId, code, name required'});
    upsertHub(editData, centerId, centerTitle||centerId, {
      code: String(code),
      name: String(name),
      regions: Array.isArray(regions)?regions:undefined,
      phones: Array.isArray(phones)?phones:undefined,
      company: company?String(company):undefined,
      updatedAt: new Date().toISOString()
    });
    saveEditable(editData);
    return send(res,200,{code:0,message:'saved'});
  }

  // Partial update hub
  const hubPatchMatch = parsed.pathname.match(/^\/api\/logistics\/hubs\/([^\/]+)\/([^\/]+)$/);
  if (req.method === 'PATCH' && hubPatchMatch) {
    const cid = decodeURIComponent(hubPatchMatch[1]);
    const hubCode = decodeURIComponent(hubPatchMatch[2]);
    const body = await parseBody(req);
    if (!cid || !hubCode) return send(res,400,{code:400,message:'cid & code required'});
    // Load merged to confirm existence
    const mergedCenter = model.centers.find(c => (c.id||c.title) === cid);
    if (!mergedCenter) return send(res,404,{code:404,message:'Center not found'});
    const existing = mergedCenter.hubs.find(h => h.code === hubCode);
    if (!existing) return send(res,404,{code:404,message:'Hub not found'});
    // Apply patch into editable record
    upsertHub(editData, cid, mergedCenter.title, {
      code: hubCode,
      name: body.name ? String(body.name) : existing.name,
      regions: body.regions ? body.regions : existing.regions,
      phones: body.phones ? body.phones : existing.phones,
      company: body.company ? String(body.company) : existing.company,
      updatedAt: new Date().toISOString()
    });
    saveEditable(editData);
    return send(res,200,{code:0,message:'updated'});
  }

  // Delete hub
  if (req.method === 'DELETE' && hubPatchMatch) {
    const cid = decodeURIComponent(hubPatchMatch[1]);
    const hubCode = decodeURIComponent(hubPatchMatch[2]);
    const center = editData.centers.find(c => (c.id||c.title) === cid);
    if (!center) return send(res,404,{code:404,message:'Center not editable'});
    const idx = center.hubs.findIndex(h => h.code === hubCode);
    if (idx < 0) return send(res,404,{code:404,message:'Hub not found in editable layer'});
    center.hubs.splice(idx,1);
    saveEditable(editData);
    return send(res,200,{code:0,message:'deleted'});
  }

  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`[Logistics Server] listening on http://localhost:${PORT}`);
});
