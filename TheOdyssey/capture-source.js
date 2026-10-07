/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import { parse } from './vendor/acorn.js';

// Only capture copies are changed. Checkpoints unwind long loops/recursion so
// removing a timed-out frame does not leave its renderer burning CPU forever.
export function describeSource(code, url, sourceType = 'module', resolve = (specifier, base) => new URL(specifier, base).href) {
  const tree = parse(code, { ecmaVersion: 'latest', sourceType });
  const edits = [], dependencies = [], workers = [];
  const check = 'globalThis.__odysseyCheck?.()';
  const instrument = !url.endsWith('/helper/odysseyClientBridge.js');
  const insert = (position, text) => edits.push({ start: position, end: position, text });
  function guard(body) {
    if (body.type === 'BlockStatement') {
      let position = body.start + 1;
      for (const statement of body.body) {
        if (!statement.directive) break;
        position = statement.end;
      }
      insert(position, ';' + check + ';');
    } else {
      insert(body.start, '{' + check + ';'); insert(body.end, '}');
    }
  }
  function visit(node) {
    if (!node || typeof node.type !== 'string') return;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(node.type)
        && typeof node.source?.value === 'string') {
      const target = resolve(node.source.value, url);
      dependencies.push(target);
      edits.push({ start: node.source.start, end: node.source.end, target });
    }
    if (node.type === 'MetaProperty' && node.meta.name === 'import') edits.push({ start: node.start, end: node.end, meta: url });
    if (node.type === 'NewExpression' && node.callee.name === 'Worker') {
      const arg = node.arguments[0];
      if (arg?.type === 'NewExpression' && arg.callee.name === 'URL' && typeof arg.arguments[0]?.value === 'string') {
        workers.push(new URL(arg.arguments[0].value, url).href);
      }
    }
    if (instrument) {
      if (['WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement'].includes(node.type)) guard(node.body);
      if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) {
        if (node.body.type === 'BlockStatement') guard(node.body);
        else { insert(node.body.start, '(' + check + ','); insert(node.body.end, ')'); }
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  return { url, code, edits, dependencies, workers };
}

export function rewriteSource(entry, resolve = url => url) {
  const code = entry.code, parts = [];
  let cursor = code.length;
  // Reverse discovery order at equal offsets closes nested wrappers correctly.
  const edits = entry.edits.map((edit, order) => ({ ...edit, order }));
  edits.sort((a, b) => b.start - a.start || b.order - a.order);
  for (const edit of edits) {
    const value = edit.text ?? (edit.meta ? '({url:' + JSON.stringify(edit.meta) + '})' : JSON.stringify(resolve(edit.target)));
    parts.push(code.slice(edit.end, cursor), value); cursor = edit.start;
  }
  parts.push(code.slice(0, cursor)); return parts.reverse().join('');
}
