/**
 * Tide Lanterns / Net rules engine. Based on the project’s MIT-licensed Storm Lanterns engine.
 *
 * A board is a rectangular collection of non-empty cable modules. Each
 * module is a four-bit mask (N/E/S/W). Rotating a module never changes its
 * shape. A solved board has no connector pointing at the border or at an
 * unmatching neighbour, every module is reachable from the lighthouse, and
 * the resulting undirected graph contains no cycle.
 *
 * This module deliberately has no DOM, timers, audio, or storage side effects.
 */

export const SAVE_SCHEMA = "tide-lanterns/net";
export const SAVE_VERSION = 1;

export const PORT = Object.freeze({
  N: 1,
  E: 2,
  S: 4,
  W: 8,
});

export const DIRECTIONS = Object.freeze([
  Object.freeze({ name: "N", bit: PORT.N, opposite: PORT.S, row: -1, column: 0 }),
  Object.freeze({ name: "E", bit: PORT.E, opposite: PORT.W, row: 0, column: 1 }),
  Object.freeze({ name: "S", bit: PORT.S, opposite: PORT.N, row: 1, column: 0 }),
  Object.freeze({ name: "W", bit: PORT.W, opposite: PORT.E, row: 0, column: -1 }),
]);

export const STATUS = Object.freeze({
  PLAYING: "playing",
  WON: "won",
});

const FULL_MASK = PORT.N | PORT.E | PORT.S | PORT.W;

function assertDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Board width and height must be positive integers.");
  }
  if (width * height < 2) {
    throw new RangeError("A Net board must contain at least two modules.");
  }
}

function assertMask(mask) {
  if (!Number.isInteger(mask) || mask < 1 || mask > FULL_MASK) {
    throw new RangeError(`Cable mask must be an integer from 1 to ${FULL_MASK}.`);
  }
}

function flattenMasks(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Cable orientations must be an array.");
  }
  const result = [];
  for (const row of value) { if (Array.isArray(row)) result.push(...row); else result.push(row); }
  return result;
}

function normalizeMasks(width, height, masks) {
  const flat = flattenMasks(masks);
  if (flat.length !== width * height) {
    throw new RangeError(`Expected ${width * height} cable masks, received ${flat.length}.`);
  }
  for (const mask of flat) assertMask(mask);
  return flat;
}

function boardDimensions(board) {
  if (!board || typeof board !== "object") {
    throw new TypeError("Board must be an object with width and height.");
  }
  const { width, height } = board;
  assertDimensions(width, height);
  return { width, height, total: width * height };
}

export function keyOf(row, column) {
  return `${row}:${column}`;
}

export function pointFromKey(key) {
  const match = /^(\d+):(\d+)$/.exec(String(key));
  if (!match) return null;
  return { row: Number(match[1]), column: Number(match[2]) };
}

export function inBounds(board, row, column) {
  if (!board || !Number.isInteger(row) || !Number.isInteger(column)) return false;
  return row >= 0 && column >= 0 && row < board.height && column < board.width;
}

export function indexOf(board, row, column) {
  return inBounds(board, row, column) ? row * board.width + column : -1;
}

export function pointOf(board, index) {
  const total = Number.isInteger(board?.width) && Number.isInteger(board?.height)
    ? board.width * board.height
    : 0;
  if (!Number.isInteger(index) || index < 0 || index >= total) return null;
  return { row: Math.floor(index / board.width), column: index % board.width };
}

export function resolveCell(board, target, column) {
  if (Number.isInteger(target) && column === undefined) {
    return pointOf(board, target) ? target : -1;
  }
  if (Number.isInteger(target) && Number.isInteger(column)) {
    return indexOf(board, target, column);
  }
  if (typeof target === "string") {
    const point = pointFromKey(target);
    return point ? indexOf(board, point.row, point.column) : -1;
  }
  if (target && typeof target === "object") {
    if (Number.isInteger(target.index)) return resolveCell(board, target.index);
    return indexOf(board, target.row, target.column);
  }
  return -1;
}

export function rotateMask(mask, turns = 1) {
  assertMask(mask);
  if (!Number.isInteger(turns)) throw new TypeError("Rotation turns must be an integer.");
  let result = mask;
  const normalized = ((turns % 4) + 4) % 4;
  for (let turn = 0; turn < normalized; turn += 1) {
    result = ((result << 1) & FULL_MASK) | ((result & PORT.W) >> 3);
  }
  return result;
}

export function hasPort(mask, direction) {
  assertMask(mask);
  const bit = typeof direction === "string"
    ? DIRECTIONS.find((item) => item.name === direction.toUpperCase())?.bit
    : direction;
  return Number.isInteger(bit) && (mask & bit) !== 0;
}

export function portsFor(mask) {
  assertMask(mask);
  return DIRECTIONS.filter((direction) => (mask & direction.bit) !== 0)
    .map((direction) => direction.name);
}

export function degreeOf(mask) {
  assertMask(mask);
  let count = 0;
  for (const direction of DIRECTIONS) {
    if ((mask & direction.bit) !== 0) count += 1;
  }
  return count;
}

export function rotationPeriod(mask) {
  assertMask(mask);
  for (let turns = 1; turns <= 4; turns += 1) {
    if (rotateMask(mask, turns) === mask) return turns;
  }
  return 4;
}

export function canonicalShape(mask) {
  assertMask(mask);
  return Math.min(mask, rotateMask(mask, 1), rotateMask(mask, 2), rotateMask(mask, 3));
}

export function sameShape(first, second) {
  return canonicalShape(first) === canonicalShape(second);
}

export function moduleShape(mask) {
  const degree = degreeOf(mask);
  if (degree === 1) return "end";
  if (degree === 2) return (mask === (PORT.N | PORT.S) || mask === (PORT.E | PORT.W))
    ? "straight"
    : "corner";
  if (degree === 3) return "tee";
  return "cross";
}

/**
 * Evaluate the complete Net rule set. Reachability follows reciprocal cable
 * connections only; an unmatched connector never carries lighthouse energy.
 */
export function evaluateNetwork(board, masksInput, lighthouse = undefined) {
  const { width, height, total } = boardDimensions(board);
  const fallbackMasks = board.orientations ?? board.initial ?? board.solution;
  const masks = normalizeMasks(width, height, masksInput ?? fallbackMasks);
  const defaultRoot = Number.isInteger(board.lighthouseIndex)
    ? board.lighthouseIndex
    : indexOf(board, Math.floor(height / 2), Math.floor(width / 2));
  const rootIndex = lighthouse === undefined ? defaultRoot : resolveCell(board, lighthouse);
  if (rootIndex < 0 || rootIndex >= total) {
    throw new RangeError("Lighthouse must identify a cell inside the board.");
  }

  const adjacency = Array.from({ length: total }, () => []);
  const edges = [];
  const dangling = [];

  for (let index = 0; index < total; index += 1) {
    const point = pointOf(board, index);
    for (const direction of DIRECTIONS) {
      if ((masks[index] & direction.bit) === 0) continue;
      const nextRow = point.row + direction.row;
      const nextColumn = point.column + direction.column;
      const neighbour = indexOf(board, nextRow, nextColumn);
      if (neighbour < 0) {
        dangling.push(Object.freeze({
          index,
          row: point.row,
          column: point.column,
          direction: direction.name,
          reason: "border",
          neighbour: null,
        }));
        continue;
      }
      if ((masks[neighbour] & direction.opposite) === 0) {
        dangling.push(Object.freeze({
          index,
          row: point.row,
          column: point.column,
          direction: direction.name,
          reason: "mismatch",
          neighbour,
        }));
        continue;
      }
      if (index < neighbour) {
        adjacency[index].push(neighbour);
        adjacency[neighbour].push(index);
        edges.push(Object.freeze([index, neighbour]));
      }
    }
  }

  const reachable = new Set([rootIndex]);
  const frontier = [rootIndex];
  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    for (const neighbour of adjacency[frontier[cursor]]) {
      if (reachable.has(neighbour)) continue;
      reachable.add(neighbour);
      frontier.push(neighbour);
    }
  }

  let components = 0;
  const seen = new Set();
  for (let start = 0; start < total; start += 1) {
    if (seen.has(start)) continue;
    components += 1;
    seen.add(start);
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbour of adjacency[queue[cursor]]) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
  }

  // For an undirected simple graph, E - V + components is the independent
  // cycle count. Reciprocal neighbour pairs are added exactly once above.
  const cycleCount = edges.length - total + components;
  const hasCycle = cycleCount > 0;
  const allConnected = reachable.size === total;
  const portsComplete = dangling.length === 0;
  const solved = portsComplete && allConnected && !hasCycle;
  const unreachable = new Set(
    Array.from({ length: total }, (_, index) => index).filter((index) => !reachable.has(index)),
  );
  const danglingCells = new Set(dangling.map((connector) => connector.index));

  return {
    solved,
    complete: solved,
    allConnected,
    connected: allConnected,
    portsComplete,
    acyclic: !hasCycle,
    hasCycle,
    cycleCount,
    components,
    edgeCount: edges.length,
    edges: Object.freeze(edges),
    adjacency: Object.freeze(adjacency.map((neighbours) => Object.freeze([...neighbours]))),
    dangling: Object.freeze(dangling),
    danglingCells,
    reachable,
    powered: reachable,
    unreachable,
    reachableCount: reachable.size,
    total,
    rootIndex,
  };
}

export function reachableFromLighthouse(board, masks, lighthouse = undefined) {
  return evaluateNetwork(board, masks, lighthouse).reachable;
}

export function isSolved(boardOrGame, masks = undefined) {
  if (masks === undefined && boardOrGame?.evaluation?.solved !== undefined) {
    return boardOrGame.evaluation.solved;
  }
  return evaluateNetwork(boardOrGame, masks).solved;
}

export function maskAt(board, masks, row, column) {
  const index = indexOf(board, row, column);
  if (index < 0) return null;
  return normalizeMasks(board.width, board.height, masks)[index];
}


export function orientationOptions(mask) {
  assertMask(mask);
  return [...new Set([mask,rotateMask(mask,1),rotateMask(mask,2),rotateMask(mask,3)])].sort((a,b)=>a-b);
}

/** Constraint search over shapes, never the precomputed answer. */
export function solveNetwork(board, shapesInput, { limit = 2, maxNodes = 200000 } = {}) {
  const { width,height,total }=boardDimensions(board);
  const shapes=normalizeMasks(width,height,shapesInput);
  if(!Number.isInteger(limit)||limit<1)throw new RangeError('Solution limit must be positive.');
  if(!Number.isInteger(maxNodes)||maxNodes<1)throw new RangeError('Search node budget must be positive.');
  const neighbours=Array.from({length:total},(_,index)=>DIRECTIONS.map(direction=>indexOf(board,Math.floor(index/width)+direction.row,index%width+direction.column)));
  const solutions=[], stats={branches:0,propagationRounds:0,domainRemovals:0,connectivityPrunes:0,cyclePrunes:0,contradictions:0,initialUnresolved:0};
  let nodes=0,exhausted=false,limitReached=false;
  function propagate(domains) {
    let changed=true;
    while(changed) {
      changed=false;stats.propagationRounds++;
      for(let index=0;index<total;index++) {
        const kept=domains[index].filter(mask=>DIRECTIONS.every((direction,d)=>{
          const neighbour=neighbours[index][d],connects=(mask&direction.bit)!==0;
          return neighbour<0?!connects:domains[neighbour].some(other=>connects===((other&direction.opposite)!==0));
        }));
        if(!kept.length){stats.contradictions++;return false;}
        if(kept.length!==domains[index].length){stats.domainRemovals+=domains[index].length-kept.length;domains[index]=kept;changed=true;}
      }
    }
    const possible=new Set([0]),queue=[0];
    for(let cursor=0;cursor<queue.length;cursor++) {
      const index=queue[cursor];
      for(let d=0;d<4;d++) {
        const next=neighbours[index][d],direction=DIRECTIONS[d];
        if(next<0||possible.has(next))continue;
        if(domains[index].some(mask=>(mask&direction.bit)!==0)&&domains[next].some(mask=>(mask&direction.opposite)!==0)){possible.add(next);queue.push(next);}
      }
    }
    if(possible.size!==total){stats.connectivityPrunes++;return false;}
    // A cycle made entirely of compulsory edges can never be removed by a
    // later choice. Detect it independently of optional edges and the root.
    const parent=Array.from({length:total},(_,index)=>index);
    const find=index=>{while(parent[index]!==index)index=parent[index];return index;};
    for(let index=0;index<total;index++)for(const d of [1,2]) {
      const next=neighbours[index][d],direction=DIRECTIONS[d];
      if(next<0||!domains[index].every(mask=>(mask&direction.bit)!==0)||!domains[next].every(mask=>(mask&direction.opposite)!==0))continue;
      const a=find(index),b=find(next);if(a===b){stats.cyclePrunes++;return false;}parent[a]=b;
    }
    return true;
  }
  function search(inputDomains,depth) {
    if(exhausted||limitReached)return;
    if(nodes>=maxNodes){exhausted=true;return;}
    nodes++;
    const domains=inputDomains.map(domain=>domain.slice());
    if(!propagate(domains))return;
    if(depth===0)stats.initialUnresolved=domains.filter(domain=>domain.length>1).length;
    let branch=-1,smallest=Infinity;
    for(let index=0;index<total;index++)if(domains[index].length>1&&domains[index].length<smallest){branch=index;smallest=domains[index].length;}
    if(branch<0) {
      const candidate=domains.map(domain=>domain[0]);
      if(evaluateNetwork(board,candidate).solved){solutions.push(Object.freeze(candidate));if(solutions.length>=limit)limitReached=true;}
      return;
    }
    stats.branches++;
    for(const mask of domains[branch]) {
      const next=domains.map(domain=>domain.slice());next[branch]=[mask];search(next,depth+1);
      if(exhausted||limitReached)return;
    }
  }
  search(shapes.map(orientationOptions),0);
  return Object.freeze({solutions:Object.freeze(solutions),count:solutions.length,nodes,exhausted,complete:!exhausted&&!limitReached,limitReached,stats:Object.freeze(stats)});
}

/** Shape/data validation is intentionally separate from offline uniqueness proof. */
export function createLevel(definition) {
  if(!definition||typeof definition!=='object')throw new TypeError('Level must be an object.');
  const {width,height,total}=boardDimensions(definition);
  if(typeof definition.id!=='string'||! /^[a-z0-9-]+$/.test(definition.id))throw new TypeError('Level id must use lowercase letters, numbers and hyphens.');
  const initial=normalizeMasks(width,height,definition.initial);
  const solution=normalizeMasks(width,height,definition.solution);
  const lighthouseIndex=definition.lighthouseIndex===undefined?Math.floor(height/2)*width+Math.floor(width/2):definition.lighthouseIndex;
  if(!Number.isInteger(lighthouseIndex)||lighthouseIndex<0||lighthouseIndex>=total)throw new RangeError('Lighthouse is outside the board.');
  for(let index=0;index<total;index++)if(!sameShape(initial[index],solution[index]))throw new RangeError('Initial module changed shape.');
  const board={width,height,lighthouseIndex};
  if(!evaluateNetwork(board,solution).solved)throw new RangeError('Provided solution is not a complete tree.');
  if(evaluateNetwork(board,initial).solved)throw new RangeError('A puzzle cannot start solved.');
  return Object.freeze({...definition,width,height,total,lighthouseIndex,initial:Object.freeze(initial),solution:Object.freeze(solution)});
}

function normalizeLocks(total,value) {
  if(value===undefined||value===null)return Array(total).fill(false);
  if(!Array.isArray(value)||value.length!==total||value.some(item=>typeof item!=='boolean'))throw new TypeError('Locks must be a boolean array matching the board.');
  return value.slice();
}
export function createGame(level,options={}) {
  if(!level||typeof level.id!=='string')throw new TypeError('A level object is required.');
  const {width,height,total}=boardDimensions(level);
  const initial=normalizeMasks(width,height,level.initial);
  const orientations=normalizeMasks(width,height,options.orientations===undefined?initial:options.orientations);
  for(let index=0;index<total;index++)if(!sameShape(initial[index],orientations[index]))throw new RangeError('Game module changed shape.');
  const locked=normalizeLocks(total,options.locked),moves=options.moves===undefined?0:options.moves;
  if(!Number.isSafeInteger(moves)||moves<0)throw new RangeError('Moves must be a non-negative safe integer.');
  const evaluation=evaluateNetwork(level,orientations);
  return Object.freeze({level,levelId:level.id,orientations:Object.freeze(orientations),locked:Object.freeze(locked),moves,status:evaluation.solved?'won':'playing',evaluation});
}
function rejected(game,reason){return {accepted:false,reason,state:game,evaluation:game.evaluation};}
export function applyAction(game,action={}) {
  if(!game||!game.level||!Array.isArray(game.orientations))throw new TypeError('Action requires a game state.');
  const index=action.index;
  if(!Number.isInteger(index)||index<0||index>=game.orientations.length)return rejected(game,'outside-board');
  if(action.type==='toggle-lock') {
    const locked=game.locked.slice();locked[index]=!locked[index];
    const state=createGame(game.level,{orientations:game.orientations,locked,moves:game.moves});
    return {accepted:true,effect:locked[index]?'locked':'unlocked',index,state,evaluation:state.evaluation};
  }
  if(action.type!=='rotate')return rejected(game,'unknown-action');
  if(game.status==='won')return rejected(game,'complete');
  if(game.locked[index])return rejected(game,'locked');
  const turns=action.turns===undefined?1:action.turns;
  if(turns!==1&&turns!==-1)return rejected(game,'invalid-turns');
  const mask=rotateMask(game.orientations[index],turns);
  if(mask===game.orientations[index])return rejected(game,'fixed-shape');
  const orientations=game.orientations.slice();orientations[index]=mask;
  const state=createGame(game.level,{orientations,locked:game.locked,moves:game.moves+1});
  return {accepted:true,effect:turns<0?'rotated-counterclockwise':'rotated-clockwise',index,turns,state,evaluation:state.evaluation};
}
