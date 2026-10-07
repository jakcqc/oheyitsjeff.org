/* Copyright (c) 2026 Jeffrey Kerley. See ../LICENSE.md. */
// Run: node tests/animation-param-picker-browser.mjs
// Uses an isolated browser and a temporary local server. PLAYWRIGHT_MODULE and
// BROWSER_EXECUTABLE can select installed dependencies.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, '.cache');
const require = createRequire(import.meta.url);
let playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) {
  try { playwrightModule = require.resolve('playwright'); }
  catch { playwrightModule = path.join(root, 'TheOdyssey/node_modules/playwright'); }
}
const { chromium } = require(playwrightModule);
const executablePath = process.env.BROWSER_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const vectorDescription = 'Shift the orbit along the selected coordinate axis.';
const literalDescription = 'Keep <strong>this</strong> literal: <img src=x onerror="window.__descriptionInjected=1"> & symbols.';
const fixtureHTML = `<!doctype html><html><head><meta charset="utf-8"><title>Animation property picker fixture</title>
<link rel="stylesheet" href="/helper/uiHelper.css"><style>body{margin:0;padding:24px;background:#181818;color:white;font-family:sans-serif}#fixture-panel{width:460px;max-width:95vw}#fixture-art{width:460px;height:100px}</style></head>
<body><div id="fixture-art"><svg xmlns="http://www.w3.org/2000/svg" width="460" height="100"><circle cx="50" cy="50" r="20"/></svg></div><div id="fixture-panel"></div>
<script type="module">
import { buildAnimatePanel } from '/helper/animationHelp.js';
const state = { position: {x:1,y:2,z:3}, alpha:4, beta:5, markup:6, legacy:{amount:7}, __anim:{ui:{targetType:'params',view:'flow',paramTargets:[{key:'legacy.amount',from:7,to:9}],autoPlay:false}} };
const spec = {title:'Picker fixture', params:[
 {key:'position',type:'vector3D',label:'Position offset',description:${JSON.stringify(vectorDescription)}},
 {key:'alpha',type:'number',label:'Duplicate value',description:'The first independently animated value.'},
 {key:'beta',type:'number',label:'Duplicate value',description:'The second independently animated value.'},
 {key:'markup',type:'number',label:'Literal description',description:${JSON.stringify(literalDescription)}}
]};
const mountEl=document.getElementById('fixture-art');
const panel=buildAnimatePanel({mountEl,state,spec,onChange(){},onStateChange(){}});
document.getElementById('fixture-panel').append(panel);
window.pickerFixture={state,spec,panel};
</script></body></html>`;
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg' };
const insideRoot = file => file === path.resolve(root) || file.startsWith(path.resolve(root) + path.sep);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__animation-picker-fixture.html') {
      response.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' });
      response.end(fixtureHTML);
      return;
    }
    let file = path.resolve(root, '.' + pathname);
    assert.ok(insideRoot(file));
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    file = await realpath(file);
    assert.ok(insideRoot(file));
    response.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await mkdir(cache, { recursive:true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless:true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport:{width:1440,height:1000} });
const page = await context.newPage();
const errors = [], checks = [];
let panelRegressions;
page.on('pageerror', error => errors.push(error.message));
const note = message => { checks.push(message); console.log('PASS ' + message); };
await context.route('https://**/*', async route => {
  const url = route.request().url();
  const dependency = url.includes('d3') && url.endsWith('.js') ? 'd3.cjs' : url.includes('math') && url.endsWith('.js') ? 'math.cjs' : null;
  if (dependency) await route.fulfill({ contentType:'text/javascript', body:await readFile(path.join(cache,'abstract-export-deps',dependency)) });
  else await route.fulfill({ contentType:'text/css', body:'' });
});
const picker = target => target.getByRole('combobox', { name:'Add animation parameter', exact:true });
const keyedOption = (target, key) => target.locator(`.anim-param-option[data-key="${key}"]`);
const add = target => target.locator('.anim-flow').getByRole('button', { name:'Add', exact:true });
const cardTitle = (target, name) => target.locator('.anim-flow-card .tool-flow-stage-title').filter({
  has: target.locator('.anim-param-target-label').filter({ hasText:new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }),
});

try {
  await page.goto(origin + '/PureAttractors/');
  await page.waitForFunction(() => window.pureAttractorsApp && document.querySelector('#vis svg'));
  if (!await page.getByRole('button', { name:'Show or hide tabs', exact:true }).isVisible()) await page.locator('#button-info').click();
  const desktopTabs = page.getByRole('button', { name:'Show or hide tabs', exact:true });
  if (await desktopTabs.getAttribute('aria-expanded') !== 'true') await desktopTabs.click();
  await page.getByRole('tab', { name:'animate', exact:true }).click();
  await page.getByRole('tab', { name:'Flow', exact:true }).click();
  const pointDescription = await page.evaluate(() => window.pureAttractorsApp.spec.params.find(param => param.key === 'pointSize').description);
  await picker(page).fill('pointSize');
  const pointOption = keyedOption(page, 'pointSize');
  assert.equal(await pointOption.locator('.anim-param-label').textContent(), 'Point size');
  await pointOption.hover();
  assert.equal(await page.locator('.anim-param-help[role="tooltip"]').textContent(), pointDescription);
  assert.equal(await page.locator('.anim-param-help[role="tooltip"]').isVisible(), true);
  await page.screenshot({ path:path.join(cache,'animation-param-picker.png'), fullPage:false, animations:'disabled' });
  await pointOption.click();
  assert.equal(await picker(page).inputValue(), 'Point size');
  await add(page).click();
  assert.equal(await page.evaluate(() => window.pureAttractorsApp.state.__anim.ui.paramTargets.at(-1).key), 'pointSize');
  assert.equal(await cardTitle(page, 'Point size').count(), 1);
  assert.ok((await cardTitle(page, 'Point size').getAttribute('title')).includes(pointDescription));
  assert.equal(await page.getByRole('spinbutton', { name:'Point size start', exact:true }).count(), 1);
  note('Pure Attractors Flow shows Point size with its exact hover description, then saves pointSize and labels the flow card.');

  await picker(page).fill('spread marks farther apart');
  assert.equal(await keyedOption(page, 'pointSize').count(), 1, 'Description text can locate a parameter');
  await picker(page).fill('rotation');
  await picker(page).press('ArrowDown');
  await picker(page).press('Enter');
  assert.equal(await picker(page).inputValue(), 'View rotation');
  assert.equal(await page.evaluate(() => window.pureAttractorsApp.state.__anim.ui.paramTargets.some(target => target.key === 'rotation')), false, 'Enter chooses a highlighted option before Add commits it');
  await add(page).click();
  assert.equal(await page.evaluate(() => window.pureAttractorsApp.state.__anim.ui.paramTargets.at(-1).key), 'rotation');
  await page.evaluate(() => { window.pureAttractorsApp.state.nested = {amount:17}; });
  await picker(page).fill('nested.amount');
  await add(page).click();
  assert.equal(await page.evaluate(() => window.pureAttractorsApp.state.__anim.ui.paramTargets.at(-1).key), 'nested.amount');
  assert.equal(await cardTitle(page, 'nested.amount').count(), 1);
  note('Filtering searches labels, keys and descriptions; keyboard selection and raw numeric paths preserve their underlying keys.');

  const fixture = await context.newPage();
  fixture.on('pageerror', error => errors.push(error.message));
  try {
    await fixture.goto(origin + '/__animation-picker-fixture.html');
    await fixture.waitForFunction(() => window.pickerFixture);
    assert.equal(await cardTitle(fixture, 'legacy.amount').count(), 1, 'Older targets without a current spec keep a readable raw-path fallback');
    await picker(fixture).fill('Position offset');
    const vectorLabels = await fixture.locator('.anim-param-option .anim-param-label').allTextContents();
    assert.deepEqual(vectorLabels, ['Position offset · X','Position offset · Y','Position offset · Z']);
    await keyedOption(fixture, 'position.y').hover();
    assert.equal(await fixture.locator('.anim-param-help[role="tooltip"]').textContent(), vectorDescription);
    await keyedOption(fixture, 'position.y').click();
    await add(fixture).click();
    assert.equal(await fixture.evaluate(() => window.pickerFixture.state.__anim.ui.paramTargets.at(-1).key), 'position.y');
    assert.equal(await cardTitle(fixture, 'Position offset · Y').count(), 1);
    assert.ok((await cardTitle(fixture, 'Position offset · Y').getAttribute('title')).includes(vectorDescription));
    note('Vector components inherit their display label and description while saving position.y; old saved paths remain usable.');

    for (const key of ['alpha','beta']) {
      await picker(fixture).fill('Duplicate value');
      assert.equal(await fixture.locator('.anim-param-option').count(), 2);
      await keyedOption(fixture, key).click();
      assert.equal(await picker(fixture).inputValue(), 'Duplicate value');
      await add(fixture).click();
      assert.equal(await fixture.evaluate(() => window.pickerFixture.state.__anim.ui.paramTargets.at(-1).key), key);
    }
    assert.equal(await cardTitle(fixture, 'Duplicate value').count(), 2);
    await picker(fixture).fill('Literal description');
    await keyedOption(fixture, 'markup').hover();
    assert.equal(await fixture.locator('.anim-param-help[role="tooltip"]').textContent(), literalDescription);
    assert.equal(await fixture.locator('.anim-param-help img, .anim-param-help strong').count(), 0);
    assert.equal(await fixture.evaluate(() => window.__descriptionInjected || 0), 0);
    await keyedOption(fixture, 'markup').click();
    await add(fixture).click();
    assert.ok((await cardTitle(fixture, 'Literal description').getAttribute('title')).includes(literalDescription));
    assert.equal(await fixture.locator('.anim-flow-card img, .anim-flow-card strong').count(), 0);
    await fixture.screenshot({ path:path.join(cache,'animation-param-picker-fixture.png'), fullPage:false, animations:'disabled' });
    note('Identical display labels retain distinct selected keys; descriptions stay literal text in options and flow cards.');
  } finally {
    await fixture.close();
  }
  const mobile = await context.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  try {
    await mobile.setViewportSize({width:390,height:844});
    await mobile.goto(origin + '/PureAttractors/');
    await mobile.waitForFunction(() => window.pureAttractorsApp);
    await mobile.locator('#button-info').click();
    const mobileTabs = mobile.getByRole('button', { name:'Show or hide tabs', exact:true });
    if (await mobileTabs.getAttribute('aria-expanded') !== 'true') await mobileTabs.click();
    await mobile.getByRole('tab', { name:'animate', exact:true }).click();
    await picker(mobile).fill('pointSize');
    await keyedOption(mobile, 'pointSize').hover();
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const popupFits = await mobile.locator('.anim-param-list, .anim-param-help').evaluateAll(nodes => nodes.every(node => {
      const box = node.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth + 1;
    }));
    assert.ok(popupFits, 'Picker options and description stay within the mobile viewport');
    await mobile.screenshot({path:path.join(cache,'animation-param-picker-mobile.png'),fullPage:false,animations:'disabled'});
    note('The open picker and description fit the shared controls at a 390px mobile viewport.');
  } finally {
    await mobile.close();
  }
  const regressions = await context.newPage();
  regressions.on('pageerror', error => errors.push(error.message));
  try {
    await regressions.goto(origin + '/tests/panel-regressions.html');
    await regressions.waitForFunction(() => ['passed','failed','pass','fail'].includes(document.body.dataset.testStatus), null, {timeout:60000});
    const result = await regressions.evaluate(() => ({status:document.body.dataset.testStatus,text:document.querySelector('#results')?.textContent || document.body.textContent}));
    assert.ok(['passed','pass'].includes(result.status), result.text);
    panelRegressions = result;
    note('Existing panel regressions: ' + result.text.split('\n')[0] + ' Includes freeform Add and animation subtab behavior.');
  } finally {
    await regressions.close();
  }
  assert.deepEqual(errors, [], 'No browser errors');
  await writeFile(path.join(cache,'animation-param-picker-validation.json'), JSON.stringify({result:'pass',checkedAt:new Date().toISOString(),checks,panelRegressions,errors}, null, 2) + '\n');
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
