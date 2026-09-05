import { createGame, applyAction, evaluateNetwork, rotateMask, portsFor, moduleShape } from './engine.mjs';
import { NOTICES } from './notices.mjs';
import { CHAPTERS, LEVELS, VOYAGES, TUTORIAL, findLevel, dailyLevel, voyageLevel } from './campaign.mjs';
import { readSave, writeSave, replay, claimCompletion, campaignCount, chapterCount, nextCampaign, TUTORIAL_VERSION } from './storage.mjs';

const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const icons=['bell','shell','compass','bottle','whale','lighthouse'];
const chapterNumerals=['一','二','三','四','五','六'];
let storage;
try{storage=window.localStorage;}catch{storage={getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');}};}
const loaded=readSave(storage),save=loaded.data;
let persistence=loaded.available;
let run=save.current||{levelId:nextCampaign(save).id,actions:[],cursor:0,hints:0,elapsed:0,mode:'campaign'};
let game=replay(findLevel(run.levelId),run.actions,run.cursor)||createGame(LEVELS[0]);
let lockMode=false,reverse=false,angles=[],toastTimer=0,winTimer=0,focusBeforeModal=null,tutorialStep=0,modalKind='',hintIndex=-1,runRevision=0,pendingWin=null;
let audioCtx=null,freeSize=run.mode==='free'?game.level.width:5;
const reducedQuery=typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):null;
const prefersReduced=!!(reducedQuery&&reducedQuery.matches);
function localDate(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function formatTime(seconds){return seconds<60?seconds+'秒':Math.floor(seconds/60)+'分'+String(seconds%60).padStart(2,'0')+'秒';}
function persist(){save.current=run;if(!writeSave(storage,save)){if(persistence)toast('当前环境无法保存。请在关闭前完成这次航行。');persistence=false;}else persistence=true;}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function sound(kind='turn'){
  if(!save.settings.sound)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    if(!audioCtx)audioCtx=new Audio();if(audioCtx.state==='suspended')audioCtx.resume();
    const notes=kind==='win'?[523.25,659.25,783.99,1046.5]:kind==='power'?[659.25,880]:[392];
    notes.forEach((hz,i)=>{const oscillator=audioCtx.createOscillator(),gain=audioCtx.createGain(),now=audioCtx.currentTime+i*.10;oscillator.type='sine';oscillator.frequency.value=hz;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.065,now+.012);gain.gain.exponentialRampToValueAtTime(.001,now+.32);oscillator.connect(gain);gain.connect(audioCtx.destination);oscillator.start(now);oscillator.stop(now+.35);});
  }catch{/* Audio is optional; gameplay is always available. */}
}
function applySettings(){document.documentElement.classList.toggle('motion-off',!save.settings.motion||prefersReduced);}
function shapePaths(mask){const ends=[[1,50,0],[2,100,50],[4,50,100],[8,0,50]];return ends.filter(d=>mask&d[0]).map(d=>'M50 50L'+d[1]+' '+d[2]).join('');}
function tileArt(mask,root=false){const path=shapePaths(mask);return '<circle class="island" cx="50" cy="50" r="29"/><g class="cables"><path class="cable-shadow" d="'+path+'"/><path class="cable-light" d="'+path+'"/><path class="cable-grain" d="'+path+'"/></g><circle class="pulse-ring" cx="50" cy="50" r="29"/>'+(root?'<path class="lighthouse-shape" d="M38 68L42 37H58L62 68Z M39 37H61L50 27Z"/><path class="lighthouse-shape" d="M41 48H59M40 57H60"/><path class="lighthouse-window" d="M45 39H55V46H45Z"/>':'<circle class="core" cx="50" cy="50" r="9"/><circle class="core-small" cx="50" cy="50" r="3"/>')+'<g class="lock-mark"><rect x="71" y="73" width="17" height="13" rx="3"/><path fill="none" stroke="#f9e7b7" stroke-width="2.6" d="M75 74V69a4.5 4.5 0 019 0V74"/><path d="M79.5 78V82"/></g>';}
function staticBoard(state,highlight=-1){
  const size=state.level.width,step=80,root=state.level.lighthouseIndex;
  let body='';for(let i=0;i<state.orientations.length;i++){
    const x=(i%size)*step,y=Math.floor(i/size)*step,powered=state.evaluation.reachable.has(i),mask=state.orientations[i];
    body+='<g transform="translate('+x+' '+y+')"><rect x="0" y="0" width="80" height="80" fill="none" stroke="#43676a" stroke-width=".8"/><g transform="scale(.8)"><circle cx="50" cy="50" r="28" fill="'+(powered?'#597366':'#355a5e')+'" stroke="'+(powered?'#c1ad74':'#6c9485')+'"/><path d="'+shapePaths(mask)+'" fill="none" stroke="#173c43" stroke-width="12" stroke-linecap="round"/><path d="'+shapePaths(mask)+'" fill="none" stroke="'+(powered?'#f0d18e':'#83a092')+'" stroke-width="5" stroke-linecap="round"/>'+(i===root?'<path d="M39 68L43 36H57L61 68ZM38 36L50 26L62 36Z" fill="#f4e7be" stroke="#6c694c"/><rect x="45" y="39" width="10" height="7" fill="#f7c567"/>':'<circle cx="50" cy="50" r="8" fill="'+(powered?'#f9e2a2':'#45636a')+'" stroke="'+(powered?'#efd294':'#adc0a3')+'" stroke-width="2"/>')+'</g>'+(i===highlight?'<rect x="3" y="3" width="74" height="74" rx="7" fill="none" stroke="#ffe3a2" stroke-width="3"/><text x="66" y="18" font-size="18" fill="#ffe4ac" text-anchor="middle">↻</text>':'')+'</g>';
  }
  return '<svg viewBox="0 0 '+(size*step)+' '+(state.level.height*step)+'" role="img" aria-label="'+esc(state.evaluation.solved?'真实完成棋盘：全部航标连接，无断口、无闭环。':'真实棋盘，'+state.evaluation.reachableCount+'个航标已亮起。')+'">'+body+'</svg>';
}
function rotationBetween(initial,current){for(let i=0;i<4;i++)if(rotateMask(initial,i)===current)return i*90;return 0;}
function buildBoard(){
  const board=$('board');$('play-panel').classList.toggle('large-board',game.level.width===6);board.innerHTML='';angles=game.orientations.map((m,i)=>rotationBetween(game.level.initial[i],m));
  board.style.setProperty('--columns',game.level.width);
  game.orientations.forEach((mask,i)=>{
    const b=document.createElement('button');b.className='tile';b.type='button';b.dataset.index=i;b.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true">'+tileArt(game.level.initial[i],i===game.level.lighthouseIndex)+'</svg>';
    b.addEventListener('click',event=>{if(lockMode)act({type:'toggle-lock',index:i});else act({type:'rotate',index:i,turns:event.shiftKey||reverse?-1:1});});
    b.addEventListener('contextmenu',event=>{event.preventDefault();act({type:'toggle-lock',index:i});});
    b.addEventListener('keydown',event=>{
      let target=i;
      if(event.key==='ArrowRight')target=i%game.level.width===game.level.width-1?i:i+1;
      else if(event.key==='ArrowLeft')target=i%game.level.width===0?i:i-1;
      else if(event.key==='ArrowDown')target=Math.min(game.level.total-1,i+game.level.width);
      else if(event.key==='ArrowUp')target=Math.max(0,i-game.level.width);
      else if(event.key.toLowerCase()==='l'){event.preventDefault();act({type:'toggle-lock',index:i});return;}
      else return;
      event.preventDefault();board.children[target].focus();
    });
    board.appendChild(b);
  });
  resizeBoard();render();
}
function resizeBoard(){
  const wrap=$('sea-board-wrap');if(!wrap||!game)return;
  const available=wrap.clientWidth-(window.innerWidth<=360?12:window.innerWidth<=700?20:26);
  let target=Math.min(available,420);
  if(window.innerWidth<=700){
    const reserved=__XHS__?250:210;
    target=Math.min(target,Math.max(game.level.width*44,window.innerHeight-reserved));
  }
  const cell=Math.max(44,Math.floor(target/game.level.width));
  $('board').style.setProperty('--board-size',(cell*game.level.width)+'px');
  $('board').style.setProperty('--cell',cell+'px');
}
const directionNames={N:'上',E:'右',S:'下',W:'左'};
const shapeNames={end:'端点',straight:'直线',corner:'转角',tee:'三岔',cross:'十字'};
function render(previous){
  const chapter=CHAPTERS[game.level.chapter]||CHAPTERS[0];
  $('chapter-number').textContent='CHAPTER '+String(chapter.index+1).padStart(2,'0');$('chapter-title').textContent=chapter.name;$('chapter-story').textContent=chapter.story;
  $('level-name').textContent=game.level.name;
  $('level-kicker').textContent=run.mode==='daily'?'今日航线 · '+(run.date||localDate()):run.mode==='free'?'自由航行 · '+game.level.width+'阶海图':'第'+chapterNumerals[chapter.index]+'片海 · '+String((game.level.order-1)%8+1).padStart(2,'0')+' / 08';
  $('level-picker').innerHTML=run.mode==='campaign'?String(game.level.order).padStart(2,'0')+'<span> / 48</span>':'✦<span>'+ (run.mode==='daily'?'DAILY':'VOYAGE')+'</span>';
  $('powered-count').textContent=game.evaluation.reachableCount+' / '+game.level.total;$('move-count').textContent=game.moves+' 次转动';
  $('instruction').textContent=game.status==='won'?'航路已修复 · 每一盏灯都回到光里':lockMode?'锁定模式 · 轻点添加或解除笔记':'轻点转动 · 接口相对，光就会经过';
  $('level-briefing').textContent=game.level.briefing;
  $('undo-btn').disabled=run.cursor===0;$('redo-btn').disabled=run.cursor===run.actions.length;
  $('lock-btn').setAttribute('aria-pressed',String(lockMode));$('reverse-btn').setAttribute('aria-pressed',String(reverse));$('reverse-btn').textContent=reverse?'↺ 逆转':'↻ 顺转';$('hint-btn').disabled=game.status==='won';
  Array.from($('board').children).forEach((b,i)=>{
    const p=game.evaluation.reachable.has(i),newP=previous&&!previous.reachable.has(i)&&p;
    b.className='tile'+(p?' powered':'')+(game.locked[i]?' locked':'')+(i===game.level.lighthouseIndex?' root':'')+(newP?' new-power':'')+(hintIndex===i?' hinted':'');
    b.querySelector('.cables').style.transform='rotate('+angles[i]+'deg)';
    b.querySelector('.pulse-ring').style.animationDelay=newP?(i%5)*.035+'s':'0s';
    b.setAttribute('aria-label','第'+(Math.floor(i/game.level.width)+1)+'行第'+(i%game.level.width+1)+'列，'+(i===game.level.lighthouseIndex?'主灯塔，':'')+shapeNames[moduleShape(game.orientations[i])]+'接口朝'+portsFor(game.orientations[i]).map(n=>directionNames[n]).join('、')+'，'+(p?'已通电':'待连接')+(game.locked[i]?'，已锁定':'')+'。点击'+(lockMode?'切换锁定。':'旋转。'));
  });
  renderProgress();
}
function renderProgress(){
  const count=campaignCount(save);$('restored-count').textContent=count;$('overall-progress').style.width=(count/48*100)+'%';
  const earned=CHAPTERS.filter(c=>chapterCount(save,c.index)===8).length;$('collection-count').textContent=earned+' / 6 →';
  $('chapter-ribbon').innerHTML=CHAPTERS.map(c=>'<button data-chapter="'+c.index+'" class="'+(c.index===game.level.chapter?'active ':'')+(chapterCount(save,c.index)===8?'complete':'')+'" aria-label="'+esc(c.name)+'，已修复'+chapterCount(save,c.index)+'/8">'+String(c.index+1).padStart(2,'0')+'</button>').join('');
}
function clearWin(){clearTimeout(winTimer);winTimer=0;pendingWin=null;runRevision++;}
function act(action){
  if(run.cursor>=4000){toast('这次航行笔记已满，可以重开本关。');return;}
  const result=applyAction(game,action);
  if(!result.accepted){if(result.reason==='locked')toast('这枚航标已锁定。先切换“锁定”再点它解锁。');return;}
  clearWin();const previous=game.evaluation;run.actions=run.actions.slice(0,run.cursor);run.actions.push(action);run.cursor++;game=result.state;hintIndex=-1;
  if(action.type==='rotate')angles[action.index]+=action.turns*90;
  render(previous);persist();sound(game.status==='won'?'win':game.evaluation.reachableCount>previous.reachableCount?'power':'turn');
  if(game.status==='won')finishRun();
}
function travel(level,mode='campaign'){
  clearWin();closeModal();run={levelId:level.id,actions:[],cursor:0,hints:0,elapsed:0,mode,date:mode==='daily'?localDate():''};game=createGame(level);if(mode==='free')freeSize=level.width;lockMode=false;hintIndex=-1;buildBoard();persist();
  if(window.innerWidth<=700)window.scrollTo(0,0);
}
function seek(delta){
  const cursor=run.cursor+delta;if(cursor<0||cursor>run.actions.length)return;
  const next=replay(game.level,run.actions,cursor);if(!next)return;
  clearWin();run.cursor=cursor;game=next;hintIndex=-1;angles=game.orientations.map((m,i)=>rotationBetween(game.level.initial[i],m));render();persist();if(game.status==='won')finishRun();
}
function finishRun(){
  const result=claimCompletion(save,game,run.hints,run.elapsed);persist();renderProgress();
  pendingWin={revision:runRevision,result};winTimer=setTimeout(presentPendingWin,save.settings.motion&&!prefersReduced?720:150);
}
function presentPendingWin(){
  if(!pendingWin||pendingWin.revision!==runRevision||game.status!=='won'||modalKind)return;
  const result=pendingWin.result;pendingWin=null;showWin(result);
}
function showModal(kind,kicker,content,actions){
  if(!modalKind)focusBeforeModal=document.activeElement;
  modalKind=kind;$('modal-kicker').textContent=kicker;$('modal-body').innerHTML=content;$('modal-actions').innerHTML='';
  actions.forEach(a=>{const b=document.createElement('button');b.className=a.primary?'primary-btn':'secondary-btn';b.textContent=a.label;b.addEventListener('click',a.action);$('modal-actions').appendChild(b);});
  $('modal').hidden=false;document.body.classList.add('modal-open');$('main').setAttribute('aria-hidden','true');$('modal-body').scrollTop=0;
  $('modal').querySelector('.modal-card').focus();
}
function closeModal(){
  if(!$('modal').hidden){$('modal').hidden=true;document.body.classList.remove('modal-open');$('main').removeAttribute('aria-hidden');modalKind='';if(focusBeforeModal&&document.contains(focusBeforeModal))focusBeforeModal.focus();if(pendingWin)setTimeout(presentPendingWin,0);}
}
function showTutorial(step=0){
  tutorialStep=step;
  const texts=[
    ['一盏灯，照见一片海','每格是一枚可以转动的航标。金色光从主灯塔出发，沿相互面对的接口，照亮相邻航标。',TUTORIAL.before,-1,'起点：'+TUTORIAL.before.evaluation.reachableCount+' / '+TUTORIAL.level.total+' 盏航标已亮起'],
    ['转一下，让光经过','轻点金框里的航标，它会顺时针转动。接口对上后，整段相连的航路一起亮起。',TUTORIAL.after,TUTORIAL.actionIndex,'真实操作后：'+TUTORIAL.after.evaluation.reachableCount+' / '+TUTORIAL.level.total+' 盏亮起，还需继续修复'],
    ['把所有灯，连成一张网','全部航标都要接回主灯塔；每个接口都接好，不朝向边界之外，也不形成闭环。这张海图已经真正完成。',TUTORIAL.solved,-1,'真实通关：'+TUTORIAL.level.total+' / '+TUTORIAL.level.total+' 盏亮起 · 无断口 · 无闭环']
  ];
  const t=texts[step];
  const legend=step===0?'<div class="tutorial-legend"><span><i>◆</i>主灯塔 · 光的起点</span><span><i>●</i>金色灯芯 · 已通电</span><span><i>○</i>空灯环 · 等待连接</span><span><i>↻</i>轻点一格 · 原位旋转</span></div>':step===1?'<p>需要反向转动时，点棋盘下方的“顺转”切换。锁定只是笔记，随时可以解除。</p>':'<p>不着急，也不用猜着冲。先看岸线和端点；想试另一种方向，撤销和重做一直都在。</p>';
  const done=()=>{save.tutorial=TUTORIAL_VERSION;persist();closeModal();};
  showModal('tutorial','灯塔手记 · '+(step+1)+' / 3','<div class="tutorial-step">'+[0,1,2].map(i=>'<span class="'+(i===step?'active':'')+'"></span>').join('')+'</div><h2 id="modal-title">'+t[0]+'</h2><p>'+t[1]+'</p><div class="tutorial-figure">'+staticBoard(t[2],t[3])+'</div><p class="example-caption">'+t[4]+'</p>'+legend,[{label:step===0?'先自己试试':'上一张',action:step===0?done:()=>showTutorial(step-1)},{label:step===2?'开始点灯':'下一张',primary:true,action:step===2?done:()=>showTutorial(step+1)}]);
}
function showMap(chapterFocus){
  const count=campaignCount(save);
  let content='<h2 id="modal-title">群岛航海图</h2><p>六片海，四十八次点亮。已修复 '+count+' / 48 条航线。</p><div class="map-hero" aria-hidden="true"></div><div class="map-shortcuts"><button id="map-collection" class="secondary-btn">航海收藏</button><button id="map-free" class="secondary-btn">自由航行</button></div>';
  CHAPTERS.forEach(c=>{content+='<section class="map-chapter" id="map-chapter-'+c.index+'"><div class="map-chapter-heading"><h3>'+String(c.index+1).padStart(2,'0')+' · '+esc(c.name)+'</h3><span>'+chapterCount(save,c.index)+' / 8</span></div><p>'+esc(c.subtitle)+'</p><div class="map-levels">'+LEVELS.filter(l=>l.chapter===c.index).map(l=>{const record=save.claims[l.id];return '<button data-level="'+l.id+'" class="'+(game.level.id===l.id?'current ':'')+(record?'done ':'')+(record&&record.clean?'clean':'')+'" aria-label="第'+l.order+'关 '+esc(l.name)+(record?record.clean?'，已独立修复':'，已修复':'')+'">'+String(l.order).padStart(2,'0')+'<small>'+l.width+' × '+l.height+'</small></button>';}).join('')+'</div></section>';});
  content+='<p class="example-caption">✦ 已修复　✧ 无提示修复 · 每一关都可自由重玩</p>';
  showModal('map','航海日志',content,[{label:'继续当前航线',action:closeModal},{label:'前往未修复航线',primary:true,action:()=>travel(nextCampaign(save))}]);
  $('map-collection').addEventListener('click',showCollection);$('map-free').addEventListener('click',showFree);
  $('modal-body').querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>chooseTravel(findLevel(b.dataset.level),'campaign')));
  if(Number.isInteger(chapterFocus)){const el=$('map-chapter-'+chapterFocus);$('modal-body').scrollTop=el.offsetTop-$('modal-body').offsetTop-8;}
}
function chooseTravel(level,mode,onTravel){
  const go=()=>{if(onTravel)onTravel();travel(level,mode);};
  if(game.levelId===level.id&&run.mode===mode&&game.status!=='won'){closeModal();return;}
  if(run.cursor>0&&game.status!=='won'){
    showModal('switch','航线切换','<h2 id="modal-title">换一片海继续？</h2><p>当前未完成的摆放会重新开始；已获得的修复记录与收藏会保留。</p>',[{label:'留在当前航线',action:closeModal},{label:'前往新航线',primary:true,action:go}]);
  }else go();
}
function showCollection(){
  const earned=CHAPTERS.filter(c=>chapterCount(save,c.index)===8).length;
  const content='<h2 id="modal-title">从海上带回的礼物</h2><p>修复一片群岛的全部八条航线，就能收藏它的纪念物。'+earned+' / 6 件已收藏。</p><div class="collection-grid">'+CHAPTERS.map(c=>{const have=chapterCount(save,c.index)===8;return '<div class="collection-item '+(have?'':'unearned')+'"><img src="./assets/collectible-'+icons[c.index]+'.svg" alt="'+esc(c.collectible)+'"><strong>'+esc(c.collectible)+'</strong><p>'+esc(c.name)+'<br>'+(have?'已珍藏在航海日志':chapterCount(save,c.index)+' / 8 航线已修复')+'</p></div>';}).join('')+'</div><p class="example-caption">重玩可收获新的思路。礼物按群岛唯一结算，不会重复领取。</p>';
  showModal('collection','航海收藏',content,[{label:'回到海上',primary:true,action:closeModal}]);
}
function showWin(result={first:false,improved:false}){
  const chapter=CHAPTERS[game.level.chapter],complete=run.mode==='campaign'&&chapterCount(save,chapter.index)===8;
  const clean=run.hints===0;
  let content='<div class="win-content"><div class="result-seal" aria-hidden="true">✦</div><h2 id="modal-title">这一片海，亮起来了</h2><p>'+esc(game.level.name)+' · 航路修复完成<br>'+(clean?'靠自己的思考，把每一盏灯连回了家。':'每一次寻找方向，都让航海经验更丰富。')+'</p><div class="win-stats"><div><strong>'+game.level.total+'</strong><span>亮起的航标</span></div><div><strong>'+game.moves+'</strong><span>本次转动</span></div><div><strong>'+run.hints+'</strong><span>使用提示</span></div></div><p>'+esc(formatTime(run.elapsed))+' · '+(result.first?'首次修复已记入航海日志':result.improved?'这次刷新了你的修复记录':'熟悉的航路，也有新的发现')+'</p>';
  if(complete)content+='<div class="collect-unlock"><img src="./assets/collectible-'+icons[chapter.index]+'.svg" alt=""><span>'+esc(chapter.name)+' 全部修复<br><strong>'+esc(chapter.collectible)+'</strong> 已收入收藏</span></div>';
  content+='</div>';
  let nextLabel='下一条航线',nextAction;
  if(run.mode==='daily'){nextLabel='自由航行';nextAction=showFree;}
  else if(run.mode==='free'){nextAction=()=>startFree(game.level.width);}
  else if(game.level.order===48){nextLabel='查看全部群岛';nextAction=()=>showMap();}
  else nextAction=()=>travel(LEVELS[game.level.order]);
  showModal('win','航海日志 · '+(clean?'独立修复':'引导修复'),content,[{label:'留在这片海',action:closeModal},{label:nextLabel,primary:true,action:nextAction}]);
}
function showDaily(){
  const date=localDate(),level=dailyLevel(date),done=!!save.claims[level.id];
  showModal('daily','今日航线 · '+date,'<h2 id="modal-title">今天，去一片新的海</h2><div class="map-hero" aria-hidden="true"></div><p>今日是一张 '+level.width+' × '+level.height+' 海图。同一天打开，会遇见同一条航线。</p><p>'+(done?'这张航图已经修复，欢迎再走一次。':'点亮今天的灯火，把这份宁静带走。')+'</p><p class="source-copy">日期以设备本地时间为准；每日从 120 张独立航图轮换，每 120 天循环。无需连续签到。</p>',[{label:'稍后再来',action:closeModal},{label:done?'重访今日航线':'开始今日航线',primary:true,action:()=>chooseTravel(level,'daily')}]);
}
function showFree(){
  showModal('free','自由航行','<h2 id="modal-title">按自己的步调，出海</h2><p>选一张小海图暖暖手，或去更远处寻找连接。每档有 40 张独立航图，依次轮换。</p><div class="freedom-sizes">'+[4,5,6].map(s=>'<button data-size="'+s+'" class="'+(freeSize===s?'active':'')+'" aria-pressed="'+(freeSize===s)+'">'+s+' × '+s+'<small>'+({4:'近岸散步',5:'穿过群礁',6:'远海巡航'})[s]+'</small></button>').join('')+'</div><p>所有航图均可独立完成。没有时间限制，提示、笔记和撤销随时可用。</p>',[{label:'回到当前航线',action:closeModal},{label:'扬帆出发',primary:true,action:()=>startFree(freeSize)}]);
  $('modal-body').querySelectorAll('[data-size]').forEach(b=>b.addEventListener('click',()=>{freeSize=Number(b.dataset.size);$('modal-body').querySelectorAll('[data-size]').forEach(el=>{el.classList.toggle('active',Number(el.dataset.size)===freeSize);el.setAttribute('aria-pressed',String(Number(el.dataset.size)===freeSize));});}));
}
function startFree(size){const index=save.voyageBySize[size]||0,level=voyageLevel(index,size);chooseTravel(level,'free',()=>{save.voyageBySize[size]=(index+1)%40;});}
function showHint(){
  if(game.status==='won')return;
  const wrong=game.orientations.map((m,i)=>m===game.level.solution[i]?-1:i).filter(i=>i>=0);
  if(!wrong.length)return;
  const edge=game.evaluation.dangling.find(d=>d.reason==='border'&&wrong.includes(d.index));
  const index=edge?edge.index:wrong[0],r=Math.floor(index/game.level.width)+1,c=index%game.level.width+1;
  showModal('hint','灯塔手记 · 寻找方向','<h2 id="modal-title">要看一个方向提示吗？</h2><p>'+(edge?'第 '+r+' 行第 '+c+' 列有接口伸向海图之外。试着先把它收回岸线内。':'先检查岸线，再沿端点追踪。已亮起只代表连上主灯塔，不代表它的所有接口都已正确。')+'</p><p>继续会展示一枚航标在完整航线中的方向，并计作一次提示。你也可以先自己试试。</p>',[{label:'我再想想',action:closeModal},{label:'显示一个方向',primary:true,action:()=>revealHint(index)}]);
}
function revealHint(index){
  run.hints++;hintIndex=index;persist();render();
  const r=Math.floor(index/game.level.width)+1,c=index%game.level.width+1,mask=game.level.solution[index];
  const dirs=portsFor(mask).map(n=>directionNames[n]).join('、');
  const preview='<svg viewBox="0 0 100 100" role="img" aria-label="方向提示：接口朝'+dirs+'"><path d="'+shapePaths(mask)+'" stroke="#efd18b" stroke-width="7" fill="none"/><circle cx="50" cy="50" r="10" fill="#f9e7b5"/></svg>';
  showModal('hint-reveal','方向提示 · 已使用 '+run.hints+' 次','<h2 id="modal-title">这枚航标，朝这里</h2><div class="hint-preview">'+preview+'<p>第 '+r+' 行 · 第 '+c+' 列<br>接口应朝 <strong>'+dirs+'</strong><br>'+ (game.locked[index]?'这格已锁定，转正时会解除锁定。':'金框已经标出了它。')+'</p></div><p>这是完整航线中的一个正确方向。观察它如何影响邻居，再继续自己的推理。</p>',[{label:'我来转动',action:closeModal},{label:'帮我转正',primary:true,action:()=>{
    closeModal();if(game.locked[index])act({type:'toggle-lock',index});let steps=0;while(game.orientations[index]!==mask&&steps<3){act({type:'rotate',index,turns:1});steps++;}
  }}]);
}
function resetPrompt(){showModal('reset','重新启航','<h2 id="modal-title">让这条航线重新开始？</h2><p>当前摆放、转动次数和本次提示会重置。已修复记录与收藏都会保留。</p>',[{label:'继续思考',action:closeModal},{label:'重新开始',primary:true,action:()=>travel(game.level,run.mode)}]);}
function showSettings(){
  showModal('settings','航行偏好','<h2 id="modal-title">让旅程，适合你</h2><div class="setting-row"><div><p>灯音</p><p class="source-copy">轻柔的转动与亮灯声</p></div><button id="sound-toggle" aria-pressed="'+save.settings.sound+'">'+(save.settings.sound?'已开启':'已关闭')+'</button></div><div class="setting-row"><div><p>光波动画</p><p class="source-copy">'+(prefersReduced?'设备已选择减少动态效果':'控制灯光涟漪与转动过渡')+'</p></div><button id="motion-toggle" aria-pressed="'+save.settings.motion+'">'+(save.settings.motion?'已开启':'已关闭')+'</button></div><h3>规则与来源</h3><button id="licenses-btn" class="secondary-btn">完整许可与署名</button><p>玩法基于 Simon Tatham 的 Net：只旋转、不换形。接口全部配对，所有航标连接到主灯塔，且航网没有闭环，才算完成。此版本采用不回绕、无屏障海图。</p><p class="source-copy">规则与来源实现：Simon Tatham and contributors · MIT；中文规则参考 ebnbin/puzzles。独立界面与实现改编自本地小游戏合集。群岛插画为 AI 生成，棋盘与图解由实际规则数据绘制。</p><p class="source-copy">潮汐灯塔 1.0.0 · 48 战役 + 120 轮换航图。全部题面已独立验证唯一解。存档保存在当前设备浏览器'+(persistence?'。':'，但此环境当前无法保存。')+'不收集个人信息，不需要网络或账号。</p><p class="keyboard-tip">键盘：方向键移动焦点，空格/回车旋转；Shift+点击逆转；L 或右键切换锁定。Ctrl/Cmd+Z 撤销，Shift+Z 重做。</p>',[{label:'重看图解',action:()=>showTutorial()},{label:'回到海上',primary:true,action:closeModal}]);
  $('licenses-btn').addEventListener('click',()=>showModal('licenses','来源与许可','<h2 id="modal-title">许可与署名</h2><pre class="license-text">'+esc(NOTICES)+'</pre>',[{label:'返回设置',primary:true,action:showSettings}]));
  $('sound-toggle').addEventListener('click',()=>{save.settings.sound=!save.settings.sound;persist();showSettings();if(save.settings.sound)sound('power');});
  $('motion-toggle').addEventListener('click',()=>{save.settings.motion=!save.settings.motion;applySettings();persist();showSettings();});
}
$('brand').addEventListener('click',()=>showMap());$('map-btn').addEventListener('click',()=>showMap());$('level-picker').addEventListener('click',()=>showMap(game.level.chapter));
$('daily-btn').addEventListener('click',showDaily);$('help-btn').addEventListener('click',()=>showTutorial());$('rules-btn').addEventListener('click',()=>showTutorial());$('collection-btn').addEventListener('click',showCollection);$('settings-btn').addEventListener('click',showSettings);$('free-btn').addEventListener('click',showFree);
$('undo-btn').addEventListener('click',()=>seek(-1));$('redo-btn').addEventListener('click',()=>seek(1));$('lock-btn').addEventListener('click',()=>{lockMode=!lockMode;render();});$('reverse-btn').addEventListener('click',()=>{reverse=!reverse;render();});$('hint-btn').addEventListener('click',showHint);$('reset-btn').addEventListener('click',resetPrompt);
$('chapter-ribbon').addEventListener('click',event=>{const b=event.target.closest('[data-chapter]');if(b)showMap(Number(b.dataset.chapter));});
$('modal-close').addEventListener('click',()=>{if(modalKind==='tutorial'){save.tutorial=TUTORIAL_VERSION;persist();}closeModal();});
$('modal').querySelector('.modal-backdrop').addEventListener('click',()=>{if(modalKind==='tutorial'){save.tutorial=TUTORIAL_VERSION;persist();}closeModal();});
document.addEventListener('keydown',event=>{
  if(modalKind){
    if(event.key==='Escape'){event.preventDefault();if(modalKind==='tutorial'){save.tutorial=TUTORIAL_VERSION;persist();}closeModal();return;}
    if(event.key==='Tab'){
      const focusable=Array.from($('modal').querySelectorAll('button:not(:disabled),[tabindex="0"]')).filter(e=>e.offsetParent!==null);
      if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===$('modal').querySelector('.modal-card'))){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();seek(event.shiftKey?1:-1);}
});
window.addEventListener('resize',resizeBoard);
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
setInterval(()=>{if(!document.hidden&&game.status!=='won'&&!modalKind){run.elapsed=Math.min(31536000,run.elapsed+1);if(run.elapsed%15===0)persist();}},1000);
applySettings();buildBoard();persist();
if(save.tutorial!==TUTORIAL_VERSION)showTutorial();
else if(game.status==='won')finishRun();
if(!persistence)setTimeout(()=>toast('此环境无法保存进度，当前仍可正常游玩。'),800);
