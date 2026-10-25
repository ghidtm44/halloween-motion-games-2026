"""Deterministic extraction/optimization of inspected generated art. Pillow required.
No illustration generation or background removal: original RGBA is preserved.
"""
from pathlib import Path
from PIL import Image, ImageOps
import json, hashlib

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).parent
OUT = ROOT / 'apps/simple-playground-v1/public/art/worlds-v2'
OUT.mkdir(parents=True, exist_ok=True)
records = []

def emit(name, source, rect=None, limit=512, route=False):
    original = Image.open(SOURCE / (source + '-source.png')).convert('RGBA')
    rect = rect or (0, 0, *original.size)
    im = original.crop(rect)
    bounds = im.getchannel('A').getbbox()
    if not bounds: raise ValueError(name + ' empty')
    if not route and 'backdrop' not in name and 'foreground' not in name:
        im = im.crop(bounds)
    im.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    if route:
        # Mirrored repeat has identical opposite edges, without invented detail.
        tile = im.resize((256,256), Image.Resampling.LANCZOS)
        im = Image.new('RGBA',(512,512))
        im.paste(tile,(0,0)); im.paste(ImageOps.mirror(tile),(256,0))
        im.paste(ImageOps.flip(tile),(0,256)); im.paste(ImageOps.flip(ImageOps.mirror(tile)),(256,256))
    else:
        # Four transparent texels keep alpha edges away from sampler boundaries.
        if 'backdrop' not in name and 'foreground' not in name:
            padded = Image.new('RGBA',(im.width+8, im.height+8)); padded.paste(im,(4,4)); im=padded
    path=OUT/(name+'.webp')
    im.save(path,'WEBP',quality=90,method=6,exact=True)
    records.append(dict(name=name,file=path.name,source=source+'-source.png',sourceSize=list(original.size),crop=list(rect),alphaBounds=list(bounds),width=im.width,height=im.height,pivot=[.5,.5],bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))

def row(source, breaks, names, limit=384):
    im=Image.open(SOURCE/(source+'-source.png'))
    for n,(left,right) in enumerate(zip(breaks,breaks[1:])):
        emit(names[n],source,(left,0,right,im.height),limit)

for world in ['jungle','depths','space']:
    emit(world+'-backdrop',world+'-backdrop',limit=1672)
    emit(world+'-foreground',world+'-foreground',limit=1280)
    emit(world+'-route',world+'-route',route=True)

for world,breaks in [('jungle',[0,770,1510,2172]),('depths',[0,660,1340,1968]),('space',[0,770,1370,2172])]:
    row(world+'-collectibles',breaks,[world+'-'+x for x in ['candy','star','bubble']])
for world,breaks in [('jungle',[0,720,1450,2172]),('depths',[0,700,1210,1942]),('space',[0,780,1360,2172])]:
    row(world+'-midground',breaks,[world+'-prop'+str(i) for i in range(3)])
for world,breaks in [('depths',[0,845,1650,2172]),('space',[0,785,1585,2172])]:
    row(world+'-obstacles',breaks,[world+'-'+x for x in ['duck','jump','dodge']])

# This board has staggered, overlapping bounding rectangles. Extract separate
# alpha-connected silhouettes, preserving all original visible pixels.
def jungle_obstacles():
    im=Image.open(SOURCE/'jungle-obstacles-source.png').convert('RGBA')
    # Inspected diagonal empty gutter divides branch and log; no visible pixels
    # cross this separator. Keep zero-alpha RGB untouched in the source archive.
    regions=[('duck',(0,0,940,704)),('jump',(680,350,1598,730)),('dodge',(1598,0,2048,730))]
    for name,rect in regions:
        crop=im.crop(rect);px=crop.load()
        for y in range(crop.height):
            for x in range(crop.width):
                sx,sy=x+rect[0],y+rect[1]
                boundary=1000-.47*sy
                if (name=='duck' and sx>boundary) or (name=='jump' and sx<=boundary):
                    px[x,y]=(0,0,0,0)
        # Retain the original sheet as provenance; extracted image is a build input.
        temporary=SOURCE/(f'.extract-{name}-source.png');crop.save(temporary)
        emit('jungle-'+name,'.extract-'+name,limit=384)
        records[-1].update(source='jungle-obstacles-source.png',sourceSize=list(im.size),crop=list(rect),separator='x=1000-0.47*y; inspected empty diagonal gutter')
        temporary.unlink()
jungle_obstacles()

for world,rects in [('space',[(0,0,670,627),(670,0,1254,627),(0,627,670,1254),(670,627,1254,1254)]),('depths',[(0,0,685,580),(685,0,1254,580),(0,580,565,1254),(565,580,1254,1254)])]:
    for i,rect in enumerate(rects):emit(world+'-actor'+str(i),world+'-character',rect,512)

row('jungle-distant',[0,705,1505,1993],['jungle-actor0','jungle-actor1','jungle-distant0'],512)
for world,breaks in [('depths',[0,695,1440,2172]),('space',[0,780,1475,2172])]:
    row(world+'-distant',breaks,[world+'-distant'+str(i) for i in range(3)])
row('shared-atmosphere',[0,900,1480,2172],[w+'-atmosphere' for w in ['jungle','depths','space']],768)
row('shared-celebration',[0,720,1450,2172],[w+'-celebration' for w in ['jungle','depths','space']],384)

manifest=dict(version=2,stage=[1280,720],artDirection='Original dimensional painted family adventure',jungleActor='Original blue-and-gold macaw, two independent wing poses; monkey request blocked by output moderation and stopped',animation='Independent poses with transform animation, anticipation, source trails and success reactions; not frame-perfect generated animation',assets=records)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(assets=len(records),runtimeBytes=sum(r['bytes'] for r in records),decodedRGBABytes=sum(r['width']*r['height']*4 for r in records)),indent=2))
