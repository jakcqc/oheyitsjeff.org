"""Build 80 native algebraCOEF limit studies and their exact tail coefficients."""
import copy, json, re, shutil
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.local/abstract-studies/algebraCOEF-limits'
WILD=ROOT/'.local/abstract-studies/algebraCOEF-wild/tools'
PAIR=ROOT/'.local/abstract-studies/algebraCOEF/tools'

# Each entry: native parameter, stressed value, study title, visual hypothesis.
DATA={
'GameOfLife_aug':[
('cellPx',11,'Cell Dust','Small cells make a granular life field'),
('cellPx',170,'Giant Cells','Large cells turn the field into a few blocks'),
('protoNoise',.001,'Silent Noise','Almost no noise exposes threshold bands'),
('protoNoise',6,'Noise Six','High noise seeds scattered live islands'),
('protoNoise',10,'Noise Ten','Higher noise widens irregular live islands'),
('protoNoise',14,'Noise Fourteen','Heavy noise crowds the activation frontier'),
('protoNoise',18,'Noise Eighteen','Extreme noise fragments the threshold field'),
('protoNoise',22,'Noise Twenty Two','Maximum noise overwhelms regular field structure')],
'MondrianAbstraction':[
('grid.cellSize',18,'Micro Tiles 18','Extremely fine tiles crowd the grid'),
('grid.cellSize',20,'Micro Tiles 20','Fine tiles form a dense second scale'),
('grid.cellSize',22,'Micro Tiles 22','Fine tiles approach a woven field'),
('grid.cellSize',24,'Micro Tiles 24','Small tiles expose many local divisions'),
('grid.cellSize',260,'Monumental Tiles 260','Large tiles leave broad color blocks'),
('grid.cellSize',300,'Monumental Tiles 300','Few large tiles remain'),
('grid.cellSize',330,'Monumental Tiles 330','The grid approaches a handful of blocks'),
('grid.cellSize',400,'Monumental Tiles 400','Oversize tiles reduce the field to a few slabs')],
'BacteriaVisualizer':[
('ringCount',90,'Crowded Halo','Many rings form dense halos'),
('ringCount',1,'Single Halo','One ring exposes each colony core'),
('multiRingCount',95,'Orbit Crowd','Secondary rings overlap'),
('multiRingGap',180,'Separated Orbits','Wide gaps send rings beyond their hosts'),
('ringMinRadius',350,'Giant Nuclei','Large nuclei collide early'),
('ringMaxRadius',900,'Oversize Membranes','Membranes exceed the colony frame'),
('collisionPush',16,'Repulsion Shock','Strong collision response separates cells'),
('multiRingFade',.4,'Instant Fade','Fast decay favors earliest rings')],
'BacterialConstructs':[
('chemotaxis',24,'Chemotaxis Storm','Growth chases steep gradients'),
('chemotaxis',-16,'Negative Chemotaxis','Growth flees gradients'),
('diffusionA',8,'Diffuse A','Activator diffuses across the field'),
('diffusionB',8,'Diffuse B','Inhibitor spreads broadly'),
('growth',2,'Runaway Growth','Fast growth nears saturation'),
('feed',.35,'Feed Deluge','Heavy feeding sustains reaction zones'),
('kill',.35,'Kill Frontier','Heavy removal erases persistent zones'),
('contourLevels',44,'Contour Compression','Many isolines pack the field')],
'InnerLight':[
('custom.numElements',180,'Crowded Reliquary','Many elements overlap'),
('custom.numElements',3,'Three Remnants','Few elements expose the grammar'),
('custom.numSides',96,'Almost Circles','High polygon order approaches rings'),
('custom.numSides',3,'Triangle Engine','Minimal polygon order exposes triangles'),
('custom.radius',320,'Outer Radius','The first polygon reaches the edge'),
('custom.radius',.02,'Point Origin','The first polygon shrinks to a point'),
('custom.incrementSize',120,'Rapid Expansion','Successive elements rush outward'),
('custom.incrementSize',-35,'Radial Reversal','Later elements fold through the origin')],
'kakeya':[
('needleLen',700,'Seven Hundred Unit Needle','An enormous fitted needle dominates the Perron footprint'),
('needleThickPx',160,'Needle Wall','Wide tubes become opaque slabs'),
('baseWidth',80,'Wide Perron Fan','The starting triangle stretches the direction fan')],
'DomainColoring':[
('dotMaxRadius',90,'Complex Plane Planets','Large dots hide local phase'),
('contourCount',150,'Contour Torrent','Contour bands crowd the phase field'),
('ringDensity',450,'Pole Frequency','Tight rings radiate from singularities')],
'LissajousFigures':[
('freqA',280,'Frequency A Skyline','First frequency creates very dense folds'),
('freqB',233,'Frequency B Skyline','Second frequency creates competing folds'),
('amplitude',5,'Amplitude Escape','Large amplitude sends curves beyond the frame')],
'LorenzAttractor':[
('rho',400,'Rho Furnace','The orbit leaves its familiar wings'),
('sigma',320,'Sigma Shear','The trajectory crosses phase space rapidly'),
('beta',.015,'Beta Near Zero','Slow contraction stretches the orbit')],
'BoysSurfaceModel':[
('twist',720,'Double Twist','Two turns entangle ribbon sheets'),
('layerSpread',40,'Layer Exile','Large spacing opens gaps between sheets')],
'FractalPolyhedra':[
('spin',1440,'Four Turn Crystal','Repeated turns rotate recursive faces'),
('spread',35,'Crystal Scatter','Branches pull their shards apart')],
'Generic':[
('multibrot.Power',60,'Sixty Fold Escape','High exponent packs escape lobes'),
('multibrot.Power',-40,'Inverse Escape','Negative exponent reverses escape geometry')],
'HerwigHauserClassicCollection':[
('warp',90,'Algebraic Warp','Petals fold through abrupt crossings'),
('twist',-720,'Counter Twist','Reverse turns reorder the petals')],
'LSystemGarden':[
('angle',1440,'Four Turn Grammar','Branches repeatedly retrace directions'),
('jitterAngle',360,'Full Circle Jitter','Jitter scatters all branch headings')],
'MarbledPatterns':[
('amplitude',3200,'Marble Tsunami','High amplitude folds bands beyond the canvas'),
('swirlStrength',-120,'Reverse Vortex','Reverse swirl breaks bands into fragments')],
'OliverLabsCollection':[
('curl',320,'Curl Singularity','Currents change direction sharply'),
('stepSize',280,'Long Advection','Integration leaps across the field')],
'PinkallSchmittGunnHoffmannCollection':[
('frequency',700,'Surface Aliasing','Waves exceed lattice sampling rate'),
('amplitude',45,'Amplitude Cliff','Displacement folds contours into cliffs')],
'ProceduralGrass':[
('bladeHeight',700,'Seven Hundred Pixel Grass','Blades tower over the ground'),
('windStrength',12,'Hurricane Grass','Strong wind drives blades sideways')],
'QuasicrystallineWickerwork':[
('twist',1440,'Four Turn Weave','Strands cross competing directions'),
('radialWarp',35,'Warped Wicker','Aperiodic rings pull apart')],
'SpaceFillingCurves':[
('maxRectAspect',2200,'Stretched Parcels','Parcels become needle thin'),
('maxRectSize',3000,'Parcel Horizon','Huge parcels swallow nearby curves')],
'StepSplineLab':[
('sceneMagnitude',900,'Nine Hundred Unit Steps','Long signed steps fling fragments outward'),
('sceneMagnitude',-900,'Reverse Step Field','Reverse steps invert line direction')],
'SurferGalleryBiancaViolet':[
('warp',240,'Implicit Warp','Implicit contours fracture'),
('rotation',120,'Rotating Level Sets','Level sets cross at steep angles')],
'Voronoi':[
('strokeWidth',70,'Territory Walls','Thick borders compete with cells'),
('fillOpacity',.001,'Transparent Territories','Faint cells leave borders exposed')]
}

def rate(baseline, threshold):
    """P(X crosses threshold), X uniform on the disclosed expanded interval."""
    delta=abs(threshold-baseline)
    extension=max(.07*delta,1e-9)
    if threshold>=baseline:
        lo,hi=min(0,baseline),threshold+extension
        event='X >= threshold'
        rho=(hi-threshold)/(hi-lo)
    else:
        lo,hi=threshold-extension,max(0,baseline)
        event='X <= threshold'
        rho=(threshold-lo)/(hi-lo)
    return dict(symbol='rho',distribution='Uniform',interval=[lo,hi],event=event,
                threshold=threshold,value=rho,
                meaning='Probability of a parameter draw reaching this bound in the stressed direction; not a measured temporal or image frequency.')

def slug(s):
    return re.sub('[^a-z0-9]+','-',s.lower()).strip('-')

def main():
    wild=json.loads((WILD/'recipes-wild.json').read_text())
    pair=json.loads((PAIR/'recipes-algebracoef.json').read_text())
    base={r['app']:r for r in wild}
    for r in pair: base.setdefault(r['app'],r)
    catalog=json.loads((ROOT/'Apps/studies/catalog.json').read_text())
    kinds={r['app']:r['kind'] for r in catalog}
    totals=Counter(kinds[a] for a,values in DATA.items() for _ in values)
    assert len(DATA)==23 and totals=={'main':40,'math':40},totals
    for d in ('tools','svg','settings','previews'): (OUT/d).mkdir(parents=True,exist_ok=True)
    for name in ('render.mjs','native-flow.mjs'):
        shutil.copyfile(WILD/name,OUT/'tools'/name)
    recipes=[]
    for app in sorted(DATA):
        source=base[app]
        for ordinal,(key,value,title,hypothesis) in enumerate(DATA[app],1):
            recipe=copy.deepcopy(source)
            baseline=source['params'].get(key,{'sceneMagnitude':91,'color.hueStep':9,'color.fillOpacity':.45}.get(key))
            if not isinstance(baseline,(int,float)):
                raise ValueError(f'Missing numeric baseline {app}.{key}')
            for stale in ('algebra','propOps','operatorFormula','operatorNotes','captureStages','extremeParameters','sourceRandomization'):
                recipe.pop(stale,None)
            recipe.update(slug=f'algebracoef-limits-{slug(app)}-{ordinal:02d}-{slug(title)}',
                          title=title,concept=f'{hypothesis}. {key} = {value}.',
                          collection='algebraCOEF',batch='limits',seed=2026092500+len(recipes),
                          width=1200,height=1000,monochrome=False)
            if key=='sceneMagnitude':
                for item in recipe['params']['scene.items']:
                    item['magnitudeExpr']=f'{value} * sign(sin(43*pi*t)) * cos(13*pi*t)'
            else: recipe['params'][key]=value
            if app=='kakeya': recipe['params']['maxNeedles']=1200
            if app=='DomainColoring': recipe['params']['dotSpacing']=32
            if app=='Generic': recipe['params'].update(maxIterBase=120,minCellPx=12,maxCircles=2500)
            if app=='BacteriaVisualizer': recipe['frames']=20
            if app=='GameOfLife_aug':
                recipe['frames']=12
                recipe['flow']=[
                    {'kind':'effect','label':'E: sparse cell echoes','config':{
                        'effectType':'scale','elementType':'rect','selector':'rect:nth-of-type(7n)',
                        'rangeMin':.65,'rangeMax':1.3,'count':2,'spacing':'linear',
                        'opacityMode':'fixed','opacityFixed':.7}},
                    recipe['flow'][-1]]
            if app=='BacterialConstructs': recipe['params'].update(steps=240,resolution=100,seedCount=24)
            if app=='ProceduralGrass': recipe['params']['density']=160
            if app=='StepSplineLab': recipe['params']['scene.items']=recipe['params']['scene.items'][:7]
            if 'seed' in recipe['params']: recipe['params']['seed']=recipe['seed']
            operations=['A' if s['kind']=='transform' else s['config']['effectType'] for s in recipe['flow']]
            recipe['algebra']=dict(
                edition='limits',
                expression=' o '.join(reversed(operations))+' (G)',
                convention='Compose right to left. G is the native simulation at the recorded state and seed.',
                primaryExtreme=dict(parameter=key,baseline=baseline,value=value,direction='max' if value>=baseline else 'min'),
                rateCoefficient=rate(baseline,value),
                interpretation=hypothesis,
                sampling='Equal group allocation: 40 main and 40 math. Each of five main apps has eight works; each of 18 math apps has two or three. Stress values are deliberately selected.')
            recipe['tags']=['algebraCOEF','limits','extreme','rate coefficient',kinds[app],key]
            recipes.append(recipe)
    assert len(recipes)==80 and len({r['slug'] for r in recipes})==80
    (OUT/'tools/recipes-limits.json').write_text(json.dumps(recipes,indent=2)+'\n')
    print('Prepared 80 recipes: 40 main and 40 math across 23 visual apps.')

if __name__=='__main__': main()



