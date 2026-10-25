from pathlib import Path
from PIL import Image
import hashlib,json
app=Path(__file__).resolve().parents[1];root=app.parents[1];src=root/'art-source/host-v2';out=app/'public/art/host-v2';out.mkdir(parents=True,exist_ok=True);items=[]
def save(name,file,box=None):
 im=Image.open(src/file).convert('RGBA')
 if box: im=im.crop(box)
 p=out/(name+'.webp');im.save(p,'WEBP',quality=92,method=6)
 items.append(dict(name=name,source=file,crop=box,width=im.width,height=im.height,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
save('stage','host-stage-source.png');save('head','host-rig-head-source.png')
for name,box in {'eye-left':(70,245,295,402),'eye-right':(330,245,555,402),'brow-left':(600,205,930,395),'brow-right':(940,205,1254,395),'jaw':(22,650,598,1185),'collar':(570,650,1254,1180)}.items():save(name,'host-rig-parts-source.png',box)
(out/'manifest.json').write_text(json.dumps(dict(version=2,description='Original generated character, separately articulated eyes, brows and jaw. Generated source and prompts in art-source/host-v2.',assets=items),indent=2)+'\n')
print({'assets':len(items),'bytes':sum(i['bytes'] for i in items)})
