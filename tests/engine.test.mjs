import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rotateMask,sameShape,moduleShape,portsFor,degreeOf,evaluateNetwork,createGame,applyAction,solveNetwork,createLevel } from '../src/engine.mjs';
import { CHAPTERS,LEVELS,VOYAGES,TUTORIAL,findLevel,dailyLevel,voyageLevel } from '../src/campaign.mjs';
import { topologyFingerprint,independentSolutions } from '../tools/generate-campaign.mjs';

const tree={width:2,height:2,lighthouseIndex:0},treeMasks=[6,8,3,8];
const shapes=[2,14,10,8,2,11,14,8,6,14,11,12,1,3,8,1];

test('mask rotation keeps port shapes and all four directions agree',()=>{
  assert.deepEqual([0,1,2,3].map(turns=>rotateMask(1,turns)),[1,2,4,8]);
  assert.equal(rotateMask(1,-1),8);assert.equal(rotateMask(10,1),5);assert.equal(rotateMask(15,1),15);
  assert.deepEqual(portsFor(13),['N','S','W']);
  assert.equal(moduleShape(1),'end');assert.equal(moduleShape(5),'straight');assert.equal(moduleShape(3),'corner');assert.equal(moduleShape(7),'tee');assert.equal(moduleShape(15),'cross');
  for(let mask=1;mask<=15;mask++)for(let turn=-4;turn<=4;turn++) {
    const rotated=rotateMask(mask,turn);assert.ok(sameShape(mask,rotated));assert.equal(degreeOf(rotated),degreeOf(mask));
  }
  assert.equal(sameShape(5,3),false);assert.throws(()=>rotateMask(0),/mask/);assert.throws(()=>rotateMask(1,0.5),/integer/);
});

test('true tree satisfies every completion condition and lighthouse always powers itself',()=>{
  const result=evaluateNetwork(tree,treeMasks);
  assert.equal(result.solved,true);assert.equal(result.edgeCount,3);assert.equal(result.components,1);assert.equal(result.cycleCount,0);assert.equal(result.reachableCount,4);assert.equal(result.dangling.length,0);
  const isolated=evaluateNetwork({width:2,height:1,lighthouseIndex:0},[1,1]);
  assert.deepEqual([...isolated.powered],[0]);assert.equal(isolated.solved,false);
});

test('border ports and one-sided contacts never count as legal reciprocal connections',()=>{
  const border=evaluateNetwork(tree,[7,8,3,8]);
  assert.equal(border.allConnected,true);assert.equal(border.portsComplete,false);assert.equal(border.solved,false);
  assert.ok(border.dangling.some(port=>port.index===0&&port.direction==='N'&&port.reason==='border'));
  const mismatch=evaluateNetwork({width:2,height:1,lighthouseIndex:0},[2,2]);
  assert.equal(mismatch.reachableCount,1);assert.equal(mismatch.edgeCount,0);
  assert.ok(mismatch.dangling.some(port=>port.reason==='mismatch'));
});

test('a fully reciprocal loop fails even when all cells are powered',()=>{
  const result=evaluateNetwork(tree,[6,12,3,9]);
  assert.equal(result.allConnected,true);assert.equal(result.portsComplete,true);assert.equal(result.hasCycle,true);assert.equal(result.cycleCount,1);assert.equal(result.solved,false);
});

test('a closed isolated loop and a separate lighthouse branch remain incomplete',()=>{
  const result=evaluateNetwork({width:3,height:2,lighthouseIndex:2},[6,12,4,3,9,1]);
  assert.equal(result.portsComplete,true);assert.equal(result.reachableCount,2);assert.equal(result.components,2);assert.equal(result.cycleCount,1);assert.equal(result.solved,false);
  const separate=evaluateNetwork(tree,[2,8,2,8]);
  assert.equal(separate.acyclic,true);assert.equal(separate.portsComplete,true);assert.equal(separate.components,2);assert.equal(separate.solved,false);
});

test('clockwise, counterclockwise and lock notes are immutable and count only actual turns',()=>{
  const initial=createGame(LEVELS[0]),index=TUTORIAL.actionIndex;
  const rotated=applyAction(initial,{type:'rotate',index,turns:1});
  assert.equal(rotated.accepted,true);assert.equal(rotated.state.moves,1);assert.equal(initial.moves,0);
  const back=applyAction(rotated.state,{type:'rotate',index,turns:-1}).state;
  assert.deepEqual(back.orientations,initial.orientations);assert.equal(back.moves,2);
  const locked=applyAction(initial,{type:'toggle-lock',index}).state;
  assert.equal(locked.locked[index],true);assert.equal(initial.locked[index],false);assert.equal(locked.moves,0);
  assert.deepEqual(locked.orientations,initial.orientations);assert.equal(locked.evaluation.solved,initial.evaluation.solved);
  const blocked=applyAction(locked,{type:'rotate',index,turns:1});assert.equal(blocked.accepted,false);assert.equal(blocked.state,locked);
  assert.equal(applyAction(locked,{type:'toggle-lock',index}).state.locked[index],false);
});

test('invalid actions and fixed-shape rotations are atomic no-ops',()=>{
  const game=createGame(LEVELS[0]);
  for(const action of [{type:'rotate',index:-1},{type:'rotate',index:999},{type:'rotate',index:0,turns:0},{type:'rotate',index:0,turns:2},{type:'unknown',index:0}]) {
    const result=applyAction(game,action);assert.equal(result.accepted,false);assert.equal(result.state,game);
  }
  const cross=createGame({id:'cross',width:2,height:2,lighthouseIndex:0,initial:[15,1,1,1]});
  assert.equal(applyAction(cross,{type:'rotate',index:0,turns:1}).reason,'fixed-shape');
  assert.throws(()=>createGame(LEVELS[0],{orientations:Array(9).fill(15)}),/shape/);
  assert.throws(()=>createGame(LEVELS[0],{locked:[true]}),/Locks/);
  assert.throws(()=>createGame(LEVELS[0],{moves:-1}),/Moves/);
});

test('completed state blocks rotation but notes stay independent of victory',()=>{
  const won=createGame(LEVELS[0],{orientations:LEVELS[0].solution,moves:2});
  assert.equal(won.status,'won');assert.equal(applyAction(won,{type:'rotate',index:0,turns:1}).state,won);
  const note=applyAction(won,{type:'toggle-lock',index:0}).state;assert.equal(note.status,'won');assert.equal(note.moves,2);
  const restored=createGame(won.level,{orientations:TUTORIAL.before.orientations,locked:TUTORIAL.before.locked,moves:TUTORIAL.before.moves});
  assert.equal(restored.status,'playing');assert.deepEqual(restored.orientations,TUTORIAL.before.orientations);
});

test('solver distinguishes two answers, exhausted budget, one complete answer and impossibility',()=>{
  const board={width:4,height:4,lighthouseIndex:5};
  const ambiguous=solveNetwork(board,shapes,{limit:2,maxNodes:1000});
  assert.equal(ambiguous.count,2);assert.equal(ambiguous.complete,false);assert.equal(ambiguous.limitReached,true);assert.equal(ambiguous.exhausted,false);
  assert.equal(independentSolutions(board,shapes).count,2);
  const budget=solveNetwork(board,shapes,{limit:2,maxNodes:1});assert.equal(budget.exhausted,true);assert.equal(budget.complete,false);assert.equal(budget.nodes,1);
  const unique=solveNetwork(tree,treeMasks,{limit:2});assert.equal(unique.count,1);assert.equal(unique.complete,true);assert.equal(unique.exhausted,false);
  const stopped=solveNetwork(tree,treeMasks,{limit:1});assert.equal(stopped.count,1);assert.equal(stopped.complete,false);assert.equal(stopped.limitReached,true);
  const impossible=solveNetwork(tree,[1,1,1,1],{limit:2});assert.equal(impossible.count,0);assert.equal(impossible.complete,true);
  assert.throws(()=>solveNetwork(tree,treeMasks,{maxNodes:0}),/budget/);
  assert.throws(()=>solveNetwork(tree,treeMasks,{limit:0}),/limit/);
});

test('campaign and voyage corpus have exact sizes, stable identifiers and 168 distinct actual topologies',()=>{
  assert.equal(CHAPTERS.length,6);assert.equal(LEVELS.length,48);assert.equal(VOYAGES.length,120);
  const all=[...LEVELS,...VOYAGES];
  assert.equal(new Set(all.map(level=>level.id)).size,168);
  assert.equal(new Set(all.map(level=>topologyFingerprint(level))).size,168);
  for(let chapter=0;chapter<6;chapter++)assert.equal(LEVELS.filter(level=>level.chapter===chapter).length,8);
  for(let size=4;size<=6;size++)assert.equal(VOYAGES.filter(level=>level.width===size).length,40);
  for(let i=0;i<LEVELS.length;i++){assert.equal(LEVELS[i].order,i+1);assert.equal(LEVELS[i].chapter,Math.floor(i/8));}
  assert.deepEqual(CHAPTERS.map(chapter=>chapter.collectible),['铜制船铃','白鸥海螺','珊瑚罗盘','雾海漂流瓶','月潮鲸歌','琥珀灯塔']);
});

for(const level of [...LEVELS,...VOYAGES])test(`${level.id}: independent second-solution search, shape preservation, and live victory evaluation`,()=>{
  assert.equal(level.unique,true);assert.equal(level.total,level.width*level.height);
  assert.equal(evaluateNetwork(level,level.initial).solved,false);
  assert.equal(evaluateNetwork(level,level.solution).solved,true);
  for(let index=0;index<level.total;index++){assert.ok(sameShape(level.initial[index],level.solution[index]));assert.notEqual(moduleShape(level.solution[index]),'cross');}
  // A deliberately poisoned answer proves neither search reads solution.
  const board={width:level.width,height:level.height,lighthouseIndex:level.lighthouseIndex,solution:Array(level.total).fill(15)};
  const production=solveNetwork(board,level.initial,{limit:2,maxNodes:100000});
  const independent=independentSolutions(board,level.initial,{limit:2,maxNodes:1000000});
  for(const proof of [production,independent]){assert.equal(proof.count,1);assert.equal(proof.complete,true);assert.equal(proof.exhausted,false);assert.deepEqual(proof.solutions[0],level.solution);}
  let replayed=createGame(level);
  for(let index=0;index<level.total;index++)for(let turns=0;turns<3&&replayed.orientations[index]!==independent.solutions[0][index];turns++){
    const action=applyAction(replayed,{type:'rotate',index,turns:1});assert.equal(action.accepted,true);replayed=action.state;
  }
  assert.equal(replayed.status,'won');assert.deepEqual(replayed.orientations,level.solution);
});

test('chapter constraints alter concrete topology and include real closed loops',()=>{
  for(const level of LEVELS.filter(level=>level.chapter===1)){assert.ok(level.metrics.end>=4);assert.ok(level.metrics.corner>=3);}
  for(const level of LEVELS.filter(level=>level.chapter===2)){assert.ok(level.metrics.tee>=4);assert.ok(level.metrics.innerTees>=2);}
  for(const level of LEVELS.filter(level=>level.chapter===3)){assert.ok(level.metrics.diameter>=17);assert.ok(level.metrics.balancedBridge>=11);}
  for(const level of LEVELS.filter(level=>level.chapter===4)){assert.ok(level.metrics.tee>=5);assert.ok(level.metrics.innerTees>=3);}
  for(const index of [32,37,42,46])assert.equal(evaluateNetwork(LEVELS[index],LEVELS[index].initial).hasCycle,true);
  for(const level of LEVELS.slice(44))assert.ok(solveNetwork(level,level.initial,{limit:2}).stats.branches>=1);
});

test('tutorial depicts three recomputable real states, and the action visibly restores a branch',()=>{
  assert.equal(TUTORIAL.level.width,3);assert.equal(TUTORIAL.level.height,3);
  assert.equal(TUTORIAL.before.status,'playing');assert.equal(TUTORIAL.after.status,'playing');assert.equal(TUTORIAL.solved.status,'won');
  const after=applyAction(TUTORIAL.before,{type:'rotate',index:TUTORIAL.actionIndex,turns:1}).state;
  assert.deepEqual(after,TUTORIAL.after);assert.equal(after.moves,1);
  assert.ok(after.evaluation.reachableCount>TUTORIAL.before.evaluation.reachableCount);
  assert.equal(TUTORIAL.solved.evaluation.reachableCount,9);assert.equal(TUTORIAL.solved.moves,2);
});

test('daily and free voyages rotate deterministically through a finite known pool',()=>{
  assert.equal(findLevel(LEVELS[0].id),LEVELS[0]);assert.equal(findLevel(VOYAGES[0].id),VOYAGES[0]);assert.equal(findLevel('absent'),null);
  assert.equal(voyageLevel(0),VOYAGES[0]);assert.equal(voyageLevel(120),VOYAGES[0]);assert.equal(voyageLevel(-1),VOYAGES[119]);
  for(let size=4;size<=6;size++){assert.equal(voyageLevel(0,size).width,size);assert.equal(voyageLevel(0,size),voyageLevel(40,size));}
  const ids=new Set(),sizes=new Set();
  for(let offset=0;offset<120;offset++) {
    const date=new Date(Date.UTC(2026,8,5+offset)).toISOString().slice(0,10),level=dailyLevel(date);
    assert.equal(dailyLevel(date),level);assert.ok(VOYAGES.includes(level));ids.add(level.id);if(offset<7)sizes.add(level.width);
  }
  assert.equal(ids.size,120);assert.equal(sizes.size,3);
  assert.throws(()=>dailyLevel('2026-02-30'),/exist/);assert.throws(()=>dailyLevel('09-05-2026'),/YYYY/);assert.throws(()=>voyageLevel(0,3),/size/);
});

test('runtime modules do not generate or prove puzzles on startup',async()=>{
  const campaign=await readFile(new URL('../src/campaign.mjs',import.meta.url),'utf8');
  const engine=await readFile(new URL('../src/engine.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(campaign,/solveNetwork|generateCampaign|treeCandidate|independentSolutions/);
  assert.doesNotMatch(engine,/from ['"].*campaign/);
  assert.doesNotMatch(campaign+engine,/\.flatMap\(|\.at\(/);
  assert.throws(()=>createLevel({...LEVELS[0],initial:LEVELS[0].solution}),/start solved/);
});

test('topology identity normalizes physical rotations including port directions',()=>{
  const portrait={width:2,height:3,solution:[6,12,5,5,1,1]};
  const clockwise={width:3,height:2,solution:[2,10,12,2,10,9]};
  assert.equal(topologyFingerprint(portrait),topologyFingerprint(clockwise));
  assert.equal(topologyFingerprint({...portrait,lighthouseIndex:0}),topologyFingerprint({...portrait,lighthouseIndex:5}));
});
