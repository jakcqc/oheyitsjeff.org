/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)(process.env.JSDOM_MODULE || 'jsdom');
const dom = new JSDOM('<body></body>', {url:'https://example.test/'});
for(const key of ['window','document','Element','SVGElement','getComputedStyle']) Object.defineProperty(globalThis,key,{value:key==='window'?dom.window:dom.window[key],configurable:true});
const {scalePolygonsInSubtree} = await import('../helper/scriptOpsUtils.js');
const {sampleSpline,applySplineLinesInSubtree} = await import('../helper/splineEffectsUtils.js');
const create = tag => document.createElementNS('http://www.w3.org/2000/svg',tag);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function scales(range,spacing) {
 const root=create('svg'),polygon=create('polygon');polygon.setAttribute('points','0,0 10,0 0,10');root.append(polygon);document.body.replaceChildren(root);
 scalePolygonsInSubtree({root,create},{range,spacing});
 return [...root.querySelectorAll('polygon')].map(node=>+node.getAttribute('data-scale-factor'));
}
test('logarithmic echoes use geometric ratios, including negative same-sign ranges',()=>{
 scales([.125,8,5],'logarithmic').forEach((v,i)=>near(v,[.125,.3535533905932738,1,2.8284271247461903,8][i]));
 scales([-1,-16,3],'logarithmic').forEach((v,i)=>near(v,[-1,-4,-16][i]));
 assert.deepEqual(scales([-2,2,3],'logarithmic'),[-2,0,2]);
 assert.deepEqual(scales([0,2,3],'logarithmic'),[0,1,2]);
 assert.deepEqual(scales([.2,2,1],'logarithmic'),[.2]);
 assert.deepEqual(scales([1,5,3],'linear'),[1,3,5]);
});
const points=[{x:0,y:0},{x:10,y:20},{x:30,y:-10},{x:50,y:0}];
test('tension extrapolation is opt-in, changes geometry, and leaves defaults intact',()=>{
 assert.deepEqual(sampleSpline(points,4,-3,false),sampleSpline(points,4,0,false));
 assert.deepEqual(sampleSpline(points,4,3,false),sampleSpline(points,4,1,false));
 assert.deepEqual(sampleSpline(points,4,.3,false,true),sampleSpline(points,4,.3,false));
 const extended=sampleSpline(points,4,-3,false,true);
 assert.notDeepEqual(extended,sampleSpline(points,4,-3,false));
 assert.ok(extended.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert.deepEqual(sampleSpline(points,4,Infinity,false,true),sampleSpline(points,4,0,false,true));
});
function vector(angleOffset) {
 const root=create('svg'),line=create('line');for(const [key,value] of Object.entries({x1:0,y1:0,x2:10,y2:0,stroke:'#111'}))line.setAttribute(key,value);root.append(line);document.body.replaceChildren(root);
 const stats=applySplineLinesInSubtree({root,create},{sourceTag:'line',lineOrientation:'tangent',pointCount:3,stepsPerSegment:2,lineHeight:4,lineScale:1,angleOffset});
 assert.ok(stats.linesCreated>0);const result=root.querySelector('line');return {x1:+result.getAttribute('x1'),x2:+result.getAttribute('x2'),y1:+result.getAttribute('y1'),y2:+result.getAttribute('y2')};
}
test('angular coefficient rotates vectors about the sample and preserves length',()=>{
 const base=vector(0),turned=vector(90),wrapped=vector(450);
 near(base.x2-base.x1,4);near(base.y2-base.y1,0);
 near(turned.x2-turned.x1,0);near(turned.y2-turned.y1,4);
 near((base.x1+base.x2)/2,(turned.x1+turned.x2)/2);
 near((base.y1+base.y2)/2,(turned.y1+turned.y2)/2);
 assert.deepEqual(turned,wrapped);assert.deepEqual(vector(NaN),base);
});
after(()=>dom.window.close());
