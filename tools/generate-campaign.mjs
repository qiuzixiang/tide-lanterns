/** Build-time curation only. Never imported by the game entry point. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { rotateMask, degreeOf, moduleShape, evaluateNetwork, solveNetwork, createGame, applyAction } from '../src/engine.mjs';

function hash(value){let state=2166136261;for(const char of String(value)){state^=char.charCodeAt(0);state=Math.imul(state,16777619);}return state>>>0;}
function rng(seed){let state=hash(seed);return()=>{state+=0x6D2B79F5;let mixed=Math.imul(state^state>>>15,state|1);mixed^=mixed+Math.imul(mixed^mixed>>>7,mixed|61);return((mixed^mixed>>>14)>>>0)/4294967296;};}
function shuffle(values,random){const result=values.slice();for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
const directions=[{bit:1,opposite:4,dx:0,dy:-1},{bit:2,opposite:8,dx:1,dy:0},{bit:4,opposite:1,dx:0,dy:1},{bit:8,opposite:2,dx:-1,dy:0}];

export function treeCandidate(size,seed,branchBias=0.4) {
  const random=rng(seed),total=size*size,masks=Array(total).fill(0),active=[Math.floor(random()*total)],visited=new Set(active);
  while(active.length) {
    const slot=random()<branchBias?Math.floor(random()*active.length):active.length-1;
    const current=active[slot],x=current%size,y=Math.floor(current/size);
    const options=degreeOf(masks[current]||1)>=3&&masks[current]!==0?[]:shuffle(directions,random).filter(direction=>{
      const nx=x+direction.dx,ny=y+direction.dy;return nx>=0&&ny>=0&&nx<size&&ny<size&&!visited.has(ny*size+nx);
    });
    if(!options.length){active.splice(slot,1);continue;}
    const direction=options[0],next=(y+direction.dy)*size+x+direction.dx;
    masks[current]|=direction.bit;masks[next]|=direction.opposite;visited.add(next);active.push(next);
  }
  return visited.size===total?masks:null;
}

export function topologyFingerprint(board,masks=board.solution) {
  let width=board.width,height=board.height,grid=masks.slice();const variants=[];
  const mirrorMask=mask=>(mask&5)|((mask&2)<<2)|((mask&8)>>2);
  for(let rotation=0;rotation<4;rotation++) {
    variants.push(`${width}x${height}:`+grid.map(mask=>mask.toString(16)).join(''));
    const mirrored=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)mirrored[y*width+x]=mirrorMask(grid[y*width+width-1-x]);
    variants.push(`${width}x${height}:`+mirrored.map(mask=>mask.toString(16)).join(''));
    const next=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)next[x*height+height-1-y]=rotateMask(grid[y*width+x],1);
    grid=next;[width,height]=[height,width];
  }
  return variants.sort()[0];
}

/** Independent oracle: row-major placement with rollback connectivity, no
 * propagation routine, stored solution, or production evaluator is consulted.
 */
export function independentSolutions(board,shapes,{limit=2,maxNodes=1000000}={}) {
  const width=board.width,height=board.height,total=width*height;
  const domains=shapes.map(mask=>{const values=[];for(let i=0;i<4;i++){if(!values.includes(mask))values.push(mask);mask=((mask<<1)&15)|(mask>>3);}return values.sort((a,b)=>a-b);});
  const solution=Array(total).fill(0),answers=[];let nodes=0,exhausted=false,limitReached=false;
  function search(index,parents,edges) {
    if(exhausted||limitReached)return;
    if(nodes>=maxNodes){exhausted=true;return;}nodes++;
    if(index===total) {
      if(edges!==total-1)return;
      const root=(()=>{let p=0;while(parents[p]!==p)p=parents[p];return p;})();
      for(let i=1;i<total;i++){let p=i;while(parents[p]!==p)p=parents[p];if(p!==root)return;}
      answers.push(solution.slice());if(answers.length>=limit)limitReached=true;return;
    }
    const x=index%width,y=Math.floor(index/width);
    for(const mask of domains[index]) {
      if((y===0&&(mask&1))||(x===0&&(mask&8))||(y===height-1&&(mask&4))||(x===width-1&&(mask&2)))continue;
      if(y>0&&Boolean(mask&1)!==Boolean(solution[index-width]&4))continue;
      if(x>0&&Boolean(mask&8)!==Boolean(solution[index-1]&2))continue;
      const nextParents=parents.slice();let nextEdges=edges,cycle=false;
      for(const neighbour of [mask&1?index-width:-1,mask&8?index-1:-1]) {
        if(neighbour<0)continue;
        let a=index,b=neighbour;while(nextParents[a]!==a)a=nextParents[a];while(nextParents[b]!==b)b=nextParents[b];
        if(a===b){cycle=true;break;}nextParents[a]=b;nextEdges++;
      }
      if(cycle)continue;solution[index]=mask;search(index+1,nextParents,nextEdges);
      if(exhausted||limitReached)return;
    }
  }
  search(0,Array.from({length:total},(_,i)=>i),0);
  return {solutions:answers,count:answers.length,nodes,exhausted,complete:!exhausted&&!limitReached,limitReached};
}

function metricsFor(size,solution) {
  const metrics={end:0,straight:0,corner:0,tee:0,cross:0,diameter:0,rootDepth:0,borderEnds:0,innerTees:0,balancedBridge:0};
  const graph=Array.from({length:solution.length},()=>[]);
  solution.forEach((mask,index)=>{
    metrics[moduleShape(mask)]++;
    const x=index%size,y=Math.floor(index/size);
    if(degreeOf(mask)===1&&(x===0||y===0||x===size-1||y===size-1))metrics.borderEnds++;
    if(degreeOf(mask)===3&&x>0&&y>0&&x<size-1&&y<size-1)metrics.innerTees++;
    for(const direction of directions)if(mask&direction.bit)graph[index].push((y+direction.dy)*size+x+direction.dx);
  });
  for(let start=0;start<solution.length;start++) {
    const dist=Array(solution.length).fill(-1),queue=[start];dist[start]=0;
    for(let cursor=0;cursor<queue.length;cursor++)for(const next of graph[queue[cursor]])if(dist[next]<0){dist[next]=dist[queue[cursor]]+1;queue.push(next);}
    const farthest=Math.max(...dist);metrics.diameter=Math.max(metrics.diameter,farthest);
    if(start===Math.floor(size/2)*size+Math.floor(size/2))metrics.rootDepth=farthest;
  }
  for(let a=0;a<graph.length;a++)for(const b of graph[a])if(a<b) {
    const reached=new Set([a]),queue=[a];
    for(let cursor=0;cursor<queue.length;cursor++)for(const next of graph[queue[cursor]])if(!(queue[cursor]===a&&next===b)&&!reached.has(next)){reached.add(next);queue.push(next);}
    metrics.balancedBridge=Math.max(metrics.balancedBridge,Math.min(reached.size,solution.length-reached.size));
  }
  return metrics;
}

function scramble(board,solution,seed,{changedCount=solution.length,cycle=false}={}) {
  const random=rng(seed);let best=null;
  for(let attempt=0;attempt<200;attempt++) {
    const initial=solution.slice(),indices=shuffle(solution.map((_,i)=>i),random).slice(0,changedCount);
    for(const index of indices) {
      const turns=moduleShape(solution[index])==='straight'?1:1+Math.floor(random()*3);
      initial[index]=rotateMask(solution[index],turns);
    }
    const evaluation=evaluateNetwork(board,initial);
    if(evaluation.solved)continue;
    best={initial,initialCycle:evaluation.hasCycle,initialPowered:evaluation.reachableCount,initialDangling:evaluation.dangling.length};
    if(!cycle||evaluation.hasCycle)return best;
  }
  return cycle?null:best;
}

const chapters=[
 {id:'harbor',index:0,name:'初灯港湾',subtitle:'先读懂岸线',story:'暴风过后，近港的航标只剩微光。你从熟悉的码头开始修复第一条航路。',lesson:'先看边界与端点，再让相邻接头互相面对。',collectible:'铜制船铃',color:'#D4A450'},
 {id:'gull',index:1,name:'白鸥浅滩',subtitle:'沿端点追光',story:'白鸥绕着浅滩盘旋，末端灯桩为归航的小船标出安全水道。',lesson:'端点只有一个方向；沿它向内推导转角与直线。',collectible:'白鸥海螺',color:'#90AAAD'},
 {id:'coral',index:2,name:'珊瑚回廊',subtitle:'理解分支',story:'珊瑚间的旧光缆彼此交错。让主灯塔的光分成支流，照亮每座小岛。',lesson:'三岔模块必须同时满足三个邻居，不能只接亮一边。',collectible:'珊瑚罗盘',color:'#C9866D'},
 {id:'mist',index:3,name:'雾笛群礁',subtitle:'看见整张网',story:'雾中能看见附近的灯，却看不见整片群礁。你要找出把两片海域连在一起的关键接头。',lesson:'局部接通不等于全部可达；检查连接两侧的桥梁。',collectible:'雾海漂流瓶',color:'#7D9D9A'},
 {id:'moon',index:4,name:'月潮外海',subtitle:'辨认闭环',story:'潮水映出漂亮的光环，也映出与灯塔失联的孤岛。留下树状航线，让每束光都找到来处。',lesson:'相邻接头都对上也可能形成孤立环；航网必须连通且无环。',collectible:'月潮鲸歌',color:'#9290AD'},
 {id:'dawn',index:5,name:'黎明灯链',subtitle:'让群岛一起亮起',story:'最远处的群岛等待最后一次校准。把岸线、端点和分支连成一张完整海图，迎接黎明。',lesson:'综合利用边界、端点、分支与全局连接，排除看似自洽的错误方向。',collectible:'琥珀灯塔',color:'#D8B369'},
];
const names=[
 ['第一束光','码头转角','岸线回声','归航路标','浅水折线','望海灯桩','港湾支流','启航之约'],
 ['白鸥引路','末端微光','潮汐分界','双岸之间','曲折沙洲','沿光而行','远处的灯','浅滩归航'],
 ['珊瑚三岔','支流汇光','海葵转角','三路回声','环礁之心','交错光缆','向外延伸','回廊全亮'],
 ['雾中的桥','彼岸微灯','孤岛之间','狭水通路','近处与远处','迷雾连线','静默缺口','群礁重逢'],
 ['潮环初现','月下孤网','闭合的错觉','一线通海','外海分支','潮声回转','无环航路','月光归源'],
 ['晨曦入口','远洋灯桥','群岛回响','最后的岔口','黎明之前','万灯同源','长夜尽头','潮汐灯塔'],
];
const briefs=[
 ['先看一眼主灯塔，再转动未对齐的航标。','岸线外没有光缆，把向外的接头收回海图。','两个接头必须相向，光才能穿过它们。','沿着末端灯桩，找到回到主灯塔的路。','转角会改变航线方向，直线则保持方向。','把海边的接头转向海图内侧。','主灯塔要把光送到每条支流。','点亮整个港湾，完成你的第一次巡航。'],
 ['从只有一个接头的灯桩开始观察。','找到末端，往回追溯它必须连接的邻居。','边界与端点共同限制可用方向。','两侧的海岸会把中间的航线夹出轮廓。','连续转角藏着一条曲折的正确水道。','一段接通的线路可以帮助推导下一段。','别遗漏海图角落里最后一座灯桩。','把端点、转角与岸线一起考虑。'],
 ['三岔节点必须照顾三条支流。','让每个分支都能回到主灯塔。','先定位分支，再安排它们之间的转角。','只接亮一边并不能确定三岔的朝向。','中央分支会影响远处多个航标。','分支越多，越要逐一核对双方接头。','检查每条支流是否真正接上主网。','让珊瑚回廊的所有支路同时亮起。'],
 ['寻找连接两片海域的那条关键光缆。','局部亮起之外，检查远处仍暗着的灯。','一片自成体系的小网仍然可能失联。','有些接头承担着连接两侧海域的任务。','先看整体分区，再回到每一个转角。','把雾中断开的光路接回同一个源头。','找出让整片区域保持黑暗的缺口。','确认每座航标都真正连接到主灯塔。'],
 ['这张海图初始含有闭环，别把绕成圈当作完成。','先检查那些看似已经接好的孤立线路。','光缆接头全对上，也可能没有回到灯塔。','在环路与主网之间找到正确的连接。','分支、岸线与连接约束需要同时满足。','这张海图初始含有闭环，试着让它成为树枝。','全网只能是一棵没有闭环的树。','让所有月下航标的光都来自同一座灯塔。'],
 ['从最确定的岸线开始，逐步推向深海。','找到支撑长距离连接的关键航桥。','海图初始含有闭环，拆开局部自洽的假航线。','每个三岔都要对整张海图负责。','让近处的确定方向帮助远处的判断。','没有一座航标可以独自发光。','这张海图初始含有闭环，黎明需要一张完整的树状航网。','点亮最后一张海图，把群岛交还给晨光。'],
];

export async function generateCampaign() {
 const all=[],seen=new Set(),report=[];
 for(let group=0;group<2;group++) {
  const count=group?120:48;
  for(let index=0;index<count;index++) {
    const position=index%8, campaignChapter=Math.floor(index/8);
    const size=group?[4,5,6][Math.floor(index/40)]:campaignChapter===0?(position<4?3:4):campaignChapter===1?4:campaignChapter<4?5:6;
    const chapter=group?(size===4?1:size===5?2+index%2:4+index%2):campaignChapter;
    const needsCycle=!group&&((chapter===4&&(position===0||position===5))||(chapter===5&&(position===2||position===6)));
    let selected=null;
    for(let attempt=0;attempt<30000;attempt++) {
      const seed=`tide-v1-${group?'voyage':'campaign'}-${index+1}-${attempt}`;
      const solution=treeCandidate(size,seed,chapter===2?0.9:chapter>=4?0.55:chapter===3?0.15:0.35);
      if(!solution)continue;
      const board={width:size,height:size,lighthouseIndex:Math.floor(size/2)*size+Math.floor(size/2)};
      const fingerprint=topologyFingerprint(board,solution);if(seen.has(fingerprint))continue;
      const metrics=metricsFor(size,solution);
      if(!group&&chapter===1&&(metrics.end<4||metrics.corner<3))continue;
      if(!group&&chapter===2&&(metrics.tee<4||metrics.innerTees<2))continue;
      if(!group&&chapter===3&&(metrics.diameter<17||metrics.balancedBridge<11))continue;
      if(!group&&chapter===4&&(metrics.tee<5||metrics.innerTees<3))continue;
      const proof=solveNetwork(board,solution,{limit:2,maxNodes:100000});
      if(proof.count!==1||!proof.complete||proof.exhausted)continue;
      if(!group&&chapter===5&&position>=4&&proof.stats.branches<1)continue;
      const independent=independentSolutions(board,solution);
      if(independent.count!==1||!independent.complete||independent.exhausted)continue;
      if(JSON.stringify(proof.solutions[0])!==JSON.stringify(independent.solutions[0])||JSON.stringify(proof.solutions[0])!==JSON.stringify(solution))throw new Error('Independent solution disagreement.');
      const scrambled=scramble(board,solution,seed,{changedCount:!group&&chapter===0&&position<3?[2,4,6][position]:solution.length,cycle:needsCycle});
      if(!scrambled)continue;
      selected={...board,total:size*size,solution,initial:scrambled.initial,seed,unique:true,
        id:group?`voyage-${String(index+1).padStart(3,'0')}`:`campaign-${String(index+1).padStart(2,'0')}`,
        name:group?`${size}阶航图 · ${String(index+1).padStart(3,'0')}`:names[chapter][position],
        chapter,order:group?index+1:index+1,briefing:group?'先从岸线和端点找方向，再把每条支路接回主灯塔。':briefs[chapter][position],
        mode:group?'voyage':'campaign',metrics:{...metrics,initialCycle:scrambled.initialCycle,initialPowered:scrambled.initialPowered,initialDangling:scrambled.initialDangling,
          proofNodes:proof.nodes,proofBranches:proof.stats.branches,globalPrunes:proof.stats.connectivityPrunes+proof.stats.cyclePrunes},
      };
      seen.add(fingerprint);report.push({id:selected.id,size,seed,topology:fingerprint,metrics:selected.metrics,proof:{count:proof.count,complete:proof.complete,nodes:proof.nodes,stats:proof.stats},independent:{count:independent.count,complete:independent.complete,nodes:independent.nodes}});break;
    }
    if(!selected)throw new Error(`No curated candidate for ${group}/${index}`);
    all.push(selected);console.log(`${selected.id} ${size}x${size} tee=${selected.metrics.tee} diameter=${selected.metrics.diameter} branch=${selected.metrics.proofBranches} cycle=${selected.metrics.initialCycle}`);
  }
 }
 const levels=all.slice(0,48),voyages=all.slice(48);
 const source=`// Build-time generated. No random generation or solving occurs at startup.\nimport { createGame, applyAction } from './engine.mjs';\nexport const CHAPTERS=Object.freeze(${JSON.stringify(chapters,null,2)}.map(Object.freeze));\nconst campaignData=${JSON.stringify(levels,null,2)};\nconst voyageData=${JSON.stringify(voyages,null,2)};\n`+campaignFooter;
 writeFileSync(new URL('../src/campaign.mjs',import.meta.url),source);
 const rows=report.map(item=>`| ${item.id} | ${item.size}×${item.size} | ${item.metrics.end}/${item.metrics.tee} | ${item.metrics.diameter} | ${item.proof.nodes} | ${item.independent.nodes} | ${item.metrics.initialCycle?'是':'否'} |`).join('\n');
 const summary=chapters.map(chapter=>{const list=levels.filter(level=>level.chapter===chapter.index);return`| ${chapter.index+1} ${chapter.name} | ${list.map(level=>level.width).filter((size,i,a)=>a.indexOf(size)===i).join('/')} | ${Math.min(...list.map(level=>level.metrics.tee))}–${Math.max(...list.map(level=>level.metrics.tee))} | ${Math.min(...list.map(level=>level.metrics.diameter))}–${Math.max(...list.map(level=>level.metrics.diameter))} | ${list.filter(level=>level.metrics.proofBranches>0).length} |`;}).join('\n');
 writeFileSync(new URL('../docs/campaign-validation.md',import.meta.url),`# 关卡生成与唯一性验证\n\n生成器版本 tide-v1。战役 48 关（6×8），额外离线航图库 120 关（4×4、5×5、6×6 各40）。合计 ${all.length} 个不同的实体接线拓扑。每日题和自由航行仅从有限题库确定性轮换，不在运行时生成或求解。\n\n## 如何筛选\n\n先生成度数不超过3的完整生成树，再打乱各格方向，保持每格形状。以实际解的线路位掩码做旋转和镜像归一化，忽略主灯塔位置；全库归一化后仍为 ${seen.size} 个，不把换起点、旋转、镜像或重新打乱当新题。每题元数据保留固定seed。\n\n前3关仅打乱2/4/6格用于教学，后续不以打乱步数宣称难度。第二章保证足够端点与转角；第三章至少4个三岔且至少2个在内部；第四章保证树直径至少17、存在把海图分成两侧（较小侧至少11格）的连接桥；第五章至少5个三岔、3个内部三岔，并含2张初始闭环题；第六章含2张初始闭环题，后4张必须在本求解器中经过分支排除。上述是可验证结构指标，不等同于人类难度或必然留存。\n\n| 章节 | 边长 | 三岔数量 | 树直径 | 需要分支搜索的题数 |\n| --- | --- | --- | --- | --- |\n${summary}\n\n## 两套独立求解验证\n\n生产引擎solveNetwork采用方向域约束传播、最小剩余域分支、潜在连通性及强制环排除。构建期独立oracle采用逐行放置、只核对北/西已放置端口、独立并查集与末态边数/连通性检查；不调用生产求解器或evaluateNetwork，也不读取预存solution。两者都搜索到第二解上限2；只有完整穷尽后恰好1解且未触达节点预算才接收。生产筛选预算100,000节点，独立验证预算1,000,000节点。168题均由两者确证唯一，且双方找到的具体答案一致。\n\n运行时createGame只检验形状和计算当前连通状态，不执行唯一性搜索。TUTORIAL使用第一张真实3×3题面；before=初始局面、after=一次真实顺时针旋转、solved=从before依次回放合法旋转后的通关态，计步同样真实，所有图均可复算。\n\n## 重现\n\n生成：node tools/generate-campaign.mjs\n\n验证：node --test tests/engine.test.mjs\n\n| 题号 | 尺寸 | 端点/三岔 | 树直径 | 传播求解节点 | 独立求解节点 | 初始闭环 |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows}\n`);
}

const campaignFooter=`
function freezeLevel(raw){return Object.freeze({...raw,initial:Object.freeze(raw.initial),solution:Object.freeze(raw.solution),metrics:Object.freeze(raw.metrics)});}
export const LEVELS=Object.freeze(campaignData.map(freezeLevel));
export const VOYAGES=Object.freeze(voyageData.map(freezeLevel));
const allLevels=new Map([...LEVELS,...VOYAGES].map(level=>[level.id,level]));
export function findLevel(id){return allLevels.get(id)||null;}
export function voyageLevel(index,size){
  if(!Number.isInteger(index))throw new RangeError('Voyage index must be an integer.');
  const pool=size===undefined?VOYAGES:VOYAGES.filter(level=>level.width===size);
  if(!pool.length)throw new RangeError('Voyage size must be 4, 5 or 6.');
  return pool[((index%pool.length)+pool.length)%pool.length];
}
export function dailyLevel(dateString){
  if(typeof dateString!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateString))throw new RangeError('Date must use YYYY-MM-DD.');
  const date=new Date(dateString+'T12:00:00Z');
  if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==dateString)throw new RangeError('Date must exist.');
  const day=Math.floor(date.valueOf()/86400000);
  return voyageLevel(day*37);
}
const tutorialLevel=LEVELS[0],before=createGame(tutorialLevel);
const actionIndex=tutorialLevel.initial.findIndex((mask,index)=>mask!==tutorialLevel.solution[index]);
const after=applyAction(before,{type:'rotate',index:actionIndex,turns:1}).state;
let solved=before;
for(let index=0;index<tutorialLevel.total;index++){
  for(let turns=0;turns<3&&solved.orientations[index]!==tutorialLevel.solution[index];turns++)solved=applyAction(solved,{type:'rotate',index,turns:1}).state;
}
export const TUTORIAL=Object.freeze({level:tutorialLevel,before,after,solved,actionIndex});
`;

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await generateCampaign();
