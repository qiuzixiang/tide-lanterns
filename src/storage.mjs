import { createGame, applyAction, evaluateNetwork, sameShape } from './engine.mjs';
import { findLevel, LEVELS, VOYAGES } from './campaign.mjs';

export const SAVE_KEY = 'tide-lanterns:v1';
export const TUTORIAL_VERSION = 1;
const MAX_ACTIONS = 4000;
const integer = (n,max=1000000) => Number.isInteger(n) && n >= 0 && n <= max;
export function freshSave(){return {version:1,tutorial:0,settings:{sound:false,motion:true},claims:{},current:null,voyage:0,voyageBySize:{4:0,5:0,6:0}};}
export function replay(level,actions,cursor=actions.length){
  if(!Array.isArray(actions)||actions.length>MAX_ACTIONS||!integer(cursor,actions.length))return null;
  let game=createGame(level);
  for(let i=0;i<cursor;i++){
    const a=actions[i];
    if(!a||!integer(a.index,level.total-1)||!['rotate','toggle-lock'].includes(a.type)||(a.type==='rotate'&&a.turns!==1&&a.turns!==-1))return null;
    const result=applyAction(game,a);
    if(!result.accepted)return null;
    game=result.state;
  }
  return game;
}
export function validateCurrent(raw){
  if(!raw||typeof raw!=='object')return null;
  const level=findLevel(raw.levelId);
  if(!level||!integer(raw.cursor)||!integer(raw.hints,MAX_ACTIONS)||!integer(raw.elapsed,31536000))return null;
  const game=replay(level,raw.actions,raw.cursor);
  if(!game||!replay(level,raw.actions))return null;
  return {levelId:level.id,actions:raw.actions.map(a=>a.type==='rotate'?{type:'rotate',index:a.index,turns:a.turns}:{type:'toggle-lock',index:a.index}),cursor:raw.cursor,hints:raw.hints,elapsed:raw.elapsed,date:typeof raw.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.date)?raw.date:'',mode:raw.mode==='daily'?'daily':raw.mode==='free'?'free':'campaign'};
}
function validClaim(id,c){
  const level=findLevel(id);
  if(!level||!c||!Array.isArray(c.masks)||c.masks.length!==level.total||!integer(c.moves,MAX_ACTIONS)||!integer(c.hints,MAX_ACTIONS)||!integer(c.elapsed,31536000)||typeof c.clean!=='boolean')return false;
  try{return c.masks.every((m,i)=>sameShape(m,level.initial[i]))&&evaluateNetwork(level,c.masks).solved;}catch{return false;}
}
export function sanitizeSave(raw){
  const clean=freshSave();
  if(!raw||typeof raw!=='object'||raw.version!==1)return clean;
  clean.tutorial=raw.tutorial===TUTORIAL_VERSION?TUTORIAL_VERSION:0;
  if(raw.settings&&typeof raw.settings==='object'){
    clean.settings.sound=raw.settings.sound===true;
    clean.settings.motion=raw.settings.motion!==false;
  }
  if(integer(raw.voyage))clean.voyage=raw.voyage;
  for(const size of [4,5,6])if(raw.voyageBySize&&integer(raw.voyageBySize[size],39))clean.voyageBySize[size]=raw.voyageBySize[size];
  clean.current=validateCurrent(raw.current);
  if(raw.claims&&typeof raw.claims==='object'){
    for(const level of LEVELS.concat(VOYAGES)){
      const c=raw.claims[level.id];
      if(validClaim(level.id,c))clean.claims[level.id]={masks:c.masks.slice(),moves:c.moves,hints:c.hints,elapsed:c.elapsed,clean:c.clean&&c.hints===0,at:typeof c.at==='string'?c.at.slice(0,24):''};
    }
  }
  return clean;
}
export function readSave(storage){
  let raw;try{raw=storage.getItem(SAVE_KEY);}catch{return {data:freshSave(),available:false};}
  try{return {data:sanitizeSave(JSON.parse(raw)),available:true};}catch{return {data:freshSave(),available:true};}
}
export function writeSave(storage,data){try{storage.setItem(SAVE_KEY,JSON.stringify(data));return true;}catch{return false;}}
export function claimCompletion(data,game,hints,elapsed,date=new Date()){
  if(!evaluateNetwork(game.level,game.orientations).solved||!integer(hints,MAX_ACTIONS)||!integer(elapsed,31536000))return {first:false,improved:false};
  const id=game.levelId,previous=data.claims[id];
  const candidate={masks:game.orientations.slice(),moves:game.moves,hints,elapsed,clean:hints===0,at:date.toISOString()};
  if(!validClaim(id,candidate))return {first:false,improved:false};
  const improved=!!previous&&(hints<previous.hints||(hints===previous.hints&&game.moves<previous.moves));
  if(!previous||improved)data.claims[id]=candidate;
  if(previous&&hints===0)data.claims[id].clean=true;
  return {first:!previous,improved};
}
export function campaignCount(data){return LEVELS.filter(l=>!!data.claims[l.id]).length;}
export function chapterCount(data,index){return LEVELS.filter(l=>l.chapter===index&&data.claims[l.id]).length;}
export function nextCampaign(data){return LEVELS.find(l=>!data.claims[l.id])||LEVELS[0];}
