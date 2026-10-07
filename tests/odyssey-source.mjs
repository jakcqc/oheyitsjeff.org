/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describeSource, rewriteSource } from '../TheOdyssey/capture-source.js';
const url = 'https://example.test/app/main.js';
function run(code, limit = Infinity) {
  let calls = 0;
  return vm.runInNewContext(rewriteSource(describeSource(code, url, 'script')), {
    __odysseyCheck() { if (++calls > limit) throw new Error('deadline'); },
  }, { timeout: 1000 });
}
for (const code of [
  'while(true) {}', 'while(true);', 'for(;;);', 'do {} while(true);',
  'function again(){ return again(); } again();', 'const again=()=>again(); again();',
  'outer: for (;;) { try { throw 1; } catch {} continue outer; }',
]) assert.throws(() => run(code, 10), /deadline/, code);
assert.equal(run('let total=0; outer: for(let x=0;x<3;x++) for(let y=0;y<3;y++) { if(y===2) continue outer; total++; } total;'), 6);
assert.equal(run('let n=0; for(const x of [1,2,3]) n+=x; for(const key in {a:1}) n++; do n--; while(n>6); n;'), 6);
assert.equal(run('function strict(){"use strict"; return this;} strict()'), undefined);
assert.equal(run('const f=x=>y=>({value:x+y}); f(2)(3).value;'), 5);
assert.equal(run('const f=()=>/while\\(true\\)/.test("while(true)"); f()'), true);
const entry = describeSource('import {x} from "./x.js"; export {y} from "./y.js"; const u=import.meta.url; import("./z.js"); new Worker(new URL("./worker.js",import.meta.url),{type:"module"});', url);
assert.deepEqual(entry.dependencies, ['x', 'y', 'z'].map(name => 'https://example.test/app/' + name + '.js'));
assert.deepEqual(entry.workers, ['https://example.test/app/worker.js']);
const rewritten = rewriteSource(entry, target => 'data:text/javascript,' + encodeURIComponent(target));
assert.ok(rewritten.includes('({url:"' + url + '"}).url'));
assert.ok(rewritten.includes('import("data:text/javascript,https'));
console.log('Capture source checkpoints: infinite loops, recursion, labels, directives, arrow expressions and module/worker URLs passed.');
