/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
let sequence = 0;

// Freeze presentation, including CSS-driven geometry, without importing the
// surrounding page's layout or copying hundreds of unrelated CSS properties.
const PRESENTATION = (`alignment-baseline baseline-shift clip clip-path clip-rule color
  color-interpolation color-interpolation-filters color-rendering cursor direction display
  dominant-baseline fill fill-opacity fill-rule filter flood-color flood-opacity
  font-family font-size font-size-adjust font-stretch font-style font-variant font-weight
  image-rendering isolation letter-spacing lighting-color marker-end marker-mid marker-start
  mask mask-type mix-blend-mode opacity overflow paint-order pointer-events shape-rendering
  stop-color stop-opacity stroke stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin
  stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering
  transform transform-box transform-origin vector-effect visibility white-space word-spacing
  writing-mode cx cy r rx ry x y width height d background-color`).split(/\s+/).filter(Boolean);
const REMOVED_ELEMENTS = new Set(['script', 'style', 'animate', 'animatemotion', 'animatetransform', 'set', 'discard']);
const GEOMETRY = new Set(['x', 'y', 'width', 'height']);
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nodes = root => [root, ...root.querySelectorAll('*')];
const prefix = id => `time_${String(id || 'frame').replace(/[^a-zA-Z0-9_-]/g, '_')}_${++sequence}_`;

function dimensions(svg) {
  const box = svg.viewBox?.baseVal;
  const width = positive(svg.clientWidth, positive(svg.width?.baseVal?.value, positive(box?.width, 800)));
  const height = positive(svg.clientHeight, positive(svg.height?.baseVal?.value, positive(box?.height, 600)));
  return { width, height };
}

function localReference(value, baseURI) {
  if (value.startsWith('#')) return value.slice(1);
  try {
    const url = new URL(value, baseURI), base = new URL(baseURI);
    if (url.origin === base.origin && url.pathname === base.pathname && url.search === base.search) {
      return decodeURIComponent(url.hash.slice(1));
    }
  } catch { /* A non-URL paint value is left unchanged. */ }
  return null;
}

function namespaceIds(root, namespace, baseURI) {
  const elements = nodes(root), ids = new Map();
  for (const node of elements) {
    const id = node.getAttribute('id');
    if (id) { const replacement = `${namespace}${id}`; ids.set(id, replacement); node.setAttribute('id', replacement); }
  }
  const replaceReference = value => {
    const id = localReference(value, baseURI);
    return ids.has(id) ? `#${ids.get(id)}` : value;
  };
  for (const node of elements) for (const attr of [...node.attributes]) {
    if (attr.localName === 'id') continue;
    let value = attr.value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,
      (whole, quote, reference) => {
        const rewritten = replaceReference(reference.trim());
        return rewritten === reference.trim() ? whole : `url("${rewritten}")`;
      });
    if (attr.localName === 'href') value = replaceReference(value);
    if (attr.localName === 'aria-labelledby' || attr.localName === 'aria-describedby') {
      value = value.split(/\s+/).map(id => ids.get(id) || id).join(' ');
    }
    if (value !== attr.value) node.setAttributeNS(attr.namespaceURI, attr.name, value);
  }
}

function freezeAnimatedAttributes(source, clone) {
  // animVal exposes the displayed value of SMIL attributes that are not CSS
  // properties (for example line endpoints and viewBox).
  const attributes = [...source.attributes];
  for (const animation of source.children) {
    const name = animation.getAttribute('attributeName');
    if (name && !source.hasAttribute(name)) attributes.push({ name, namespaceURI: null });
  }
  for (const attr of attributes) {
    if (attr.name === 'style' || attr.name === 'class' || attr.name === 'transform') continue;
    const property = attr.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    let animated;
    try { animated = source[property]; } catch { continue; }
    if (!animated || !('animVal' in Object(animated))) continue;
    const value = animated.animVal;
    if (typeof value === 'string') clone.setAttributeNS(attr.namespaceURI, attr.name, value);
    else if (typeof value === 'number' && typeof animated.baseVal === 'number' && !/Units$|^orientType$|^spreadMethod$/.test(property)) {
      // Enumeration values are not valid attribute syntax. Only numeric SVG
      // animations have a constructor named SVGAnimatedNumber/Integer.
      if (/^SVGAnimated(Number|Integer)$/.test(animated.constructor?.name || '')) clone.setAttribute(attr.name, String(value));
    } else if (typeof value?.valueAsString === 'string') clone.setAttribute(attr.name, value.valueAsString);
    else if (property === 'viewBox' && value?.width > 0 && value?.height > 0) {
      clone.setAttribute('viewBox', `${value.x} ${value.y} ${value.width} ${value.height}`);
    } else if (typeof value?.numberOfItems === 'number') {
      const values = [];
      for (let i = 0; i < value.numberOfItems; i++) {
        const item = value.getItem(i);
        if (typeof item?.valueAsString === 'string') values.push(item.valueAsString);
        else if (typeof item?.value === 'number') values.push(item.value);
      }
      if (values.length) clone.setAttribute(attr.name, values.join(' '));
    }
  }
  if (source.animatedPoints?.numberOfItems) {
    clone.setAttribute('points', [...Array(source.animatedPoints.numberOfItems)].map((_, i) => {
      const point = source.animatedPoints.getItem(i); return `${point.x},${point.y}`;
    }).join(' '));
  }
}

function sanitize(root) {
  for (const node of nodes(root)) {
    if (REMOVED_ELEMENTS.has(node.localName?.toLowerCase())) { node.remove(); continue; }
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.localName) || (attr.localName === 'href' && /^\s*javascript:/i.test(attr.value))) node.removeAttributeNS(attr.namespaceURI, attr.localName);
    }
    if (node.style) {
      // Stylesheets and SMIL are removed above, so static snapshots do not need
      // two !important animation overrides on every point and path.
      for (const property of [...node.style]) {
        if (/^(animation|transition)(-|$)/.test(property)) node.style.removeProperty(property);
      }
      if (!node.style.length) node.removeAttribute('style');
    }
  }
}

function prepareStaticStyles(root) {
  sanitize(root);
  for (const node of nodes(root)) {
    // The displayed values are captured below. Keeping selectors or relative
    // presentation styles would let the surrounding page change the artwork.
    node.removeAttribute('class');
    if (!node.style) continue;
    for (const property of PRESENTATION) node.style.removeProperty(property);
    if (!node.style.length) node.removeAttribute('style');
  }
}

/** Capture immutable vector artwork as it is displayed at this instant. */
export function captureTimeSnapshot(svg, { id, capturedAt = null } = {}) {
  if (svg?.namespaceURI !== SVG_NS || svg.localName !== 'svg') throw new Error('The current visual does not contain an SVG to snapshot.');
  const { width, height } = dimensions(svg);
  const clone = svg.cloneNode(true), sourceNodes = nodes(svg), cloneNodes = nodes(clone);
  const view = svg.ownerDocument.defaultView;
  for (let i = 0; i < sourceNodes.length; i++) freezeAnimatedAttributes(sourceNodes[i], cloneNodes[i]);
  prepareStaticStyles(clone);
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  // Measure the static clone in an empty document, with its existing geometry
  // and presentation attributes intact. Copying every computed CSS property
  // repeated browser defaults on thousands of marks and duplicated large `d`
  // attributes as expanded CSS paths. Only values that actually change the
  // static artwork need to be serialized.
  const baseline = svg.ownerDocument.createElement('iframe');
  baseline.setAttribute('aria-hidden', 'true'); baseline.setAttribute('tabindex', '-1');
  baseline.style.cssText = `position:fixed;left:-100000px;top:0;width:${positive(view?.innerWidth, width)}px;height:${positive(view?.innerHeight, height)}px;visibility:hidden;pointer-events:none;border:0`;
  svg.ownerDocument.documentElement.appendChild(baseline);
  try {
    baseline.contentDocument.body.appendChild(clone);
    const staticView = baseline.contentWindow;
    for (let i = 0; i < sourceNodes.length; i++) {
      const source = sourceNodes[i], target = cloneNodes[i];
      if (!clone.contains(target) && target !== clone) continue;
      const computed = view?.getComputedStyle(source);
      if (!computed || !target.style) continue;
      const existing = staticView.getComputedStyle(target);
      for (const property of PRESENTATION) {
        // The composition controls the root viewport. Nested geometry stays frozen.
        if (i === 0 && GEOMETRY.has(property)) continue;
        const value = computed.getPropertyValue(property);
        // Root values also isolate inherited presentation from the Time canvas.
        // Descendants naturally inherit them, including fill:none on open paths.
        if (value && (i === 0 || value !== existing.getPropertyValue(property))) target.style.setProperty(property, value, 'important');
      }
      // animateMotion is not reflected in computed `transform`. Its local CTM
      // contains the motion offset, rotation, and any ordinary transform.
      if ([...source.children].some(child => child.localName?.toLowerCase() === 'animatemotion')) {
        try {
          const parentMatrix = source.parentElement?.getCTM?.(), matrix = source.getCTM?.();
          if (parentMatrix && matrix) {
            const local = parentMatrix.inverse().multiply(matrix);
            target.style.setProperty('transform', `matrix(${local.a},${local.b},${local.c},${local.d},${local.e},${local.f})`, 'important');
            target.style.setProperty('transform-origin', '0 0', 'important');
            target.style.setProperty('transform-box', 'view-box', 'important');
          }
        } catch { /* A singular transform has no visible geometry to preserve. */ }
      }
    }
  } finally { baseline.remove(); }
  const snapshotId = String(id || `snapshot-${Date.now()}-${++sequence}`);
  namespaceIds(clone, prefix(snapshotId), svg.baseURI);
  for (const property of GEOMETRY) clone.style.removeProperty(property);
  clone.removeAttribute('x'); clone.removeAttribute('y');
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  if (!clone.hasAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.setAttributeNS(XMLNS_NS, 'xmlns', SVG_NS);
  const Serializer = view?.XMLSerializer || XMLSerializer;
  return { id: snapshotId, svg: new Serializer().serializeToString(clone), width, height, capturedAt };
}

/** Build one standalone SVG, retaining every snapshot as nested vector SVG. */
export function makeTimeComposition(config = {}, snapshots = [], placements = []) {
  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttributeNS(XMLNS_NS, 'xmlns', SVG_NS);
  const canvasWidth = positive(config.width, 1200), canvasHeight = positive(config.height, 800);
  let left = 0, top = 0, right = canvasWidth, bottom = canvasHeight;
  const parser = new DOMParser();
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    const index = Number.isInteger(placement.index) ? placement.index : i;
    const snapshot = placement.id == null ? snapshots[index] : snapshots.find(item => item.id === placement.id);
    if (!snapshot?.svg) continue;
    const parsed = parser.parseFromString(snapshot.svg, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement?.localName !== 'svg') throw new Error(`Snapshot ${index + 1} contains invalid SVG.`);
    const frame = document.importNode(parsed.documentElement, true);
    sanitize(frame);
    namespaceIds(frame, prefix(snapshot.id), document.baseURI);
    const x = finite(placement.x), y = finite(placement.y);
    const width = positive(placement.width, positive(snapshot.width, 100));
    const height = positive(placement.height, positive(snapshot.height, 100));
    for (const property of GEOMETRY) frame.style.removeProperty(property);
    frame.setAttribute('x', String(x)); frame.setAttribute('y', String(y));
    frame.setAttribute('width', String(width)); frame.setAttribute('height', String(height));
    if (!frame.hasAttribute('viewBox')) frame.setAttribute('viewBox', `0 0 ${positive(snapshot.width, width)} ${positive(snapshot.height, height)}`);
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('data-time-id', String(snapshot.id));
    group.setAttribute('data-time-index', String(index));
    group.appendChild(frame); root.appendChild(group);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + width); bottom = Math.max(bottom, y + height);
  }
  root.setAttribute('viewBox', `${left} ${top} ${right - left} ${bottom - top}`);
  root.setAttribute('width', String(right - left)); root.setAttribute('height', String(bottom - top));
  return root;
}
