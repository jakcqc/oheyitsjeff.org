import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const deps=process.env.SVG_EXPORT_NODE_MODULES || 'C:/Users/jaker/AppData/Local/Temp/image-svg-test-runner/node_modules';
const {createCanvas,loadImage}=require(path.join(deps,'@napi-rs/canvas'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'.local/abstract-studies/algebraCOEF-limits');
const publicRoot=path.join(root,'Apps/studies');
const recipes=JSON.parse(await readFile(path.join(out,'tools/recipes-limits.json'),'utf8'));
if(recipes.length!==80 || new Set(recipes.map(r=>r.slug)).size!==80)throw new Error('Expected 80 unique recipes');
const original=JSON.parse(await readFile(path.join(publicRoot,'catalog.json'),'utf8'));
const oldSlugs=new Set(recipes.map(r=>r.slug));
const catalog=original.filter(r=>!oldSlugs.has(r.slug));
const sourceNames=new Map(catalog.map(r=>[r.app,r]));
for(const r of recipes){
  const record=JSON.parse(await readFile(path.join(out,'settings',r.slug+'.record.json'),'utf8'));
  if(!record.flowStats?.stages?.length || !record.flowStats.stages.every(s=>s.changed))throw new Error('Ineffective flow: '+r.slug);
  const state=JSON.parse(await readFile(path.join(out,'settings',r.slug+'.json'),'utf8'));
  const source=await loadImage(path.join(out,'previews',r.slug+'.png'));
  const preview=createCanvas(480,400);preview.getContext('2d').drawImage(source,0,0,480,400);
  let encoded;
  for(const quality of [72,64,56,48,40,32,24,16,8,4]){encoded=await preview.encode('webp',quality);if(encoded.length<=48*1024)break;}
  if(encoded.length>48*1024)throw new Error('Thumbnail over 48 KiB: '+r.slug);
  await writeFile(path.join(publicRoot,'thumbnails',r.slug+'.webp'),encoded);
  for(const [dir,ext] of [['svg','svg'],['settings','json']])
    await copyFile(path.join(out,dir,r.slug+'.'+ext),path.join(publicRoot,dir,r.slug+'.'+ext));
  await writeFile(path.join(publicRoot,'flows',r.slug+'.flow.json'),
    JSON.stringify({schemaVersion:1,name:r.title,stages:state.__toolFlows.stages},null,2)+'\n');
  const formal={title:r.title,source:r.source,visualId:r.visualId,seed:r.seed,frames:r.frames||0,
    algebra:r.algebra,nativeFlow:'../flows/'+r.slug+'.flow.json',
    nativeSettings:'../settings/'+r.slug+'.json',observedStages:record.flowStats.stages};
  await writeFile(path.join(publicRoot,'algebra',r.slug+'.algebra.json'),JSON.stringify(formal,null,2)+'\n');
  const family=sourceNames.get(r.app);
  if(!family)throw new Error('Unknown source app: '+r.app);
  catalog.push({slug:r.slug,app:r.app,visualId:r.visualId,appName:family.appName,title:r.title,
    concept:r.concept,background:r.background,width:r.width,height:r.height,elements:record.elements,
    frames:r.frames||0,kind:family.kind,monochrome:!!r.monochrome,collection:'algebraCOEF',batch:'limits',
    rateCoefficient:r.algebra.rateCoefficient.value,extremeParameter:r.algebra.primaryExtreme.parameter,
    extremeValue:r.algebra.primaryExtreme.value,tags:r.tags});
}
await writeFile(path.join(publicRoot,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log('Published '+recipes.length+' limits studies; catalog contains '+catalog.length+'.');

