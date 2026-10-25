import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('all original raster runtime assets are bundled, bounded and match their manifest',async()=>{
 const root=new URL('../public/art/worlds-v2/',import.meta.url),m=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));assert.equal(m.assets.length,59);assert.equal(new Set(m.assets.map(a=>a.name)).size,59);let bytes=0,decoded=0;
 for(const a of m.assets){assert.match(a.file,/^[a-z0-9-]+\.webp$/);const b=await readFile(new URL(a.file,root));assert.equal(b.subarray(0,4).toString(),'RIFF');assert.equal(b.subarray(8,12).toString(),'WEBP');assert.equal(createHash('sha256').update(b).digest('hex'),a.sha256);assert.equal(b.length,a.bytes);bytes+=b.length;decoded+=a.width*a.height*4;}
 assert.ok(bytes<6*1024*1024);assert.ok(decoded<75*1024*1024);for(const w of ['jungle','depths','space'])for(const role of ['backdrop','foreground','route','candy','star','bubble','duck','jump','dodge','actor0','actor1','atmosphere','celebration'])assert.ok(m.assets.some(a=>a.name===`${w}-${role}`));
});
