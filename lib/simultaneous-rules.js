/* Pure match rules. UI choices and random outcomes are kept separate. */
import * as G from './fixed-board-geometry.js';
export const RingTrial = (() => {
  'use strict';
  const IDS = ['red', 'blue'];
  const DIRS = [
    { key: 'up', mark: '↑', dr: -1, dc: 0 },
    { key: 'right', mark: '→', dr: 0, dc: 1 },
    { key: 'down', mark: '↓', dr: 1, dc: 0 },
    { key: 'left', mark: '←', dr: 0, dc: -1 },
  ];
  const CORNER_DIRS = [
    {key:'up-left',mark:'↖',dr:-1,dc:-1}, {key:'up-right',mark:'↗',dr:-1,dc:1},
    {key:'down-right',mark:'↘',dr:1,dc:1}, {key:'down-left',mark:'↙',dr:1,dc:-1},
  ];
  const ALL_DIRS = [...DIRS,...CORNER_DIRS];
  const NAMES = {
    strike: '打撃', throw: '投げ', submission: '関節技', pin: 'フォール',
    rope: 'ロープスロー', run: 'ロープ・コーナーへ走る', move: '移動のみ', carry:'掴み・引きずり移動', return:'リングへ連れ戻す',
    rest: '復帰準備', hold: '締め続ける', escape: '脱出・ロープへ', release: '技を離す', dive: '飛び技', 'pull-down':'引きずり落とし', 'knock-down':'高所崩し',
  };
  const DEFAULTS = { strikeMode: 'called', attackSteps: 1, collision: 'contest', cpuStyle: 'balanced' };
  const ATTACKS = ['strike', 'throw', 'submission', 'rope', 'dive', 'pull-down', 'knock-down'];
  const CONTROLS = ['throw', 'submission', 'rope'];
  const copy = x => JSON.parse(JSON.stringify(x));
  const other = id => id === 'red' ? 'blue' : 'red';
  const name = id => id === 'red' ? '赤' : '青';
  const area = p => p.area || (p.r < 0 || p.r > 6 || p.c < 0 || p.c > 6 ? 'ringside' : 'ring');
  const location = p => ({area:area(p),row:p.r,column:p.c});
  const fromLocation = p => ({area:p.area,r:p.row,c:p.column});
  const iso = key => ({up:'right-back',right:'right-front',down:'left-front',left:'left-back'})[key];
  const maxHp = f => f.maxHp || 8;
  const incapacitated = f => f.down || f.groggy;
  function carryIntent(s,id,key){
    const f=s.fighters[id],t=s.fighters[other(id)],d=DIRS.find(x=>x.key===key);
    if(!d||incapacitated(f)||f.skip||f.run||s.hold||!incapacitated(t)||distance(f,t)!==1||area(f)!==area(t)||area(f)==='corner')return null;
    const actor=world(f.r+d.dr,f.c+d.dc),target=world(t.r+d.dr,t.c+d.dc);
    if(!inside(actor)||!inside(target)||area(actor)!==area(f)||area(target)!==area(t))return null;
    return {actor,target};
  }
  function returnOptions(f,t){
    if(area(f)!=='ringside'||area(t)!=='ringside'||distance(f,t)!==1)return [];
    const choices=[];
    for(const d of DIRS){const actor=world(f.r+d.dr,f.c+d.dc);if(!atRope(actor)||!inside(actor))continue;
      for(const side of DIRS){const target=world(actor.r+side.dr,actor.c+side.dc);if(!inside(target)||!atRope(target)||area(target)!=='ring')continue;
        choices.push({key:side.key,actor,target});}}
    return choices;
  }
  function returnIntent(s,id,key){const f=s.fighters[id],t=s.fighters[other(id)];if(incapacitated(f)||f.skip||f.run||s.hold||!incapacitated(t))return null;return returnOptions(f,t).find(x=>x.key===key)||null;}
  function cornerRoute(f,key){
    if(!diagonal(key)||area(f)!=='ring'||!(f.r===f.c||f.r+f.c===6))return null;
    const d=vector(key),post=edgeFrom(f,key);
    if(Math.abs(post.r-f.r)!==Math.abs(post.c-f.c))return null;
    return {post:world(post.r,post.c),goal:world(post.r-d.dr,post.c-d.dc)};
  }
  function diagonalThrow(f,target,key){
    const route=cornerRoute(f,key);if(!route||area(target)!=='ring')return null;
    const d=vector(key),entry=world(f.r+d.dr,f.c+d.dc);
    if(!inside(entry)||area(entry)!=='ring')return null;
    const feed=path(target,entry,f,distance(target,entry));
    return feed?{cornerImpact:true,cornerLocation:location(route.post),destination:location(route.goal),entry,feed}:null;
  }
  function ropeGeometry(f,target,key){if(diagonal(key))return diagonalThrow(f,target,key);return area(f)==='ring'?G.ropeThrowGeometry(location(f),iso(key),location(target)):G.ringsideThrowGeometry(location(f),iso(key));}
  function ropeTarget(f,target,key){if(diagonal(key)){const route=diagonalThrow(f,target,key);return route?{kind:'corner',location:fromLocation(route.cornerLocation)}:null;}const t=G.ropeDirectionTarget(location(f),iso(key),location(target));return t?.location?{...t,location:fromLocation(t.location)}:null;}
  function diveGeometry(f,target,face,rng=Math.random){
    const from=location(f),to=location(target),v={row:Math.sign(target.r-f.r),column:Math.sign(target.c-f.c)};
    const range=reach(f,target,face),valid=diveInRange(f,target,face);
    if(!valid)return null;
    const push=G.locationForWorldCell(to.row+v.row,to.column+v.column);
    return {landing:cell(target),push:push?fromLocation(push):null};
  }
  function diveInRange(f,target,face=f.face){
    if(!inside(target)||area(target)==='corner'||G.locationHeight(location(f))<=G.locationHeight(location(target)))return false;
    if(area(f)==='corner')return Math.max(Math.abs(target.r-f.r),Math.abs(target.c-f.c))<=2;
    const range=reach(f,target,face);return range>=1&&range<=2;
  }
  function diveLandings(f,target,occupied,face){return nearby(target,f,[occupied],false,G.locationHeight(location(f))).filter(p=>diveInRange(f,p,face));}
  const corner = p => (p.r === 0 || p.r === 6) && (p.c === 0 || p.c === 6);
  const cell = f => ({ r: f.r, c: f.c, ...(f.area ? { area: f.area } : {}) });
  const same = (a, b) => a.r === b.r && a.c === b.c && area(a) === area(b);
  const distance = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) + (a.r === b.r && a.c === b.c && area(a) !== area(b) ? 1 : 0);
  const inside = p => area(p) === 'corner' ? corner(p) : area(p) === 'ring' ? p.r >= 0 && p.r < 7 && p.c >= 0 && p.c < 7 && !corner(p)
    : p.r >= -1 && p.r <= 7 && p.c >= -1 && p.c <= 7 && (p.r === -1 || p.r === 7 || p.c === -1 || p.c === 7);
  const world = (r,c) => ({r,c,area:corner({r,c}) ? 'corner' : r < 0 || r > 6 || c < 0 || c > 6 ? 'ringside' : 'ring'});
  const atRope = p => area(p) === 'ring' && (p.r === 0 || p.r === 6 || p.c === 0 || p.c === 6);
  const coordinate = p => `${String.fromCharCode(66 + p.c)}${p.r + 2}${area(p) === 'corner' ? '（コーナー上）' : area(p) === 'ringside' ? '（場外）' : ''}`;
  const vector = key => ALL_DIRS.find(d => d.key === key) || DIRS[1];
  const diagonal = key => CORNER_DIRS.some(d=>d.key===key);
  function nearby(center,from,occupied=[],ringOnly=false,lowerThan=null) {
    const dr=Math.sign(center.r-from.r),dc=Math.sign(center.c-from.c),result=[];
    for(let r=center.r-1;r<=center.r+1;r++)for(let c=center.c-1;c<=center.c+1;c++){
      if(r===center.r&&c===center.c||(r-center.r)*dr+(c-center.c)*dc>0)continue;
      const loc=G.locationForWorldCell(r,c);if(!loc)continue;
      const p=fromLocation(loc);
      if(ringOnly&&area(p)!=='ring'||lowerThan!==null&&G.locationHeight(loc)>=lowerThan||occupied.some(o=>same(o,p)))continue;
      result.push(p);
    }
    return result;
  }
  const pick = (items,rng) => items.length?items[Math.floor(rng()*items.length)]:null;
  function highAttack(f,target,p) {
    const category=p.move==='knock-down'?'strike':p.move==='pull-down'?'throw':p.move;
    if(!['strike','throw'].includes(category)||G.locationHeight(location(target))!==G.locationHeight(location(f))+1||reach(f,target,p.face)!==1)return null;
    const candidates=nearby(target,f,[f],category==='throw',G.locationHeight(location(target)));
    return candidates.length?{category,candidates}:null;
  }
  const facingToward = (a, b) => Math.abs(b.c - a.c) >= Math.abs(b.r - a.r)
    ? b.c >= a.c ? 'right' : 'left' : b.r >= a.r ? 'down' : 'up';
  function reach(a, b, facing = a.face) {
    const d = vector(facing), dr = b.r - a.r, dc = b.c - a.c;
    return d.dr ? dc === 0 && dr * d.dr > 0 ? Math.abs(dr) : 0
      : dr === 0 && dc * d.dc > 0 ? Math.abs(dc) : 0;
  }
  function initial() {
    const fighter = (r, c, face) => ({ r, c, face, hp: 8, maxHp:8, outsideTurns:0, down: false, recoveryFails: 0, run: null, ropeAnchor: null });
    return {
      round: 1, fighters: { red: fighter(3, 2, 'right'), blue: fighter(3, 4, 'left') },
      hold: null, doubleCount: null, winner: null, finish: '', history: [],
      log: [{ round: 0, text: '試合開始。双方が行動を伏せて決めます。' }],
    };
  }
  // Find an actual shortest walk. An occupied intermediate cell cannot be jumped over.
  function path(from, to, occupied, max = distance(from, to), rotation=0) {
    if (!inside(to) || occupied && same(to, occupied)) return null;
    if(G.isBlockedCornerMove(location(from),location(to),rotation))return null;
    const queue = [{ p: cell(from), steps: [] }], visited = new Set([`${from.r},${from.c}`]);
    while (queue.length) {
      const current = queue.shift();
      if (same(current.p, to)) return current.steps;
      if (current.steps.length >= max) continue;
      for (const d of DIRS) {
        const next = world(current.p.r + d.dr,current.p.c + d.dc), key = `${next.r},${next.c}`;
        if (!inside(next) || G.isBlockedCornerMove(location(current.p),location(next),rotation) || occupied && same(next, occupied) || visited.has(key)) continue;
        visited.add(key); queue.push({ p: next, steps: [...current.steps, next] });
      }
    }
    return null;
  }
  function straightPath(from, to) {
    if (from.r !== to.r && from.c !== to.c && Math.abs(to.r-from.r)!==Math.abs(to.c-from.c)) return null;
    const result = [], dr = Math.sign(to.r - from.r), dc = Math.sign(to.c - from.c);
    let p = cell(from);
    while (!same(p, to)) { p = world(p.r + dr,p.c + dc); result.push(p); }
    return result;
  }
  function edgeFrom(from, direction) {
    const d = vector(direction);
    return { r: d.dr < 0 ? 0 : d.dr > 0 ? 6 : from.r, c: d.dc < 0 ? 0 : d.dc > 0 ? 6 : from.c };
  }
  function runIntent(s, id, direction) {
    const f = s.fighters[id], opponent = s.fighters[other(id)], d = vector(direction);
    if (f.down || f.skip || f.groggy || f.run || s.hold || area(f) !== 'ring') return null;
    if(diagonal(direction)){
      const route=cornerRoute(f,direction);
      if(!route||same(route.goal,f)||(opponent.r-f.r)*d.dr+(opponent.c-f.c)*d.dc>=0)return null;
      const routeCells=straightPath(f,route.goal);
      if(!routeCells||routeCells.some(p=>same(p,opponent)))return null;
      return {...route,origin:cell(f),corner:true,rebound:false};
    }
    if (atRope(f)) {
      if (f.ropeAnchor && reach(f, f.ropeAnchor, direction)) {
        return { goal: cell(f), origin: cell(f.ropeAnchor), rebound: true };
      }
      const inward = f.r === 0 && d.dr === 1 || f.r === 6 && d.dr === -1
        || f.c === 0 && d.dc === 1 || f.c === 6 && d.dc === -1;
      if (inward) return { goal: cell(f), origin: { r: d.dr ? 3 : f.r, c: d.dc ? 3 : f.c }, rebound: true };
    }
    if ((opponent.r - f.r) * d.dr + (opponent.c - f.c) * d.dc >= 0) return null;
    const goal = edgeFrom(f, direction);
    if (same(goal, f) || !path(f, goal, opponent)) return null;
    return { goal, origin: cell(f), rebound: false };
  }
  function runDirections(s, id) { return ALL_DIRS.filter(d => runIntent(s, id, d.key)); }
  function sprintReach(a,b,key){const d=vector(key),dr=b.r-a.r,dc=b.c-a.c;if(diagonal(key))return dr*d.dr>0&&dc*d.dc>0&&Math.abs(dr)===Math.abs(dc)?Math.abs(dr):0;return reach(a,b,key);}
  function sprintOptions(s,id){
    const f=s.fighters[id],t=s.fighters[other(id)];
    if(f.down||f.groggy||f.skip||s.hold||area(f)!=='ring')return [];
    const anchor=t.run?.origin||t,result=[];
    for(const d of ALL_DIRS){
      const gap=sprintReach(f,anchor,d.key);if(!gap)continue;
      for(let n=1;n<gap;n++){
        const to=world(f.r+d.dr*n,f.c+d.dc*n);if(area(to)!=='ring'||!inside(to))continue;
        const direct=straightPath(f,to);if(!direct||direct.some(p=>same(p,t)))continue;
        if(direct.length>=3)result.push({to,direction:d.key,route:direct});
        if(!diagonal(d.key)){
          const opposite=ALL_DIRS.find(x=>x.dr===-d.dr&&x.dc===-d.dc),edge=edgeFrom(f,opposite.key),rope=world(edge.r,edge.c);
          const outward=straightPath(f,rope)||[],inward=straightPath(rope,to)||[],route=[...outward,...inward];
          if(area(rope)==='ring'&&route.length>=3&&!route.some(p=>same(p,t)))result.push({to,direction:d.key,route,rope});
        }
      }
    }
    return result.filter((o,i)=>!result.slice(0,i).some(previous=>same(previous.to,o.to)&&previous.direction===o.direction));
  }
  const hitChance=(move,t)=>move==='throw'?(t.down?90:t.groggy?80:55):move==='submission'?(t.down?85:t.groggy?65:45):move==='rope'?100:90;
  function actions(s, id) {
    if (s.winner) return [];
    if (s.hold) return s.hold.attacker === id ? ['hold', 'release'] : ['escape'];
    const f = s.fighters[id];
    if (f.down || f.skip) return ['rest'];
    if (f.groggy) return ['strike','throw','submission','pin','rope','rest'];
    if (f.run?.kind === 'thrown') return ['move'];
    if (f.run) return ['strike', 'throw', 'submission', 'rope', 'move'];
    const result = ['strike', 'throw', 'submission', 'pin', 'rope', 'move'];
    const target=s.fighters[other(id)];
    if(DIRS.some(d=>carryIntent(s,id,d.key)))result.push('carry');
    if(DIRS.some(d=>returnIntent(s,id,d.key)))result.push('return');
    if(diveGeometry(f,target,f.face,()=>0))result.unshift('dive');
    if (runDirections(s, id).length) result.push('run');
    return result;
  }
  function defaultPlan(s, id) {
    const f = s.fighters[id];
    return { move: actions(s, id)[0] || 'move', to: cell(f), face: f.face, range: 2,
      ropeDir: f.face, runDir: runDirections(s, id)[0]?.key || f.face, carryDir:DIRS.find(d=>carryIntent(s,id,d.key))?.key||f.face,returnDir:DIRS.find(d=>returnIntent(s,id,d.key))?.key||f.face };
  }
  function normalize(s, id, input) {
    const f = s.fighters[id], p = { ...defaultPlan(s, id), ...copy(input) };
    if (s.hold || s.doubleCount !== null || f.skip || incapacitated(f)||['carry','return'].includes(p.move)) {p.to = cell(f);if(incapacitated(f))p.face=f.face;}
    else if (f.run) { p.to = cell(f.run.origin); p.face = facingToward(f, p.to); }
    else if (s.fighters[other(id)].run?.kind === 'thrown') {p.to = cell(f);p.face=facingToward(f,s.fighters[other(id)].run.origin);}
    else if (p.launchRun) {
      const intent=runIntent(s,id,p.runDir);
      if(intent?.rebound){p.to=cell(intent.origin);p.face=p.runDir;}
    }
    else if(p.sprint){p.face=facingToward(f,p.to);}
    else if (p.move === 'run') {
      const intent = runIntent(s, id, p.runDir);
      if (intent) { p.to = intent.goal; if(!diagonal(p.runDir))p.face = p.runDir; }
    }
    return p;
  }
  function canSelectCell(s, id, to) {
    const f = s.fighters[id];
    return !s.winner && !s.hold && s.doubleCount === null && !f.run && !f.skip && !incapacitated(f) && distance(f, to) <= 2
      && path(f, to, s.fighters[other(id)],distance(f,to),s.view||0) !== null;
  }
  function validate(s, id, input, settings = DEFAULTS) {
    const p = normalize(s, id, input), f = s.fighters[id], opponent = s.fighters[other(id)];
    if (s.winner) return '試合は終了しています。';
    if (!actions(s, id).includes(p.move) && !['dive','pull-down','knock-down'].includes(p.move)) return '現在の状態ではその行動を選べません。';
    if(!s.hold&&(f.down||f.skip)&&p.move!=='rest')return '現在の状態ではその行動を選べません。';
    if(f.groggy&&(p.sprint||p.launchRun||['run','dive','carry','return'].includes(p.move)))return 'グロッキー中はその場の技だけ使用できます。';
    if(p.sprint)return p.move==='strike'&&sprintOptions(s,id).some(o=>same(o.to,p.to)&&o.direction===p.runDir&&JSON.stringify(o.route)===JSON.stringify(p.sprintRoute))?null:'相手の手前までの走路と打撃を選んでください。';
    if (s.hold || f.run) return null;
    if(p.launchRun)return runIntent(s,id,p.runDir)?.rebound&&ATTACKS.includes(p.move)?null:'ロープ際から内側へ走る攻撃を選んでください。';
    if(p.move==='carry')return carryIntent(s,id,p.carryDir)?null:'隣接したダウン・グロッキー相手を、同じ高さで１マス運べる方向を選んでください。';
    if(p.move==='return')return returnIntent(s,id,p.returnDir)?null:'ロープ沿いの場外から、隣接するダウン・グロッキー相手を連れ戻す位置を選んでください。';
    if (p.move === 'run') return runIntent(s, id, p.runDir) ? null : '相手と逆方向の直線、またはロープから内側へ走る方向を選んでください。';
    const steps = distance(f, p.to);
    const limit = f.down ? 1 : p.move === 'move' ? 2 : settings.attackSteps;
    if (steps > limit) return `この行動での移動は${limit}マスまでです。移動先か行動を変更してください。`;
    if (path(f, p.to, opponent,distance(f,p.to),s.view||0) === null) return '相手やコーナーに遮られるため、この移動はできません。';
    if (ATTACKS.includes(p.move) && distance(p.to, opponent) > distance(f, opponent)) return '攻撃と後退は同じ手に行えません。「移動のみ」を選ぶか、移動先を変えてください。';
    return null;
  }
  function attackError(s, id, p, settings = DEFAULTS) {
    const f = s.fighters[id], target = s.fighters[other(id)];
    if (f.down || f.skip || s.hold) return '通常攻撃できない状態です';
    if (!ATTACKS.includes(p.move) && p.move !== 'pin') return '攻撃を選んでいません';
    if (p.target && !same(target, p.target)) return '狙ったマスから外れました';
    if(f.groggy&&!reach(f,target,f.face))return 'グロッキー中は現在の正面だけを攻撃できます';
    if(f.groggy&&p.move==='rope'&&ropeGeometry(f,target,p.ropeDir)?.kind==='ring-return')return 'グロッキー中は自身が移動する技を使用できません';
    if(p.sprint){const gap=sprintReach(f,target,p.runDir);if(area(target)==='corner')return gap===1&&p.range===1?null:'コーナー上へは近距離のみです';return area(f)===area(target)&&gap===p.range?null:'走る方向の指定マスから外れました';}
    if (p.move === 'dive') return diveGeometry(f,target,p.face,()=>0)?null:'高い場所から正面１〜２マス、コーナーから内側２マスまでが対象です';
    if(highAttack(f,target,p))return null;
    if(['pull-down','knock-down'].includes(p.move))return '正面１マス・高さ差１で着地点のある相手が対象です';
    if (area(f) !== area(target) || area(f) === 'corner') return '同じ高さから使用してください';
    if (p.move==='pin' && area(f) !== 'ring') return 'リング内で使用してください';
    if (p.move === 'pin') return target.down && distance(f, target) === 1 ? null : '隣接したダウン相手が対象です';
    const gap = reach(f, target, p.face);
    if (p.move === 'strike') return settings.strikeMode === 'called'
      ? gap === p.range ? null : '狙った距離・向きから外れました'
      : gap >= 1 && gap <= 2 ? null : '正面１〜２マスから外れました';
    if (gap !== 1) return '正面１マスから外れました';
    if (p.move === 'rope') {
      if(!ropeGeometry(f,target,p.ropeDir))return 'その方向にはロープスローできません';
    }
    return null;
  }
  const fatigue = hp => hp <= 1 ? 10 : hp <= 4 ? 5 : 0;
  const downChance = (move, hp) => hp <= 0 ? 100 : move === 'throw'
    ? hp >= 5 ? 20 : hp >= 2 ? 40 : 60 : hp >= 5 ? 25 : hp >= 2 ? 30 : 40;
  const recoveryChance = f => Math.min(100, [60, 50, 40, 30][Math.min(3, Math.max(0, -f.hp))] + f.recoveryFails * 10);
  const escapeChance = (dHp, aHp) => (dHp >= 5 ? 50 : dHp >= 2 ? 30 : 15) + fatigue(aHp);
  const holdChance = (dHp, aHp) => (dHp >= 5 ? 70 : dHp >= 2 ? 85 : 95) - fatigue(aHp);
  const pinChance = (dHp, aHp) => (dHp >= 5 ? 30 : dHp >= 2 ? 50 : dHp === 1 ? 70 : 90) - fatigue(aHp);
  const shiftChance = (hp, otherHp) => 60 + Math.sign(hp - otherHp) * 10;
  function resolve(input, redInput, blueInput, options = {}, rng = Math.random) {
    const settings = { ...DEFAULTS, ...options }, s = copy(input), frames = [], lines = [];
    const original = copy(input.fighters), plans = {
      red: normalize(s, 'red', redInput), blue: normalize(s, 'blue', blueInput),
    };
    for (const id of IDS) { const error = validate(s, id, plans[id], settings); if (error) return { error: `${name(id)}：${error}`, state: input, frames: [] }; }
    const note = text => lines.push(text);
    let lastRoll=null,ropeEdge=null,cues=[],damages={};
    const freshSkip=new Set(),freshGroggy=new Set(),freshDown=new Set(),returned=new Set();
    const frame = (message, kind = 'event', ms = 360) => {frames.push({ state: copy(s), message, kind, ms, roll:lastRoll,ropeEdge,cues:copy(cues),damages:copy(damages)});cues=[];ropeEdge=null;damages={};};
    const changeView = (id,from) => {if(area(from)==='ringside'&&area(s.fighters[id])==='ring')returned.add(id);s.view=G.rotationAfterMove(s.view||0,location(from),location(s.fighters[id]),location(s.fighters[other(id)]));};
    function check(label, chance) {
      const die = Math.min(100, Math.max(1, Math.floor(rng() * 100) + 1)), ok = die <= chance;
      lastRoll=die;
      note(`${label} ${chance}%・D100=${die} → ${ok ? '成功' : '失敗'}`); return ok;
    }
    const damage = id => { s.fighters[id].hp = Math.max(-3, s.fighters[id].hp - 1); damages[id]=(damages[id]||0)+1; note(`${name(id)}に１ダメージ（HP ${Math.max(0, s.fighters[id].hp)}／内部 ${s.fighters[id].hp}）`); };
    const stand = id => { s.fighters[id].down = false; s.fighters[id].recoveryFails = 0; };
    const knockDown = (id, pose = 'prone') => { const f = s.fighters[id]; if (!f.down) f.recoveryFails = 0; f.down = true; f.groggy=false;f.pose = pose; f.run = null; note(`${name(id)}がダウン。次の手は復帰準備。`); };
    const groggy = id => {const f=s.fighters[id];f.down=false;f.groggy=true;f.skip=false;f.run=null;f.ropeAnchor=null;f.recoveryFails=0;freshGroggy.add(id);note(`${name(id)}がグロッキー。次の１手は移動・方向転換不可、正面の技だけ使用可。`);};
    const loseBalance=id=>{const f=s.fighters[id];if(f.hp>0&&(f.hp>=maxHp(f)*2/3||check(`${name(id)} 落下・激突から踏みとどまる`,30)))groggy(id);else {knockDown(id);freshDown.add(id);}};
    function guts(id, attackerHp) {
      const f = s.fighters[id];
      if (f.hp > 0) return;
      if (!check(`${name(id)} 根性`, [50, 35, 20, 10][-f.hp] + fatigue(attackerHp))) {
        s.winner = other(id); s.finish = 'ギブアップ'; note(`${name(other(id))}の勝利：ギブアップ！`);
      }
    }
    function release(escaped, text) {
      const h = s.hold; if (!h) return;
      s.hold = null;
      if (escaped) stand(h.defender); else knockDown(h.defender);
      note(`${text}。${name(h.defender)}は${escaped ? '立ち状態' : 'ダウン'}へ（体力回復なし）。`);
    }
    function finishRound() {
      if(s.hold&&[s.hold.attacker,s.hold.defender].some(id=>area(s.fighters[id])==='ringside'))release(true,'場外関節技は次の行動選択前に自動解除');
      for(const id of IDS){delete s.fighters[id].travelFacing;if(original[id].groggy&&!freshGroggy.has(id)){s.fighters[id].groggy=false;note(`${name(id)}が体勢を立て直した。次の手から通常行動。`);}}
      for(const id of IDS)if(original[id].skip&&!freshSkip.has(id)){s.fighters[id].skip=false;note(`${name(id)}の場外落下による行動不能を消化。`);}
      const expired=[];
      for(const id of IDS){const f=s.fighters[id];f.outsideTurns=area(f)==='ringside'?(area(original[id])==='ringside'&&!returned.has(id)?(original[id].outsideTurns||0)+1:0):0;
        if(area(f)==='ringside'){note(`${name(id)} 場外カウント ${f.outsideTurns*4}／20（${f.outsideTurns}／5攻防）`);if(f.outsideTurns>=5)expired.push(id);}}
      if(!s.winner&&expired.length){s.winner=expired.length===2?'draw':other(expired[0]);s.finish=expired.length===2?'両者リングアウト':'リングアウト';note(expired.length===2?'両者リングアウト。引き分け。':`${name(expired[0])}がリングアウト負け。`);}
      if (!s.winner && !s.hold && IDS.every(id => area(s.fighters[id])==='ring' && s.fighters[id].down && s.fighters[id].hp <= 0) && s.doubleCount === null) {
        s.doubleCount = 0; note('ダブルダウン！次の手からレフェリーのダウンカウント。');
      }
      s.log.push(...lines.map(text => ({ round: s.round, text }))); s.log = s.log.slice(-400);
      s.history.push({ red: plans.red.move, blue: plans.blue.move, distance: distance(original.red, original.blue) });
      s.history = s.history.slice(-12); s.round++;
      const resultText=Object.keys(damages).map(id=>`${name(id)}に${damages[id]}ダメージ${s.fighters[id].down?'、ダウン':s.fighters[id].groggy?'、グロッキー':''}`).join(' ／ ');
      frame(s.winner ? `${s.winner === 'draw' ? '引き分け' : name(s.winner) + 'の勝利'}：${s.finish}` : resultText||'攻防終了。次の行動を選んでください。', 'result', 450);
      return { state: s, frames, plans, error: null };
    }
    note(`赤：${NAMES[plans.red.move]} ／ 青：${NAMES[plans.blue.move]} を同時公開。`);
    frame('双方の行動を公開', 'reveal', 380);
    if (s.doubleCount !== null) {
      s.doubleCount++;
      for (const id of IDS) {
        const f = s.fighters[id];
        if (check(`${name(id)} ダウンカウント${s.doubleCount}・起き上がり`, recoveryChance(f))) stand(id);
        else f.recoveryFails++;
      }
      if (IDS.some(id => !s.fighters[id].down)) { note('立ち上がった選手がいるため、通常の攻防へ戻る。'); s.doubleCount = null; }
      else if (s.doubleCount >= 3) { s.winner = 'draw'; s.finish = '両者ダウンカウント'; note('両者とも立てず、引き分け。'); }
      return finishRound();
    }
    if (s.hold) {
      const h = s.hold, attacker = s.fighters[h.attacker], defender = s.fighters[h.defender];
      if (atRope(defender)) release(true, 'ロープブレイク');
      else if (plans[h.attacker].move === 'release' || h.count >= 3) release(false, '攻撃側が技を離した');
      else {
        const escapes = check(`${name(h.defender)} 自力脱出`, escapeChance(defender.hp, attacker.hp));
        const maintains = check(`${name(h.attacker)} 維持`, holdChance(defender.hp, attacker.hp));
        if (escapes || !maintains) release(true, escapes ? '自力脱出' : '維持失敗');
        else {
          const pulls = check(`${name(h.attacker)} 引き戻し`, shiftChance(attacker.hp, defender.hp));
          const crawls = check(`${name(h.defender)} ロープへ移動`, shiftChance(defender.hp, attacker.hp));
          if (pulls !== crawls) {
            const sign = crawls ? 1 : -1;
            const targets = [h.attacker, h.defender].map(id => ({ id, r: s.fighters[id].r + h.dr * sign, c: s.fighters[id].c + h.dc * sign }));
            if (targets.every(to => inside({...to,area:"ring"}))) { for (const to of targets) Object.assign(s.fighters[to.id], cell(to)); note(crawls ? '拘束されたままロープへ１マス。' : 'ロープから１マス引き戻した。'); }
            else note('移動先がないため、位置は変わらない。');
          } else note(pulls ? '引き戻しと脱出移動が拮抗。位置は変わらない。' : '双方の移動は不成立。');
          if (atRope(defender)) release(true, 'ロープブレイク');
          else { damage(h.defender); h.count++; guts(h.defender, original[h.attacker].hp); if (!s.winner && h.count >= 3) release(false, '合計３回の上限で終了'); }
        }
      }
      frame('関節技の維持と脱出を解決', 'attack', 650);
      return finishRound();
    }
    // Walk simultaneously. Running paths can meet an opponent before their endpoint.
    const routes = {}, runIntents = {}, forcedRuns = new Set(), movementStopped = new Set(), stoppedReturns = new Set();
    for (const id of IDS) if (original[id].run?.kind === 'thrown' && original[id].run.pending) {
      if (!check(`${name(id)} ロープから戻る`, 80)) {
        s.fighters[id].ropeAnchor = cell(original[id].run.origin);
        s.fighters[id].run = null; stoppedReturns.add(id);
        note(`${name(id)}がロープで止まった。次は走るか、通常移動を選べる。`);
        frame(`${name(id)}がロープで踏みとどまった`, 'rope', 480);
      } else note(`${name(id)}が迎撃地点へ戻る。自発的な攻撃は選ばず、反撃・回避の結果を解決する。`);
    }
    for(const id of IDS)if(['carry','return'].includes(plans[id].move)){
      const intent=plans[id].move==='carry'?carryIntent(s,id,plans[id].carryDir):returnIntent(s,id,plans[id].returnDir),victim=other(id);
      if(intent){const before=copy(s.fighters);Object.assign(s.fighters[id],intent.actor);Object.assign(s.fighters[victim],intent.target);for(const who of IDS){s.fighters[who].run=null;changeView(who,before[who]);}note(`${name(id)}が${name(victim)}を${plans[id].move==='carry'?'１マス運ぶ':'リング内の隣接ロープサイドへ連れ戻す'}。復帰準備は通常どおり進む。`);frame('相手を連れて移動','move',600);}
    }
    for (const id of IDS) {
      const f = s.fighters[id], p = plans[id]; f.face = p.face;
      if (stoppedReturns.has(id)) routes[id] = [];
      else if (f.run) { forcedRuns.add(id); routes[id] = straightPath(f, f.run.origin) || []; }
      else if (p.sprint) routes[id]=copy(p.sprintRoute);
      else if (p.launchRun) routes[id]=straightPath(f,p.to)||[];
      else if (p.move === 'run') { runIntents[id] = runIntent(input, id, p.runDir); routes[id] = straightPath(f, runIntents[id].goal) || []; }
      else routes[id] = incapacitated(original[id])||['carry','return'].includes(p.move)?[]:path(f, p.to, s.fighters[other(id)],distance(f,p.to),s.view||0) || [];
    }
    const running = id => forcedRuns.has(id) || plans[id].move === 'run' || plans[id].launchRun || plans[id].sprint;
    const totalSteps = Math.max(routes.red.length, routes.blue.length);
    let step = 0, collision = false, contact = false;
    function takeStep(index, allowed = IDS) {
      const before = { red: cell(s.fighters.red), blue: cell(s.fighters.blue) };
      const next = {};
      for (const id of IDS) next[id] = allowed.includes(id) && routes[id][index] ? routes[id][index] : before[id];
      for(const id of IDS)if(plans[id].sprint&&!same(before[id],next[id])&&(same(next[id],before[other(id)])||same(next[id],next[other(id)]))){
        loseBalance(id);movementStopped.add(id);note(`${name(id)}が予定より手前の相手と激突。追加ダメージなし。`);return false;
      }
      if (same(next.red, next.blue)) {
        const redMoves = !same(before.red, next.red), blueMoves = !same(before.blue, next.blue);
        if (settings.collision === 'contest' && redMoves && blueMoves) {
          const rSteps = routes.red.length, bSteps = routes.blue.length;
          const winner = rSteps === bSteps ? rng() < .5 ? 'red' : 'blue' : rSteps < bSteps ? 'red' : 'blue';
          Object.assign(s.fighters[winner], next[winner]);changeView(winner,before[winner]); note(`同じマスの踏み込み勝負：${name(winner)}が先に入り、相手は直前のマスに残った。`);
        } else note('進路が塞がり、両者は直前のマスで止まった。');
        return false;
      }
      if (same(next.red, before.blue) && same(next.blue, before.red) || !same(next.red,before.red)&&!same(next.blue,before.blue)&&area(next.red)===area(next.blue)&&next.red.r+before.red.r===next.blue.r+before.blue.r&&next.red.c+before.red.c===next.blue.c+before.blue.c) { note('互いを通り抜けず、接触手前で止まった。'); return false; }
      for(const id of IDS)if((plans[id].move==='run'||plans[id].sprint)&&diagonal(plans[id].runDir)&&!same(before[id],next[id]))s.fighters[id].travelFacing=plans[id].runDir;
      for (const id of IDS) {
        Object.assign(s.fighters[id], next[id]);
        if(plans[id].sprint&&!same(before[id],next[id])){
          const edgeCell=atRope(next[id])?next[id]:atRope(before[id])?before[id]:null;
          if(edgeCell)ropeEdge=edgeCell.r===0?'top':edgeCell.r===6?'bottom':edgeCell.c===0?'left':'right';
        }
        // The original rebound starts with departure, not on the second travelled cell.
        if (index === 0 && !same(before[id], next[id]) && routes[id].length) {
          ropeEdge = G.ropeUsedForMove(location(original[id]), location(routes[id][routes[id].length - 1])) || ropeEdge;
        }
      }
      for(const id of IDS)if(!same(before[id],s.fighters[id]))changeView(id,before[id]);
      return true;
    }
    for (; step < totalSteps; step++) {
      if (!takeStep(step)) { collision = true; break; }
      frame('双方が移動', 'move', 130);
      if (IDS.some(running) && IDS.every(id=>!plans[id].sprint||same(s.fighters[id],plans[id].to))&&IDS.some(id => !attackError(s, id, plans[id], settings))) { step++; contact = true; note('走路上で攻撃の間合いに入った。ここで攻防を判定。'); break; }
    }
    if (collision) frame('移動中に接触', 'move', 350);
    note(`位置：赤 ${coordinate(original.red)}→${coordinate(s.fighters.red)} ／ 青 ${coordinate(original.blue)}→${coordinate(s.fighters.blue)}`);
    const start = copy(s.fighters), eligible = {};
    for (const id of IDS) {
      eligible[id] = !movementStopped.has(id)&&(!plans[id].sprint||same(s.fighters[id],plans[id].to))&&!attackError(s, id, plans[id], settings);
      if (!eligible[id] && (ATTACKS.includes(plans[id].move) || plans[id].move === 'pin')) note(`${name(id)}の${NAMES[plans[id].move]}：${attackError(s, id, plans[id], settings)}。`);
    }
    // A successful counter cancels only the opposing attack, not an extra attack roll.
    const counters = {};
    const ropeInitiator=IDS.find(id=>eligible[id]&&plans[id].move==='rope'&&ropeGeometry(s.fighters[id],s.fighters[other(id)],plans[id].ropeDir)?.returnLocation);
    for (const id of IDS) counters[id] = eligible[other(id)] && ATTACKS.includes(plans[other(id)].move)
      && !ropeInitiator ? check(`${name(id)} カウンター`, 10) : false;
    const active = { ...eligible },counteredDives=new Set();
    if(ropeInitiator)active[other(ropeInitiator)]=false;
    if (counters.red && counters.blue) { note('双方がさばいて攻め返す！返し同士を一度だけ解決。'); frame('双方カウンター成功・返し同士の攻防', 'counter', 600); }
    else if (counters.red || counters.blue) {
      const owner = counters.red ? 'red' : 'blue'; active[other(owner)] = false;
      if(eligible[other(owner)]&&plans[other(owner)].move==='dive')counteredDives.add(other(owner));
      note(`${name(owner)}が相手の攻撃を止め、選んだ行動を試みる。`);
      if (original[owner].down) { stand(owner); note(`${name(owner)}は立ち上がる。攻撃は次の手から。`); }
      frame(`${name(owner)}がカウンター・相手の攻撃は中止`, 'counter', 600);
    }
    const blockedRecovery = new Set(), roped = new Set(), hits = {};
    for (const victim of stoppedReturns) {
      const attacker = original[victim].run.attacker || other(victim);
      if (ATTACKS.includes(plans[attacker].move)) {
        active[attacker] = false; groggy(attacker);
        frame(`${name(attacker)}の迎撃は空振り。タイミングを崩した`, 'miss', 600);
      }
    }
    for (const id of IDS) if (original[id].run?.kind === 'thrown' && counters[id] && !stoppedReturns.has(id)) {
      const victim = other(id);
      if (check(`${name(id)} 戻りながら反撃`, 90)) {
        damage(victim); cues.push({actor:id,subject:victim,outcome:'hit',run:s.round});
        const f=s.fighters[victim];
        if (!f.down && check(`${name(victim)} 体勢を崩す`,downChance('strike',f.hp))) {
          if(f.hp>0&&(f.hp>=maxHp(f)*2/3||check(`${name(victim)} 踏みとどまる（グロッキー）`,30)))groggy(victim);
          else {knockDown(victim);freshDown.add(victim);}
        }
        frame(`${name(id)}のカウンターが決まった`, 'counter', 600);
      } else frame(`${name(id)}は迎撃をかわした。反撃は当たらなかった`, 'miss', 480);
    }
    // Lift belongs to the attempted throw/rope throw, even if that attempt misses.
    for (const id of IDS) if (active[id] && ['throw', 'rope'].includes(plans[id].move) && s.fighters[other(id)].down) {
      stand(other(id)); note(`${name(id)}が相手を起こして${NAMES[plans[id].move]}を仕掛ける。`); frame('相手を起こして仕掛ける', 'lift', 550);
    }
    function contest(label) {
      const die = Math.floor(rng() * 100) + 1, winner = die <= 40 ? 'red' : die <= 80 ? 'blue' : null;
      note(`${label} D100=${die} → ${winner ? name(winner) + 'が崩した' : '膠着'}`); return winner;
    }
    if (active.red && active.blue && plans.red.move === 'throw' && plans.blue.move === 'throw') {
      frame('投げ同士が組み合う', 'grapple', 600);
      const winner = contest('投げ同士の崩し合い（赤40%／青40%／膠着20%）');
      hits.red = winner === 'red'; hits.blue = winner === 'blue';
    } else {
      for (const id of IDS) {
        if (!active[id] || plans[id].move === 'pin') { hits[id] = false; continue; }
        const move = plans[id].move;
        const chance = hitChance(move,start[other(id)]);
        hits[id] = chance === 100 ? true : check(`${name(id)} ${NAMES[move]}命中`, chance);
        if (move === 'rope' && hits[id]) note(`${name(id)}のロープスロー成立。`);
      }
      if (hits.red && hits.blue && CONTROLS.includes(plans.red.move) && CONTROLS.includes(plans.blue.move)) {
        const winner = contest('捕まえる技同士の崩し合い（仮ルール）');
        hits.red = winner === 'red'; hits.blue = winner === 'blue';
      }
    }
    for (const id of IDS) if (hits[id] && plans[id].move === 'submission' && atRope(s.fighters[other(id)])) {
      hits[id] = false; stand(other(id)); blockedRecovery.add(other(id)); note('ロープブレイク！関節技は拘束・ダメージの前に解除。体力回復なし。');
    }
    for(const id of IDS)if(hits[id]&&plans[id].move==='rope')hits[other(id)]=false;
    for(const id of IDS)if(active[id]&&ATTACKS.includes(plans[id].move))cues.push({actor:id,subject:hits[id]?other(id):id,outcome:hits[id]?'hit':'miss',run:s.round});
    if (hits.red && hits.blue) { note('双方の攻撃が通った。同じ攻防として結果を適用。'); frame('双方の攻撃が交錯する', 'attack', 650); }
    else if (hits.red || hits.blue) {const id=hits.red?'red':'blue';frame(`${name(id)}の${NAMES[plans[id].move]}が決まった`, 'attack', 600);}
    else if (active.red || active.blue) frame('攻撃はダメージにつながらなかった', 'miss', 480);
    // Decide hits first. Apply damage to both before any down effects.
    for (const id of IDS) if (active[id] && plans[id].move === 'dive') {
      const victim=other(id),target=s.fighters[victim],from=s.fighters[id],before=cell(from),targetBefore=cell(target);
      const geometry=diveGeometry(start[id],start[victim],plans[id].face,()=>0);
      const push=geometry?.push&&!same(geometry.push,from)?geometry.push:null;
      if(hits[id]){
        if(push){Object.assign(target,push);Object.assign(from,targetBefore,{area:area(targetBefore)});}
        else {const landing=pick(diveLandings(start[id],start[victim],target,plans[id].face),rng);if(landing)Object.assign(from,landing);note('押し出し先が塞がり、受け手はその場で激突。追加ダメージなし。');}
        knockDown(victim);freshDown.add(victim);
      }
      else if(!hits[id]){const landing=pick(diveLandings(start[id],start[victim],target,plans[id].face),rng);if(landing)Object.assign(from,landing);}
      changeView(id,before);changeView(victim,targetBefore);
      if (!hits[id]) { damage(id);knockDown(id); freshDown.add(id); note(`${name(id)}の飛び技は空振りし、着地でダウン。`); }
      movementStopped.add(id); frame(hits[id] ? '飛び技を当てて着地' : '飛び技をかわされ、着地でダウン','attack',550);
    }
    for (const id of IDS) if (hits[id] && ['strike', 'throw', 'submission', 'dive','pull-down','knock-down'].includes(plans[id].move)) damage(other(id));
    for (const id of IDS) if (hits[id]) {
      const move = plans[id].move, victim = other(id), f = s.fighters[victim];
      if (move === 'strike' || move === 'throw' || move === 'dive' || move==='pull-down'||move==='knock-down') {
        if(plans[id].sprint&&area(start[victim])==='corner'){groggy(victim);movementStopped.add(victim);frame(`${name(victim)}はコーナー上でグロッキー`,'attack',600);continue;}
        const high=plans[id].sprint?null:highAttack(start[id],start[victim],plans[id]);
        if(high){
          const from=cell(f),landing=pick(nearby(start[victim],start[id],[s.fighters[id]],high.category==='throw',G.locationHeight(location(start[victim]))),rng);
          if(landing){Object.assign(f,landing);changeView(victim,from);}
          knockDown(victim);freshDown.add(victim);movementStopped.add(id);movementStopped.add(victim);
          note(`${name(id)}の${high.category==='throw'?'高所落とし（投げ）':'高所崩し（打撃）'}。${name(victim)}は${coordinate(f)}でダウン。`);
          frame('高所から崩され、落下してダウン','attack',600);
        }
        if (!f.down && (!original[victim].groggy||f.hp<=0) && check(`${name(victim)} 体勢を崩す`, downChance(move, f.hp))) {
          if(f.hp>0&&(f.hp>=maxHp(f)*2/3||check(`${name(victim)} 踏みとどまる（グロッキー）`,30)))groggy(victim);
          else {knockDown(victim,move === 'throw' ? 'supine' : 'prone');freshDown.add(victim);}
          movementStopped.add(victim);
        }
        if (move === 'throw') { movementStopped.add(id); movementStopped.add(victim); }
      } else if (move === 'submission') {
        movementStopped.add(id); movementStopped.add(victim); blockedRecovery.add(victim);
        const edge = [{ distance: f.r, dr: -1, dc: 0 }, { distance: 6 - f.r, dr: 1, dc: 0 }, { distance: f.c, dr: 0, dc: -1 }, { distance: 6 - f.c, dr: 0, dc: 1 }].sort((a, b) => a.distance - b.distance)[0];
        s.hold = { attacker: id, defender: victim, count: 1, dr: edge.dr, dc: edge.dc, posture: start[victim].down ? 'ground' : 'standing' };
        s.fighters[id].run = null; f.run = null; if(area(f)==='ring')guts(victim, original[id].hp);
        note(`${name(id)}が${s.hold.posture === 'standing' ? '立ったまま' : '寝技で'}拘束（１／３回）。`);
      }
    }
    for(const id of counteredDives){
      const victim=other(id),f=s.fighters[id],before=cell(f);
      if(!f.down){const landing=pick(diveLandings(start[id],start[victim],s.fighters[victim],plans[id].face),rng);if(landing)Object.assign(f,landing);changeView(id,before);knockDown(id);freshDown.add(id);movementStopped.add(id);note(`${name(id)}は飛ぶ前に崩され、${name(victim)}の周囲へ落下。カウンター自体の追加ダメージはなし。`);frame('飛ぶ前に返されて落下','counter',600);}
    }
    for(const id of IDS)if(plans[id].sprint&&!hits[id]&&!movementStopped.has(id)){
      if(plans[id].range===2||area(plans[id].target||start[other(id)])==='corner')loseBalance(id);else groggy(id);
      frame(`${name(id)}の走り打撃は空振り。体勢を崩した`,'miss',600);
    }
    for (const id of IDS) if (original[other(id)].run?.kind === 'thrown' && !stoppedReturns.has(other(id)) && ATTACKS.includes(plans[id].move) && !hits[id]) {
      if (!counters[other(id)]) frame(`${name(other(id))}が迎撃をかわした`, 'miss', 480);
      if (plans[id].range === 2 && !incapacitated(s.fighters[id])) {
        groggy(id); frame(`${name(id)}が遠い迎撃を外して体勢を崩した`, 'miss', 600);
      }
    }
    if (s.hold && (s.fighters[s.hold.attacker].down||freshGroggy.has(s.hold.attacker)) && !s.winner) release(true, '攻撃側も体勢を崩したため拘束を継続できない');
    for (const id of IDS) if (active[id] && plans[id].move === 'pin' && !s.winner) {
      const victim = other(id), f = s.fighters[victim]; blockedRecovery.add(victim); movementStopped.add(id); movementStopped.add(victim);
      if (atRope(f)) note('ロープブレイク！フォールを中止。受け手はダウンのまま、体力回復なし。');
      else {
        let count = 0;
        for (let i = 1; i <= 3; i++) { if (!check(`${name(id)} フォール・カウント${i}`, pinChance(start[victim].hp, original[id].hp))) break; count++; }
        if (count === 3) { s.winner = id; s.finish = '３カウント'; note(`${name(id)}の勝利：１！２！３！`); }
        else { stand(victim); note(`${name(victim)}がフォールを返して立つ（体力回復なし）。`); }
        frame(count === 3 ? '１！２！３！' : 'フォールを返した！', 'pin', 650);
      }
    }
    // A thrown opponent has no choice until reaching the rope and the arrival check.
    for (const id of IDS) if (hits[id] && plans[id].move === 'rope' && !s.winner) {
      const victim = other(id), f = s.fighters[victim], geometry=ropeGeometry(start[id],start[victim],plans[id].ropeDir),from=cell(f);
      if(!geometry)continue;
      roped.add(victim);
      stand(victim); f.run = null; movementStopped.add(victim); movementStopped.add(id);
      if(!diagonal(plans[id].ropeDir)){s.fighters[id].face=plans[id].ropeDir;f.face=plans[id].ropeDir;}
      if(geometry.cornerImpact||geometry.kind==='corner-impact'){
        const post=geometry.cornerLocation?fromLocation(geometry.cornerLocation):world(geometry.corner.r,geometry.corner.c);
        if(geometry.entry){for(const to of geometry.feed){Object.assign(f,to);frame('対角線の走路へ送り込む','rope',100);}}
        const destination=geometry.destination?fromLocation(geometry.destination):cell(f),steps=straightPath(f,destination);
        let blocked=!steps;
        for(const to of steps||[]){if(!inside(to)||same(to,s.fighters[id])){blocked=true;note('走路を相手が塞いだため、手前で止まる。');break;}if(diagonal(plans[id].ropeDir))f.travelFacing=plans[id].ropeDir;Object.assign(f,to);frame('コーナーへ走らされる','rope',130);}
        if(!blocked){
          frame('コーナーへ激突','rope',400);
          const landing=pick(nearby(post,post,[s.fighters[id]],true),rng);
          if(landing)Object.assign(f,landing);
          delete f.travelFacing;groggy(victim);
          note(`${name(victim)}がコーナーへ激突。無傷・立ち状態で隣接１マスへ。次の手はグロッキーで１回休み。`);
          changeView(victim,from);frame('コーナー隣でグロッキー','rope',500);
        }
        continue;
      }
      if(geometry.kind||geometry.fellOut||geometry.cornerImpact){
        const destination=geometry.destination?fromLocation(geometry.destination):from;
        if(inside(destination)&&!same(destination,s.fighters[id]))Object.assign(f,destination);
        changeView(victim,from);ropeEdge=geometry.edge||null;
        if(geometry.fellOut){groggy(victim);note(`${name(victim)}が無傷で場外へ落下。グロッキーで次の１手を休む。`);}
        else if(geometry.kind!=='ring-return'){damage(victim);if(!f.down&&check(`${name(victim)} ダウン`,downChance('strike',f.hp))){knockDown(victim);freshDown.add(victim);}note(geometry.cornerImpact||geometry.kind==='corner-impact'?'コーナーポストへ衝突。':'場外の鉄柵へ衝突。');}
        else {
          const options=returnOptions(start[id],start[victim]),choice=options.sort((a,b)=>distance(a.target,destination)-distance(b.target,destination))[0];
          if(choice){const before=cell(s.fighters[id]);Object.assign(s.fighters[id],choice.actor);Object.assign(f,choice.target);changeView(id,before);changeView(victim,from);note('場外からのロープスローで両者がリングイン。場外カウントを解除。');}
          else note('相手をリング内ロープ際へ戻した。');
        }
        cues.push({actor:id,subject:victim,outcome:'hit',run:s.round});frame('ロープスローの位置効果','rope',600);continue;
      }
      const origin=cell(fromLocation(geometry.returnLocation)),destination=fromLocation(geometry.ropeLocation);
      Object.assign(f,origin);
      let blocked=false;
      for (const to of straightPath(f, destination)||[]) { if(same(to,s.fighters[id])){blocked=true;break;}Object.assign(f, to, {area:'ring'}); frame('ロープへ走らされる', 'rope', 110); }
      if(blocked){note('相手が走路を塞ぎ、手前で止まった。');continue;}
      ropeEdge=geometry.edge;frame('ロープ到達の結果', 'rope', 480);
      if(!check(`${name(victim)} ロープから戻る`,80)){
        f.ropeAnchor=origin;f.run=null;groggy(id);
        frame(`${name(victim)}がロープで停止。${name(id)}の迎撃は空振り`,'miss',600);continue;
      }
      const intercept={move:'strike',range:1,target:origin,...plans[id].ropeIntercept};
      f.run={kind:'thrown',origin,rope:cell(f),attacker:id};
      f.face=facingToward(f,s.fighters[id]);
      const returnPath=straightPath(f,origin)||[];
      for(const to of returnPath){
        if(same(to,s.fighters[id]))break;
        Object.assign(f,to);if(same(to,returnPath[0]))ropeEdge=geometry.edge;
        frame('ロープから直線で戻る','move',110);
        if(same(f,intercept.target))break;
      }
      f.run=null;f.ropeAnchor=null;
      const attacker=s.fighters[id],attackPlan={...plans[id],...intercept,face:facingToward(attacker,origin),sprint:false};
      const hit=!attackError(s,id,attackPlan,settings)&&check(`${name(id)} 迎撃`,hitChance(intercept.move,f));
      if(hit){
        if(intercept.move==='submission'&&atRope(f)){note('ロープブレイク！関節技は拘束・ダメージの前に解除。');}
        else {
          damage(victim);cues.push({actor:id,subject:victim,outcome:'hit',run:s.round});
          if(intercept.move==='submission'){
            const edge=[{distance:f.r,dr:-1,dc:0},{distance:6-f.r,dr:1,dc:0},{distance:f.c,dr:0,dc:-1},{distance:6-f.c,dr:0,dc:1}].sort((a,b)=>a.distance-b.distance)[0];
            s.hold={attacker:id,defender:victim,count:1,dr:edge.dr,dc:edge.dc,posture:'standing'};blockedRecovery.add(victim);guts(victim,attacker.hp);
          }else if((!original[victim].groggy||f.hp<=0)&&check(`${name(victim)} 体勢を崩す`,downChance(intercept.move,f.hp)))loseBalance(victim);
        }
        frame(`${name(id)}の迎撃が決まった。反撃判定なし`,'attack',600);
      }else if(check(`${name(victim)} 勢いで反撃`,hitChance('strike',attacker))){
        damage(id);cues.push({actor:victim,subject:id,outcome:'hit',run:s.round});
        if(check(`${name(id)} 体勢を崩す`,downChance('strike',attacker.hp)))loseBalance(id);
        frame(`${name(victim)}の反撃が決まった`,'counter',600);
      }else {groggy(id);frame(`双方の攻撃が外れ、${name(id)}がグロッキー`,'miss',600);}
    }
    // Finish a committed running route unless a down, grapple, or blocked cell stopped it.
    if (contact && !collision && !s.winner) {
      const allowed = IDS.filter(id => !incapacitated(s.fighters[id]) && !movementStopped.has(id) && !(s.hold && [s.hold.attacker, s.hold.defender].includes(id)));
      for (; step < totalSteps; step++) { if (!takeStep(step, allowed)) break; frame('固定した進路を走る', 'move', 110); }
    }
    for (const id of IDS) {
      const f = s.fighters[id];
      if (forcedRuns.has(id) && !roped.has(id)) { f.run = null; note(`${name(id)}の走行終了。次の手から移動先を選べる。`); }
      if (plans[id].move === 'run' && !incapacitated(f) && !movementStopped.has(id) && !s.hold && same(f, runIntents[id].goal)) {
        if(runIntents[id].corner){note(`${name(id)}がコーナー手前へ走った。次の手は通常行動。`);continue;}
        f.run = { kind: 'self', origin: runIntents[id].origin, rope: cell(f) }; f.ropeAnchor = null;
        note(`${name(id)}は助走を準備。次の手に${coordinate(f.run.origin)}へ戻る。戻るための判定は不要。`);
        ropeEdge = f.r === 0 ? 'top' : f.r === 6 ? 'bottom' : f.c === 0 ? 'left' : f.c === 6 ? 'right' : null;
        if (ropeEdge) frame('ロープを使って折り返す準備', 'rope', 650);
      }
      if (f.ropeAnchor && !atRope(f)) f.ropeAnchor = null;
    }
    for (const id of IDS) if (original[id].down && plans[id].move === 'rest' && s.fighters[id].down
      && !freshDown.has(id) && !blockedRecovery.has(id) && !s.winner) {
      const f = s.fighters[id];
      if (f.hp >= 1) { stand(id); note(`${name(id)}が復帰準備を終えて立つ。攻撃は次の手から。`); }
      else if (check(`${name(id)} 起き上がり`, recoveryChance(f))) { stand(id); note(`${name(id)}が限界から立つ。体力回復なし。`); }
      else { f.recoveryFails++; note(`${name(id)}はまだ起きられない。次の復帰判定に＋10ポイント。`); }
    }
    return finishRound();
  }
  function chooseCPU(s, options = {}, rng = Math.random) {
    const settings = { ...DEFAULTS, ...options }, id = 'blue', f = s.fighters.blue, opponent = s.fighters.red;
    const base = defaultPlan(s, id);
    if (s.winner || s.hold || f.skip || f.down) return base;
    const back=returnOptions(f,opponent).filter(o=>returnIntent(s,id,o.key));
    if(back.length)return {...base,move:'return',returnDir:back[0].key};
    if(incapacitated(opponent)&&atRope(opponent)){
      const carries=DIRS.map(d=>({key:d.key,intent:carryIntent(s,id,d.key)})).filter(x=>x.intent&&!atRope(x.intent.target));
      if(carries.length)return {...base,move:'carry',carryDir:carries[0].key};
    }
    if (f.run) {
      if (f.run.kind === 'thrown') return normalize(s,id,{...base,move:'move'});
      const pick = rng();
      return normalize(s, id, { ...base, move: pick < .57 ? 'strike' : pick < .77 ? 'throw' : pick < .88 ? 'submission' : pick < .94 ? 'rope' : 'move', range: rng() < .7 ? 1 : 2 });
    }
    if (opponent.run?.kind === 'thrown') {
      return {...base,move:'strike',to:cell(f),face:facingToward(f,opponent.run.origin),range:rng()<.5?1:2};
    }
    // Change the place of the exchange instead of repeatedly fighting on the ropes.
    // This uses only the visible board; the reserved player action is unavailable.
    if (area(f) === "ringside" && ((f.outsideTurns||0)>=3 || rng() < .5)) {
      const returns=returnOptions(f,opponent);if(returns.length&&!incapacitated(opponent)&&rng()<.5){const inward=DIRS.find(d=>area(world(f.r+d.dr,f.c+d.dc))==='ring');return {...base,move:'rope',face:facingToward(f,opponent),ropeDir:inward.key};}
      const goals=[];for(let r=0;r<7;r++)for(let c=0;c<7;c++){const to=world(r,c);if(area(to)!=='ring')continue;const route=path(f,to,opponent,4,s.view||0);if(route)goals.push(route);}goals.sort((a,b)=>a.length-b.length);
      const route=goals[0];if(route?.length){const to=route[Math.min(1,route.length-1)];return {...base,move:'move',to,face:facingToward(to,opponent)};}
    }
    if (atRope(f) && atRope(opponent) && !opponent.down && rng() < .25) {
      const inward = DIRS.map(d => world(f.r+d.dr,f.c+d.dc))
        .filter(to => area(to) === "ring" && !atRope(to) && !validate(s, id, { ...base, move: 'move', to }, settings));
      if (inward.length) return { ...base, move: 'move', to: inward[0], face: facingToward(inward[0], opponent) };
    }
    const recentThrows = s.history.slice(-3).filter(h => h.red === 'throw').length;
    const style = settings.cpuStyle;
    const candidates = [];
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const to = world(r,c), face = facingToward(to, opponent);
      if(distance(f,to)>Math.max(2,settings.attackSteps))continue;
      for (const move of ['strike', 'throw', 'submission', 'pin', 'rope', 'move','dive']) {
        const p = normalize(s,id,{ ...base, to, face, move, range: distance(to, opponent) === 1 ? 1 : 2, ropeDir: face });
        if (validate(s, id, p, settings)) continue;
        let score = 0;
        const preview = { hold: null, fighters: { red: opponent, blue: { ...f, ...p.to, face:p.face } } };
        const valid = !attackError(preview, id, p, settings);
        if (move === 'move') score = 1.8 - Math.abs(distance(to, opponent) - (recentThrows >= 2 || style === 'striker' ? 2 : 1)) * 1.1;
        else if (valid) {
          score = 3+hitChance(move,opponent)/100*2;
          if (move === 'strike') score += style === 'striker' || recentThrows >= 2 ? 1.2 : .1;
          if (move === 'throw') score += style === 'power' ? 1.2 : .3;
          if (move === 'submission') score += atRope(opponent) ? -8 : style === 'technical' ? 1 : -.1;
          if (move === 'pin') score += atRope(opponent) ? -8 : opponent.hp <= 1 ? 3.3 : opponent.hp <= 4 ? .8 : -1.4;
          if (move === 'rope') score -= .35;
        } else score = -.8;
        score += rng() * 2.7;
        candidates.push({ p, score });
      }
    }
    for(const option of sprintOptions(s,id)){
      const range=sprintReach(option.to,opponent,option.direction);if(range<1||range>2||area(opponent)==='corner'&&range!==1)continue;
      candidates.push({p:{...base,move:'strike',to:option.to,target:cell(opponent),range,runDir:option.direction,sprint:true,sprintRoute:option.route},score:4+(incapacitated(opponent)?1.5:0)+rng()*2.7});
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.p || base;
  }
  return { IDS, DIRS, NAMES, DEFAULTS, initial, copy, other, name, cell, same, distance, inside, atRope,
    coordinate, area, world, reach, facingToward, path, runIntent, runDirections, actions, defaultPlan, normalize,
    canSelectCell, validate, attackError, downChance, recoveryChance, escapeChance, holdChance, pinChance,
    resolve, chooseCPU, location,fromLocation,ropeTarget,ropeGeometry,diveGeometry,nearby,highAttack,CORNER_DIRS,ALL_DIRS,diagonal,cornerRoute,carryIntent,returnIntent,returnOptions,maxHp,diveInRange,diveLandings,sprintOptions,sprintReach,hitChance };
})();
