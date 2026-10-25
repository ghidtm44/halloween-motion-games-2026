import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/motion.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {MotionDetector}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
function pose(id=1,{wrist=.6,hip=.7,visibility=1,x=.5}={}){const landmarks=Array.from({length:33},()=>({x,y:.5,visibility}));landmarks[11].y=landmarks[12].y=.4;landmarks[15].y=landmarks[16].y=wrist;landmarks[23].y=landmarks[24].y=hip;return {id,landmarks};}
test('independent three-person gestures and cooldown avoid trigger storms',()=>{const detector=new MotionDetector();assert.equal(detector.update([pose(1),pose(2),pose(3)],1000).length,0);const effects=detector.update([pose(1,{wrist:.2}),pose(2,{hip:.6}),pose(3,{wrist:.4})],1200);assert.deepEqual(effects.map(x=>x.kind),['bats','candy','magic']);assert.equal(detector.update([pose(1,{wrist:.1}),pose(2,{hip:.4}),pose(3,{wrist:.1})],1300).length,0);});
test('stationary bodies and uncertain landmarks do not trigger effects',()=>{const detector=new MotionDetector();detector.update([pose()],1000);assert.equal(detector.update([pose()],1200).length,0);assert.equal(detector.update([pose(1,{visibility:.2,wrist:.1})],1400).length,0);});
test('lost/reacquired person and explicit reset do not cause false velocity spikes',()=>{const detector=new MotionDetector();detector.update([pose()],1000);assert.equal(detector.update([pose(1,{wrist:.1,hip:.2})],3000).length,0);detector.reset();assert.equal(detector.update([pose(1,{wrist:.7,hip:.7})],3100).length,0);});
test('tiny jitter cannot create a gesture by switching the higher wrist',()=>{const detector=new MotionDetector();const first=pose();first.landmarks[15]={x:.2,y:.6,visibility:1};first.landmarks[16]={x:.8,y:.61,visibility:1};detector.update([first],1000);const next=structuredClone(first);next.landmarks[15].y=.61;next.landmarks[16].y=.6;assert.equal(detector.update([next],1100).length,0);});
