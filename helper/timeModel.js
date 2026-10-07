/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */

export const MAX_TIME_SNAPSHOTS = 400;
export const TIME_LAYOUTS = Object.freeze(['grid', 'circle', 'square', 'triangle', 'polygon', 'free', 'function']);
export const DEFAULT_TIME_CONFIG = Object.freeze({
  layout: 'grid', columns: 3, rows: 3, width: 1200, height: 1200, gap: 20,
  size: 220, radius: 400, sides: 6, rotation: -90,
  xExpression: 'W/2 + cos(2*pi*i/max(1,n))*W*0.32',
  yExpression: 'H/2 + sin(2*pi*i/max(1,n))*H*0.32', scaleExpression: '1',
  sampleStart: 0, sampleInterval: 0.2, sampleCount: 9, sampleMode: 'append',
});

const VARIABLES = new Set(['i', 'n', 't', 'W', 'H']);
const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });
const MATH_FUNCTIONS = Object.freeze({
  sin: [Math.sin, 1, 1], cos: [Math.cos, 1, 1], tan: [Math.tan, 1, 1],
  atan2: [Math.atan2, 2, 2], sqrt: [Math.sqrt, 1, 1], abs: [Math.abs, 1, 1],
  floor: [Math.floor, 1, 1], ceil: [Math.ceil, 1, 1], round: [Math.round, 1, 1],
  min: [Math.min, 1, 32], max: [Math.max, 1, 32], pow: [Math.pow, 2, 2],
  exp: [Math.exp, 1, 1], log: [Math.log, 1, 1],
});

function finiteNumber(value, label, { min = -Infinity, max = Infinity, integer = false, exclusiveMin = false } = {}) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) {
    throw new Error(`${label} must be a finite number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  if (integer && !Number.isInteger(number)) throw new Error(`${label} must be a whole number.`);
  if (exclusiveMin ? number <= min : number < min) {
    throw new Error(`${label} must be ${exclusiveMin ? 'greater than' : 'at least'} ${min}.`);
  }
  if (number > max) throw new Error(`${label} must be at most ${max}.`);
  return number;
}

/** Compile a restricted arithmetic expression without executing JavaScript. */
export function compileTimeExpression(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Enter a math expression.');
  if (source.length > 1024) throw new Error('Math expressions must be at most 1024 characters.');
  const tokens = [];
  const pattern = /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|\*\*|[+\-*/%^(),]/gy;
  let offset = 0;
  while (offset < source.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) throw new Error(`Unexpected character "${source[offset]}" at position ${offset + 1}.`);
    offset = pattern.lastIndex;
    if (!/^\s+$/.test(match[0])) tokens.push({ value: match[0], position: match.index + 1 });
    if (tokens.length > 512) throw new Error('Math expression is too complex (maximum 512 tokens).');
  }
  let index = 0;
  let depth = 0;
  const peek = () => tokens[index]?.value;
  const consume = value => peek() === value ? (index++, true) : false;
  const fail = message => { throw new Error(`${message} at position ${tokens[index]?.position ?? source.length + 1}.`); };
  const requireToken = value => { if (!consume(value)) fail(`Expected "${value}"`); };
  const binary = (operator, left, right) => ({ type: 'binary', operator, left, right });

  function sum() {
    let node = product();
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[index++].value;
      node = binary(operator, node, product());
    }
    return node;
  }
  function product() {
    let node = unary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = tokens[index++].value;
      node = binary(operator, node, unary());
    }
    return node;
  }
  function unary() {
    if (++depth > 64) fail('Math expression is nested too deeply');
    let node;
    if (consume('+')) node = unary();
    else if (consume('-')) node = { type: 'negate', value: unary() };
    else node = power();
    depth--;
    return node;
  }
  function power() {
    const node = primary();
    if (peek() === '^' || peek() === '**') {
      index++;
      return binary('^', node, unary());
    }
    return node;
  }
  function primary() {
    if (consume('(')) {
      const node = sum();
      requireToken(')');
      return node;
    }
    const token = tokens[index++];
    if (!token) fail('Expected a number, variable, or function');
    if (/^(?:\d|\.)/.test(token.value)) {
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new Error(`Number at position ${token.position} must be finite.`);
      return { type: 'number', value };
    }
    if (Object.hasOwn(CONSTANTS, token.value)) return { type: 'number', value: CONSTANTS[token.value] };
    if (VARIABLES.has(token.value)) return { type: 'variable', name: token.value };
    if (Object.hasOwn(MATH_FUNCTIONS, token.value)) {
      requireToken('(');
      const args = [];
      if (peek() !== ')') {
        do { args.push(sum()); } while (consume(','));
      }
      requireToken(')');
      const [fn, min, max] = MATH_FUNCTIONS[token.value];
      if (args.length < min || args.length > max) {
        throw new Error(`${token.value} expects ${min === max ? min : `${min}–${max}`} argument${max === 1 ? '' : 's'}.`);
      }
      return { type: 'call', fn, args };
    }
    throw new Error(`Unknown variable or function "${token.value}" at position ${token.position}. Use i, n, t, W, H, pi, e, or a supported math function.`);
  }

  const tree = sum();
  if (index < tokens.length) fail(`Unexpected token "${peek()}"`);
  function evaluate(node, scope) {
    switch (node.type) {
      case 'number': return node.value;
      case 'variable': return finiteNumber(scope[node.name], `Variable ${node.name}`);
      case 'negate': return -evaluate(node.value, scope);
      case 'call': return node.fn(...node.args.map(arg => evaluate(arg, scope)));
      case 'binary': {
        const left = evaluate(node.left, scope);
        const right = evaluate(node.right, scope);
        switch (node.operator) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return left / right;
          case '%': return left % right;
          case '^': return left ** right;
        }
      }
    }
    throw new Error('Invalid math expression.');
  }
  return (scope = {}) => {
    const value = evaluate(tree, scope);
    if (!Number.isFinite(value)) throw new Error('Expression must produce a finite number (check division by zero and function domains).');
    return value;
  };
}

function expression(source, label) {
  try { return compileTimeExpression(source); }
  catch (error) { throw new Error(`${label}: ${error.message}`); }
}

/** Validate settings from form fields; missing fields inherit stable defaults. */
export function normalizeTimeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Time settings must be an object.');
  const config = { ...DEFAULT_TIME_CONFIG };
  for (const key of Object.keys(config)) if (input[key] !== undefined) config[key] = input[key];
  if (!TIME_LAYOUTS.includes(config.layout)) throw new Error(`Unknown Time layout "${config.layout}".`);
  for (const [key, label] of [['width', 'Canvas width'], ['height', 'Canvas height'], ['size', 'Snapshot size']]) {
    config[key] = finiteNumber(config[key], label, { min: 0, exclusiveMin: true });
  }
  for (const [key, label] of [['columns', 'Columns'], ['rows', 'Rows'], ['sampleCount', 'Sample count']]) {
    config[key] = finiteNumber(config[key], label, { min: 1, max: MAX_TIME_SNAPSHOTS, integer: true });
  }
  config.sides = finiteNumber(config.sides, 'Polygon sides', { min: 3, max: MAX_TIME_SNAPSHOTS, integer: true });
  config.gap = finiteNumber(config.gap, 'Grid gap', { min: 0 });
  config.radius = finiteNumber(config.radius, 'Shape radius', { min: 0 });
  config.rotation = finiteNumber(config.rotation, 'Rotation');
  config.sampleStart = finiteNumber(config.sampleStart, 'Sampling start', { min: 0 });
  config.sampleInterval = finiteNumber(config.sampleInterval, 'Sampling interval', { min: 0, exclusiveMin: true });
  if (!['append', 'replace'].includes(config.sampleMode)) throw new Error('Sampling mode must be append or replace.');
  if (config.layout === 'grid') {
    if (config.columns * config.rows > MAX_TIME_SNAPSHOTS) throw new Error(`The grid can contain at most ${MAX_TIME_SNAPSHOTS} slots.`);
    if (config.width <= config.gap * (config.columns - 1) || config.height <= config.gap * (config.rows - 1)) {
      throw new Error('Grid gap leaves no space for snapshots; reduce the gap or increase the canvas size.');
    }
  }
  for (const [key, label] of [['xExpression', 'X expression'], ['yExpression', 'Y expression'], ['scaleExpression', 'Scale expression']]) {
    expression(config[key], label);
    config[key] = config[key].trim();
  }
  return config;
}

export function getTimeCapacity(input = {}) {
  const config = normalizeTimeConfig(input);
  return config.layout === 'grid' ? config.columns * config.rows : MAX_TIME_SNAPSHOTS;
}

/**
 * Compute top-left rectangles in SVG coordinates. Shape/function positions and
 * stored free placement positions are centers. `size` is the longest side of a
 * shape/function/free snapshot; grid snapshots fit their cells instead.
 */
export function layoutSnapshots(input, snapshots = []) {
  const config = normalizeTimeConfig(input);
  if (!Array.isArray(snapshots)) throw new Error('Snapshots must be an array.');
  const count = snapshots.length;
  const capacity = config.layout === 'grid' ? config.columns * config.rows : MAX_TIME_SNAPSHOTS;
  if (count > capacity) throw new Error(`This ${config.layout} layout has room for ${capacity} snapshots; remove snapshots or increase its capacity.`);
  const cellWidth = (config.width - config.gap * (config.columns - 1)) / config.columns;
  const cellHeight = (config.height - config.gap * (config.rows - 1)) / config.rows;
  const expressions = config.layout === 'function' ? [
    expression(config.xExpression, 'X expression'), expression(config.yExpression, 'Y expression'), expression(config.scaleExpression, 'Scale expression'),
  ] : null;
  let left = 0, top = 0, right = config.width, bottom = config.height;
  const placements = snapshots.map((snapshot, i) => {
    if (!snapshot || typeof snapshot !== 'object') throw new Error(`Snapshot ${i + 1} is invalid.`);
    const sourceWidth = finiteNumber(snapshot.width ?? 1, `Snapshot ${i + 1} width`, { min: 0, exclusiveMin: true });
    const sourceHeight = finiteNumber(snapshot.height ?? 1, `Snapshot ${i + 1} height`, { min: 0, exclusiveMin: true });
    let centerX = config.width / 2;
    let centerY = config.height / 2;
    let scale = 1;
    let fit = config.size / Math.max(sourceWidth, sourceHeight);
    if (config.layout === 'grid') {
      centerX = (i % config.columns) * (cellWidth + config.gap) + cellWidth / 2;
      centerY = Math.floor(i / config.columns) * (cellHeight + config.gap) + cellHeight / 2;
      fit = Math.min(cellWidth / sourceWidth, cellHeight / sourceHeight);
    } else if (config.layout === 'free') {
      const placement = snapshot.placement ?? {};
      centerX = finiteNumber(placement.x ?? centerX + (i % 5) * 24, `Snapshot ${i + 1} X position`);
      centerY = finiteNumber(placement.y ?? centerY + (i % 5) * 24, `Snapshot ${i + 1} Y position`);
      scale = finiteNumber(placement.scale ?? 1, `Snapshot ${i + 1} scale`, { min: 0, exclusiveMin: true });
    } else if (config.layout === 'function') {
      const scope = { i, n: count, t: i / Math.max(1, count - 1), W: config.width, H: config.height };
      const values = expressions.map((fn, axis) => {
        try { return fn(scope); }
        catch (error) { throw new Error(`${['X', 'Y', 'Scale'][axis]} expression at snapshot ${i + 1}: ${error.message}`); }
      });
      [centerX, centerY, scale] = values;
      if (scale <= 0) throw new Error(`Scale expression at snapshot ${i + 1} must produce a number greater than 0.`);
    } else {
      const sides = config.layout === 'square' ? 4 : config.layout === 'triangle' ? 3 : config.sides;
      const rotation = (config.rotation - (config.layout === 'square' ? 45 : 0)) * Math.PI / 180;
      if (config.layout === 'circle') {
        const angle = rotation + 2 * Math.PI * i / count;
        centerX += Math.cos(angle) * config.radius;
        centerY += Math.sin(angle) * config.radius;
      } else {
        const along = i * sides / count;
        const vertex = Math.floor(along);
        const fraction = along - vertex;
        const angle = rotation + 2 * Math.PI * vertex / sides;
        const nextAngle = rotation + 2 * Math.PI * (vertex + 1) / sides;
        centerX += ((1 - fraction) * Math.cos(angle) + fraction * Math.cos(nextAngle)) * config.radius;
        centerY += ((1 - fraction) * Math.sin(angle) + fraction * Math.sin(nextAngle)) * config.radius;
      }
    }
    const width = sourceWidth * fit * scale;
    const height = sourceHeight * fit * scale;
    const result = { x: centerX - width / 2, y: centerY - height / 2, width, height, scale };
    if (![...Object.values(result), result.x + width, result.y + height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new Error(`Snapshot ${i + 1} placement is too large or too small; use finite coordinates and a positive size and scale.`);
    }
    left = Math.min(left, result.x); top = Math.min(top, result.y);
    right = Math.max(right, result.x + width); bottom = Math.max(bottom, result.y + height);
    return result;
  });
  if (!Number.isFinite(right - left) || !Number.isFinite(bottom - top)) {
    throw new Error('Composition bounds are too large; reduce snapshot coordinates, size, or scale.');
  }
  return placements;
}
