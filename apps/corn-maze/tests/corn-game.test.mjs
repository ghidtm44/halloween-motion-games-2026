import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/corn-game.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {CornMazeGame}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const hand=(id,x,y,confidence=1)=>({id,x,y,confidence});

function hold(game,hands,ms=450,enabled=true){
  const events=[];
  for(let left=ms;left>0;left-=50)events.push(...game.step(Math.min(50,left),hands,enabled));
  return events;
}

function move(game,hands,destinations){
  const events=[];
  const initial=hands.map(h=>({...h}));
  for(let step=1;step<=8;step++){
    const current=initial.map((h,i)=>({...h,x:h.x+(destinations[i].x-h.x)*step/8,y:h.y+(destinations[i].y-h.y)*step/8}));
    events.push(...game.step(35,current));
  }
  return {hands:initial.map((h,i)=>({...h,...destinations[i]})),events};
}

function harvest(game){
  game.releaseHands();
  const items=game.snapshot().items.filter(item=>item.kind==='corn'&&!item.collected);
  let hands=items.map((item,i)=>hand(`player:${i}`,item.x,item.y));
  const grabs=hold(game,hands);
  assert.equal(grabs.filter(event=>event.kind==='grab').length,items.length);
  const moved=move(game,hands,items.map((_,i)=>({x:i===0?.2:.8,y:.78})));hands=moved.hands;
  const events=[...moved.events,...hold(game,hands,300)];
  assert.equal(events.filter(event=>event.kind==='deposit').length,items.length);
  assert.equal(game.snapshot().phase,'choose');
}

function travel(game,direction){
  const target=game.snapshot().targets.find(item=>item.direction===direction);
  assert.ok(target,`Expected ${direction} path in ${game.snapshot().room}`);
  game.releaseHands();
  const hands=[hand('route',target.x,target.y)];
  const events=hold(game,hands,700);
  assert.equal(events.filter(event=>event.kind==='travel').length,1);
  assert.equal(game.snapshot().phase,'travel');
  const arrived=hold(game,hands,2800);
  assert.equal(arrived.filter(event=>event.kind==='arrive').length,1);
  return arrived;
}

test('complete cooperative route requires six harvested corn cobs and exits exactly once',()=>{
  const game=new CornMazeGame();
  assert.equal(game.snapshot().phase,'collect');assert.equal(game.snapshot().targets.length,0);
  harvest(game);assert.equal(game.snapshot().collected,2);
  travel(game,'right');assert.equal(game.snapshot().room,'grove');
  harvest(game);assert.equal(game.snapshot().collected,4);
  travel(game,'left');assert.equal(game.snapshot().room,'harvest');
  assert.equal(game.snapshot().targets.length,0);
  harvest(game);assert.equal(game.snapshot().collected,6);
  const events=travel(game,'left');assert.equal(events.filter(event=>event.kind==='win').length,1);
  const final=game.snapshot();assert.equal(final.phase,'won');assert.equal(final.room,'exit');assert.equal(final.goal,6);
  assert.deepEqual(final.visited,['Moonlit Gate','Firefly Fork','Harvest Hollow','The Moonlight Meadow']);
  assert.deepEqual(hold(game,[hand('a',.5,.5)],10000),[]);assert.equal(game.snapshot().collected,6);
});

test('both mystery-box dead ends return to their forks without respawning harvested rewards',()=>{
  const game=new CornMazeGame();harvest(game);travel(game,'left');
  assert.equal(game.snapshot().room,'deadendA');
  const box=game.snapshot().items[0],hands=['c','a','b'].map(id=>hand(id,box.x,box.y));
  const events=hold(game,hands,1000);
  assert.equal(events.filter(event=>event.kind==='bonus').length,1);assert.equal(game.snapshot().bonus,1);assert.equal(game.snapshot().collected,2);
  travel(game,'back');assert.equal(game.snapshot().room,'start');assert.equal(game.snapshot().phase,'choose');
  assert.ok(game.snapshot().items.every(item=>item.collected));
  travel(game,'left');assert.equal(game.snapshot().phase,'choose');
  assert.equal(hold(game,hands,1500).filter(event=>event.kind==='bonus').length,0);
  travel(game,'back');travel(game,'right');harvest(game);travel(game,'right');
  assert.equal(game.snapshot().room,'deadendB');
  game.releaseHands();const secondBox=game.snapshot().items[0];
  assert.equal(hold(game,[hand('box',secondBox.x,secondBox.y)]).filter(event=>event.kind==='bonus').length,1);
  assert.equal(game.snapshot().bonus,2);travel(game,'back');assert.equal(game.snapshot().room,'grove');assert.equal(game.snapshot().phase,'choose');
  assert.equal(game.snapshot().collected,4);
  assert.deepEqual(game.snapshot().visited,['Moonlit Gate','Whispering Nook','Firefly Fork','Scarecrow Surprise']);
});

test('three simultaneous hands settle contested pickups deterministically and deposit each item once',()=>{
  const game=new CornMazeGame(),[left,right]=game.snapshot().items;
  const hands=[hand('b',left.x,left.y),hand('c',right.x,right.y),hand('a',left.x,left.y)];
  assert.equal(hold(game,hands,400).length,0);
  const events=game.step(50,hands);
  assert.equal(events.filter(event=>event.kind==='grab').length,2);
  assert.deepEqual(game.snapshot().items.map(item=>item.heldBy),['a','c']);
  const moved=move(game,[hands[2],hands[1]], [{x:.2,y:.78},{x:.8,y:.78}]);
  const deposited=[...moved.events,...hold(game,moved.hands,2000)];
  assert.equal(deposited.filter(event=>event.kind==='deposit').length,2);assert.equal(game.snapshot().collected,2);
  game.releaseHands();assert.equal(hold(game,hands,2000).filter(event=>event.kind==='deposit'||event.kind==='grab').length,0);
});

test('lost and uncertain hands drop corn immediately, preserve rewards, and clear dwell',()=>{
  const game=new CornMazeGame(),item=game.snapshot().items[0],h=hand('a',item.x,item.y);
  hold(game,[h],400);game.step(50,[]);
  assert.equal(game.snapshot().items[0].progress,0);assert.equal(hold(game,[h],400).length,0);
  assert.equal(game.step(50,[h])[0].kind,'grab');
  const moved=move(game,[h],[{x:.4,y:.6}]);
  assert.equal(game.snapshot().items[0].heldBy,'a');
  const events=game.step(50,[{...moved.hands[0],confidence:.54}]);
  assert.equal(events[0].kind,'drop');
  const dropped=game.snapshot().items[0];assert.equal(dropped.heldBy,null);assert.equal(dropped.x,dropped.homeX);assert.equal(dropped.y,dropped.homeY);assert.equal(game.snapshot().collected,0);
  hold(game,[h]);assert.equal(game.step(50,[])[0].kind,'drop');
});

test('tracking jumps, invalid coordinates, and input resets never transfer item ownership',()=>{
  const game=new CornMazeGame(),item=game.snapshot().items[0],h=hand('a',item.x,item.y);
  hold(game,[h]);
  const events=game.step(50,[hand('a',.95,.05),hand('b',item.x,item.y)]);
  assert.equal(events.filter(event=>event.kind==='drop').length,1);assert.equal(game.snapshot().items[0].heldBy,null);
  assert.equal(game.snapshot().hands.some(cursor=>cursor.id==='a'),false);
  assert.equal(hold(game,[hand('b',item.x,item.y)],350).filter(event=>event.kind==='grab').length,0);
  assert.equal(game.step(50,[hand('b',item.x,item.y)])[0].kind,'grab');
  game.releaseHands();assert.equal(game.snapshot().items[0].heldBy,null);assert.equal(game.snapshot().hands.length,0);
  const unsafe=[hand('a',-1,.4),hand('b',1.1,.4),hand('c',.3,NaN),hand('d',.3,.4,NaN)];
  assert.equal(hold(game,unsafe,1000).length,0);assert.equal(game.snapshot().hands.length,0);
  const copied=hand('copy',item.x,item.y);hold(game,[copied]);copied.x=.9;
  assert.equal(game.snapshot().hands[0].x,item.x,'Input mutations must not alter stored hand positions');
});

test('pause freezes state, releases partial gestures, and a large frame cannot skip dwell',()=>{
  const game=new CornMazeGame(),item=game.snapshot().items[0],h=hand('a',item.x,item.y);
  hold(game,[h],400);hold(game,[h],5000,false);
  assert.equal(game.snapshot().items[0].progress,0);assert.equal(game.snapshot().collected,0);
  assert.equal(game.step(5000,[h]).length,0);assert.ok(game.snapshot().items[0].progress<.25);
  hold(game,[h],350);assert.equal(game.snapshot().items[0].heldBy,'a');
  hold(game,[h],500,false);assert.equal(game.snapshot().items[0].heldBy,null);
  assert.equal(game.step(NaN,[h]).length,0);assert.equal(game.snapshot().items[0].progress,0);
});

test('travel requires present hands, freezes when paused, and resumes without catch-up',()=>{
  const game=new CornMazeGame();harvest(game);game.releaseHands();
  const target=game.snapshot().targets.find(item=>item.direction==='right'),h=hand('a',target.x,target.y);
  hold(game,[h],700);assert.equal(game.snapshot().phase,'travel');
  hold(game,[h],500);const progress=game.snapshot().travelProgress;
  hold(game,[],3000);assert.equal(game.snapshot().travelProgress,progress);
  hold(game,[h],3000,false);assert.equal(game.snapshot().travelProgress,progress);
  game.step(20000,[h]);assert.ok(game.snapshot().travelProgress-progress<=100/2800+.0001);
  hold(game,[h],2200);assert.equal(game.snapshot().room,'grove');assert.equal(game.snapshot().phase,'collect');
});

test('dwell follows physical circular hitboxes and resets when leaving a basket or target',()=>{
  const game=new CornMazeGame(),item=game.snapshot().items[0];
  const inside=hand('a',item.x,item.y+item.radius*1280/720*.95);
  assert.equal(hold(game,[inside]).filter(event=>event.kind==='grab').length,1,'Equal visual offsets vertically fit the same circle');
  const moved=move(game,[inside],[{x:.5,y:.78}]);
  const elsewhere=[hand('a',.5,.55)];game.step(50,elsewhere);
  assert.equal(game.snapshot().collected,0);
  const back=[hand('a',.5,.78)];game.step(50,back);
  hold(game,back,150);assert.equal(game.snapshot().collected,0);
  hold(game,back,50);assert.equal(game.snapshot().collected,1);
});

test('a continuously held sign cannot send the team straight back into the same dead end',()=>{
  const game=new CornMazeGame();harvest(game);travel(game,'left');
  const box=game.snapshot().items[0];hold(game,[hand('box',box.x,box.y)]);travel(game,'back');
  const routeHand=hand('route',.22,.43);
  assert.equal(hold(game,[routeHand],1800).filter(event=>event.kind==='travel').length,0);
  assert.equal(game.snapshot().room,'start');assert.equal(game.snapshot().phase,'choose');
  game.step(50,[hand('route',.22,.65)]);
  assert.equal(hold(game,[routeHand],700).filter(event=>event.kind==='travel').length,1);
});

test('snapshots are independent and reset restores a completely fresh game',()=>{
  const game=new CornMazeGame();const snapshot=game.snapshot();
  snapshot.items[0].collected=true;snapshot.items[0].x=99;snapshot.baskets[0].radius=999;snapshot.visited.push('fake');
  assert.equal(game.snapshot().items[0].collected,false);assert.equal(game.snapshot().items[0].x,.3);assert.equal(game.snapshot().baskets[0].radius,.075);assert.equal(game.snapshot().visited.length,1);
  harvest(game);const targets=game.snapshot().targets;targets[0].destination='exit';assert.equal(game.snapshot().targets[0].destination,'deadendA');
  travel(game,'left');const box=game.snapshot().items[0];hold(game,[hand('box',box.x,box.y)]);
  game.reset();const reset=game.snapshot();
  assert.equal(reset.room,'start');assert.equal(reset.phase,'collect');assert.equal(reset.collected,0);assert.equal(reset.bonus,0);assert.equal(reset.travelProgress,0);
  assert.equal(reset.items.filter(item=>!item.collected).length,2);assert.equal(reset.hands.length,0);assert.deepEqual(reset.visited,['Moonlit Gate']);
});
