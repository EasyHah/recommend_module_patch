/**
 * 数值解析和处理工具函数
 */

/**
 * 将任意值解析为数字（去除单位与空白），失败则返回 NaN
 * @param {*} value - 要解析的值
 * @returns {number} 解析后的数字或NaN
 */
export function parseNumberLike(value) {
  if (value == null) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return NaN;
    
    // 去掉常见单位与中文描述
    const sanitized = trimmed
      .replace(/毫米|mm/gi, '')
      .replace(/厘米|cm/gi, '')
      .replace(/米|m/gi, '')
      .replace(/长度|管径|直径|起点埋|终点埋|口径|DN/gi, '')
      .replace(/[：:]/g, '')
      .replace(/[^0-9+\-.]/g, '') // 保留数字/+-/.
      .trim();
    const n = Number(sanitized);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * 从属性集合中按候选键读取数字；按需应用转换器
 * @param {Object} properties - 属性对象
 * @param {Array} candidateKeys - 候选属性键数组
 * @param {number} defaultValue - 默认值
 * @param {Function} transformFn - 转换函数
 * @returns {number} 解析后的数值
 */
export function getNumericProperty(properties, candidateKeys, defaultValue, transformFn) {
  if (!properties || !Array.isArray(candidateKeys)) {
    return defaultValue;
  }
  
  for (let i = 0; i < candidateKeys.length; i++) {
    const key = candidateKeys[i];
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      const raw = properties[key];
      let num = parseNumberLike(raw);
      if (!Number.isFinite(num)) continue;
      if (typeof transformFn === 'function') {
        num = transformFn(num, raw);
      }
      return num;
    }
  }
  return defaultValue;
}

/**
 * 解析埋深（单位：米）
 * @param {Object} properties - 属性对象
 * @param {Array} candidateKeys - 候选属性键数组
 * @param {number} fallbackMeters - 默认埋深（米）
 * @returns {number} 埋深值（米）
 */
export function parseDepthMeters(properties, candidateKeys, fallbackMeters) {
  const depthKeys = candidateKeys || ['起点埋', '起点埋深', 'startDepth', 'StartDepth'];
  const val = getNumericProperty(properties, depthKeys, undefined);
  
  if (!Number.isFinite(val)) {
    return Number.isFinite(fallbackMeters) ? fallbackMeters : 5.0;
  }
  
  let meters = val;
  // 转换规则：>50认为是毫米，>5认为是厘米
  if (meters > 50) meters = meters / 1000;      // 毫米 → 米
  else if (meters > 5) meters = meters / 100;   // 厘米 → 米
  
  // 合理范围：0.5-30米
  return Math.min(Math.max(meters, 0.5), 30.0);
}

/**
 * 解析管径（尽量转换为米）
 * @param {Object} properties - 属性对象
 * @param {Object} propertiesRaw - 原始属性对象
 * @param {number} fallbackRaw - 默认管径
 * @returns {number} 管径值（米）
 */
export function parseDiameterMeters(properties, propertiesRaw, fallbackRaw) {
  const candidateKeys = ['管径', '直径', '口径', 'diameter', 'Diameter', 'DIAMETER'];
  const val = getNumericProperty(properties, candidateKeys, undefined);
  
  // 解析 fallback：如果配置中给的是较大的数，按毫米/厘米规则估计
  let fallbackMeters = 0.2; // 安全默认 20cm
  if (Number.isFinite(fallbackRaw)) {
    if (fallbackRaw > 50) fallbackMeters = fallbackRaw / 1000; // mm→m
    else if (fallbackRaw > 5) fallbackMeters = fallbackRaw / 100; // cm→m
    else fallbackMeters = fallbackRaw; // m
  }

  // 优先用原始字符串解析，支持 200x200、300×400、DN300 等
  let primaryFromRaw = undefined;
  let rawUnitHint = '';
  for (const k of candidateKeys) {
    const raw = propertiesRaw && propertiesRaw[k];
    if (typeof raw === 'string') {
      rawUnitHint += raw;
      const matches = raw.match(/\d+(?:\.\d+)?/g);
      if (matches && matches.length > 0) {
        primaryFromRaw = Number(matches[0]); // 取第一个数字，如 200x200 取 200
        break;
      }
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      primaryFromRaw = raw;
      break;
    }
  }

  const base = Number.isFinite(primaryFromRaw) ? primaryFromRaw : val;
  if (!Number.isFinite(base)) return fallbackMeters;

  let meters = base;
  // 如果原始字符串中包含 DNxxx，优先认为是毫米
  for (const k of candidateKeys) {
    const raw = propertiesRaw && propertiesRaw[k];
    if (typeof raw === 'string' && /DN\s*\d+/i.test(raw)) {
      meters = base / 1000;
      break;
    }
  }
  
  // 单位转换逻辑
  if (/mm/i.test(rawUnitHint) || meters > 50) {
    meters = meters / 1000;      // 毫米 → 米
  } else if (/cm/i.test(rawUnitHint) || meters > 5) {
    meters = meters / 100;       // 厘米 → 米
  }
  
  // 合理范围夹紧：2cm ~ 2m
  meters = Math.min(Math.max(meters, 0.02), 2.0);
  return meters;
}

/**
 * 验证数组参数
 * @param {*} arr - 要验证的数组
 * @param {number} minLength - 最小长度
 * @param {string} paramName - 参数名称（用于错误消息）
 * @returns {boolean} 是否有效
 */
export function validateArray(arr, minLength = 1, paramName = 'array') {
  if (!Array.isArray(arr)) {
    console.warn(`${paramName}必须是数组类型`);
    return false;
  }
  
  if (arr.length < minLength) {
    console.warn(`${paramName}长度必须至少为${minLength}，当前长度为${arr.length}`);
    return false;
  }
  
  return true;
}

/**
 * 安全的数学计算
 * @param {Function} calculation - 计算函数
 * @param {*} defaultValue - 计算失败时的默认值
 * @param {string} operationName - 操作名称（用于错误日志）
 * @returns {*} 计算结果或默认值
 */
export function safeCalculation(calculation, defaultValue = 0, operationName = 'calculation') {
  try {
    const result = calculation();
    return Number.isFinite(result) ? result : defaultValue;
  } catch (error) {
    console.warn(`${operationName}计算失败:`, error);
    return defaultValue;
  }
}