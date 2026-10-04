'use client';

import { useEffect, useRef, useState } from 'react';
import { RingTrial as R } from '../../lib/simultaneous-rules';
import { RingBoard, type CharacterFacing, type BoardLocation, type BoardRotation, type RingSide, type WrestlerState } from './ring-board';
import './ring-lab.css';
import FixedManualTest from './fixed-manual-test';
import { OPPONENT_PORTRAITS, PORTRAIT_TIMING, damagedPortraits, portraitSource, type PortraitHp } from '../../lib/portrait-presentation';

type Id = 'red' | 'blue';
type Direction = 'up' | 'right' | 'down' | 'left';
type TravelDirection = Direction | 'up-left' | 'up-right' | 'down-right' | 'down-left';
type Move = 'strike' | 'throw' | 'submission' | 'pin' | 'rope' | 'run' | 'move' | 'rest' | 'hold' | 'escape' | 'release' | 'dive' | 'pull-down' | 'knock-down' | 'carry' | 'return';
type Cell = { r:number; c:number; area?:BoardLocation['area'] };
type Fighter = Cell & { face:Direction; hp:number; maxHp?:number; outsideTurns?:number; down:boolean; skip?:boolean; groggy?:boolean; travelFacing?:TravelDirection; pose?:'prone'|'supine'; recoveryFails:number; run:{kind:string;origin:Cell;rope:Cell;pending?:boolean;attacker?:Id}|null; ropeAnchor:Cell|null };
type Match = { view?:BoardRotation;round:number; fighters:Record<Id,Fighter>; hold:{attacker:Id;defender:Id;count:number;dr:number;dc:number;posture:string}|null; doubleCount:number|null; winner:Id|'draw'|null; finish:string; history:{red:string;blue:string;distance:number}[]; log:{round:number;text:string}[] };
type Plan = { move:Move; to:Cell; face:Direction; range:number; target?:Cell; launchRun?:boolean;sprint?:boolean;sprintRoute?:Cell[];ropeIntercept?:{move:Move;target:Cell;range:number}; ropeDir:TravelDirection; runDir:TravelDirection; carryDir:Direction; returnDir:Direction };
type Cue={outcome:'hit'|'miss';actor:Id;subject:Id;run:number};
type Frame = { state:Match; message:string;kind:string;ms:number;roll?:number|null;ropeEdge?:'top'|'right'|'bottom'|'left'|null;cues?:Cue[];damages?:Partial<PortraitHp> };
const ISO:Record<Direction,RingSide> = {up:'right-back',right:'right-front',down:'left-front',left:'left-back'};
const DIRECTIONS:{key:Direction;label:string}[] = [{key:'up',label:'右奥'},{key:'right',label:'右手前'},{key:'down',label:'左手前'},{key:'left',label:'左奥'}];
const TRAVEL_DIRECTIONS:{key:TravelDirection;label:string}[]=[...DIRECTIONS,{key:'up-left',label:'奥のコーナー'},{key:'up-right',label:'右のコーナー'},{key:'down-right',label:'手前のコーナー'},{key:'down-left',label:'左のコーナー'}];
const TRAVEL_SPRITES:Partial<Record<TravelDirection,CharacterFacing>>={'up-left':'back','up-right':'profile-right','down-right':'front','down-left':'profile-left'};
const OPPOSITE_ISO:Record<RingSide,Direction> = {'right-back':'up','right-front':'right','left-front':'down','left-back':'left'};
const settings = (style:string) => ({...R.DEFAULTS,cpuStyle:style});
const initial = () => R.initial() as Match;
const defaultPlan = (s:Match) => {
  const p=R.defaultPlan(s,'red') as Plan;
  if(p.move==='strike'&&!s.fighters.red.groggy&&!s.fighters.red.run&&s.fighters.blue.run?.attacker!=='red')p.move='move';
  if(s.fighters.blue.run?.attacker==='red')p.face=R.facingToward(s.fighters.red,s.fighters.blue.run.origin) as Direction;
  return p;
};
const boardLocation = (p:Cell):BoardLocation => ({area:R.area(p),row:p.r,column:p.c}) as BoardLocation;

export default function RingLabPage() {
  const [game,setGame] = useState<Match>(initial);
  const [shown,setShown] = useState<Match>(game);
  const [plan,setPlan] = useState<Plan>(()=>defaultPlan(game));
  const [inputMode,setInputMode] = useState<'move'|'attack'|'run'>('move');
  const [interceptPicking,setInterceptPicking]=useState(false);
  const [bubble,setBubble] = useState<{location:BoardLocation;text:string}|null>(null);
  useEffect(()=>{if(!bubble)return;const timer=window.setTimeout(()=>setBubble(null),1100);return()=>window.clearTimeout(timer);},[bubble]);
  const [spritePreview,setSpritePreview] = useState<CharacterFacing|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('移動先、攻撃先、技の順に選んで行動決定。');
  const [revealed,setRevealed] = useState<{red:Plan;blue:Plan}|null>(null);
  const [rotation,setRotation] = useState<BoardRotation>(0);
  const [style,setStyle] = useState('balanced');
  const [speed,setSpeed] = useState('fast');
  const [event,setEvent] = useState('idle');
  const [scenario,setScenario] = useState('normal');
  const [directionPicker,setDirectionPicker] = useState<{kind:'rope'|'run'|'carry'|'return';previous:Plan}|null>(null);
  const [manual,setManual] = useState(false);
  const [cues,setCues] = useState<Cue[]>([]);
  const [lastRoll,setLastRoll] = useState<number|null>(null);
  const [ropeEdge,setRopeEdge] = useState<Frame['ropeEdge']>(null);
  const [cueRun,setCueRun] = useState(0);
  const [opponentPortrait,setOpponentPortrait] = useState<string>(OPPONENT_PORTRAITS[0]);
  const [damageFaces,setDamageFaces] = useState<Id[]>([]);
  const [portraitImpact,setPortraitImpact] = useState(0);
  const [displayedHp,setDisplayedHp] = useState<PortraitHp>(()=>({red:game.fighters.red.hp,blue:game.fighters.blue.hp}));
  const portraitBase = import.meta.env.BASE_URL;
  useEffect(()=>{setOpponentPortrait(OPPONENT_PORTRAITS[Math.floor(Math.random()*OPPONENT_PORTRAITS.length)]);},[]);
  useEffect(()=>{
    // Preload each matching expression to avoid a blank portrait at impact.
    for(const character of ['red-protagonist',opponentPortrait])for(const damage of [false,true]){
      const image=new Image();image.src=portraitSource(portraitBase,character,damage);
    }
  },[opponentPortrait,portraitBase]);
  const cpu = useRef<Plan|null>(null);
  const committed = useRef(false);
  const playback = useRef(0);
  const initializedRound = useRef(0);
  useEffect(()=>{
    if(initializedRound.current !== game.round){cpu.current=R.chooseCPU(game,settings(style)) as Plan;initializedRound.current=game.round;}
  },[game,style]);
  useEffect(()=>()=>{playback.current++;},[]);

  const normalized = R.normalize(game,'red',plan) as Plan;
  const intercept = game.fighters.blue.run?.kind==='thrown'&&game.fighters.blue.run.attacker==='red';
  const selectingAttack = inputMode==='attack'||interceptPicking||!!game.fighters.red.groggy||!!intercept||game.fighters.red.run?.kind==='self';
  const sprintChoices=R.sprintOptions(game,'red');
  const ropeGeometry:any=plan.move==='rope'?R.ropeGeometry({...game.fighters.red,...normalized.to},game.fighters.blue,plan.ropeDir):null;
  const interceptFace=ropeGeometry?.returnLocation?R.facingToward({...game.fighters.red,...normalized.to},R.fromLocation(ropeGeometry.returnLocation)):normalized.face;
  const error = game.winner ? '' : R.validate(game,'red',plan,settings(style));
  const previewCell = !busy&&!game.hold&&!game.fighters.red.run&&!plan.launchRun&&!plan.sprint&&!['run','carry','return'].includes(plan.move) ? normalized.to : shown.fighters.red;
  const fighters = Object.fromEntries((['red','blue'] as Id[]).map(id=>[id,{location:boardLocation(id==='red'?previewCell:shown.fighters[id]),facing:ISO[id==='red'&&!busy?normalized.face:shown.fighters[id].face],stance:shown.fighters[id].down?'down':'standing'}])) as Record<Id,WrestlerState>;
  const poses:Record<Id,'prone'|'supine'> = {red:shown.fighters.red.pose||'prone',blue:shown.fighters.blue.pose||'prone'};
  const status = (id:Id) => {
    const f=shown.fighters[id];
    if(f.groggy)return 'グロッキー / 移動・回転不可、正面の技は使用可';
    if(f.skip)return '場外落下 / 次の手は行動不能';
    if(shown.hold)return shown.hold.attacker===id?`関節技 ${shown.hold.count}/3回`:'関節技を受けている';
    if(f.down)return shown.doubleCount!==null?`ダウンカウント ${shown.doubleCount}/3`:f.hp<=0?'ダウン / 復帰判定':'ダウン / 復帰準備１回';
    return f.run?.pending?'迎撃待ち / 戻るか止まるかは決定後':f.run?`${R.coordinate(f.run.origin)}へ戻る進路が固定`:'立ち状態';
  };
  const hasDamageFace = (id:Id) => damageFaces.includes(id) || shown.fighters[id].down || !!shown.fighters[id].groggy;
  const attackCell = (location:BoardLocation) => {
    const actor={...game.fighters.red,...normalized.to},target={r:location.row,c:location.column,area:location.area};
    if(busy||directionPicker||game.winner||game.hold||actor.down||actor.skip||actor.run?.kind==='thrown')return false;
    if(actor.groggy){const gap=R.reach(actor,target,actor.face);return R.area(actor)===R.area(target)&&gap>=1&&gap<=2;}
    if(interceptPicking){const gap=R.reach(actor,target,interceptFace);return gap>=1&&gap<=2&&R.area(target)==='ring';}
    if(plan.sprint){const gap=R.sprintReach(actor,target,plan.runDir);return R.inside(target)&&gap>=1&&gap<=2&&(R.area(target)==='corner'?gap===1:R.area(actor)===R.area(target));}
    if(R.area(actor)==='corner')return R.diveInRange(actor,target,normalized.face);
    const gap=R.reach(actor,target,normalized.face);
    if(intercept){const run=game.fighters.blue.run!;if(!R.reach(actor,run.rope,normalized.face))return false;}
    return R.inside(target)&&(R.diveInRange(actor,target,normalized.face)||gap>=1&&gap<=2&&(R.area(actor)===R.area(target)||!!R.highAttack(actor,target,{...normalized,move:'strike'})));
  };
  const reachable = (location:BoardLocation) => selectingAttack?attackCell(location):inputMode!=='run'&&!busy && !directionPicker && !['carry','return'].includes(plan.move) && !game.winner
    && R.canSelectCell(game,'red',{r:location.row,c:location.column,area:location.area});
  const select = (location:BoardLocation) => {
    if(!reachable(location))return;
    const to={r:location.row,c:location.column,area:location.area};
    if(selectingAttack){
      const actor={...game.fighters.red,...normalized.to};
      const range=plan.sprint?R.sprintReach(actor,to,plan.runDir):R.reach(actor,to,interceptPicking?interceptFace:normalized.face);
      if(interceptPicking){updatePlan({ropeIntercept:{move:'strike',target:to,range}});setBubble({location,text:'迎撃先'});return;}
      setPlan(p=>({...p,target:to,range,move:R.diveInRange({...game.fighters.red,...normalized.to},to,normalized.face)?'dive':'strike'}));
      setBubble({location,text:'攻撃先'});setMessage('攻撃先を選択しました。下の技を選んで行動決定。');return;
    }
    setPlan(p=>({...p,to,target:undefined,launchRun:false,sprint:false,sprintRoute:undefined,move:'move'}));
    setBubble({location,text:'移動'});
    setMessage('移動予約済み。回転アイコンで向きを調整できます。');
  };
  const updatePlan = (change:Partial<Plan>) => {if(!busy)setPlan(p=>({...p,...change}));};
  const chooseAction = (move:Move) => {
    if(busy)return;
    if(interceptPicking&&plan.ropeIntercept){updatePlan({ropeIntercept:{...plan.ropeIntercept,move}});return;}
    if(['rope','run','carry','return'].includes(move))setDirectionPicker({kind:move as 'rope'|'run'|'carry'|'return',previous:plan});
    updatePlan({move});
  };
  const chooseDirection = (key:string) => {
    if(busy)return;
    if(key.startsWith('attack:')){const [,r,c,area]=key.split(':');select({row:Number(r),column:Number(c),area:area as BoardLocation['area']});return;}
    if(key.startsWith('sprint:')){
      const choice=sprintChoices[Number(key.split(':')[1])];if(!choice)return;
      updatePlan({move:'strike',to:choice.to as Cell,sprint:true,sprintRoute:choice.route as Cell[],runDir:choice.direction as TravelDirection,target:undefined,launchRun:false});setInputMode('attack');setBubble({location:boardLocation(choice.to as Cell),text:'走る'});return;
    }
    const direction=key as TravelDirection;
    if(!directionPicker){
      if(!R.runIntent(game,'red',direction)||!R.actions(game,'red').includes('run'))return;
      const intent=R.runIntent(game,'red',direction)!;
      if(intent.rebound&&game.fighters.red.ropeAnchor){
        updatePlan({move:'strike',runDir:direction,launchRun:true,target:undefined,to:intent.origin as Cell});
        setInputMode('attack');setBubble({location:boardLocation(game.fighters.red),text:'走る'});
        setMessage('ロープから走って攻撃。狙うマスと技を選んでください。');return;
      }
      updatePlan({move:'run',runDir:direction,to:{r:game.fighters.red.r,c:game.fighters.red.c,area:game.fighters.red.area}});
      setBubble({location:boardLocation(R.runIntent(game,'red',direction)!.goal as Cell),text:'走る'});
      setMessage(`${TRAVEL_DIRECTIONS.find(d=>d.key===direction)?.label}へ走る予定です。公開するか、別のマス・技を選んで変更できます。`);
      return;
    }
    if(directionPicker.kind==='rope'){
      const geometry:any=R.ropeGeometry({...game.fighters.red,...normalized.to},game.fighters.blue,direction);
      if(geometry?.returnLocation&&!geometry.cornerImpact){setInterceptPicking(true);setMessage('帰り道から迎撃先と技を予約してください。');}
    }
    updatePlan(directionPicker.kind==='rope'?{ropeDir:direction,ropeIntercept:undefined}:directionPicker.kind==='run'?{runDir:direction}:directionPicker.kind==='carry'?{carryDir:direction as Direction}:{returnDir:direction as Direction});
    setDirectionPicker(null);setMessage(directionPicker.kind==='rope'?'帰り道から迎撃先と技を予約してください。':'方向を予約しました。行動公開で攻防を判定します。');
  };
  const cancelDirection = () => {if(directionPicker){setPlan(directionPicker.previous);setDirectionPicker(null);}};

  const publish = async () => {
    if(committed.current||game.winner||error||directionPicker)return;
    const blue=cpu.current || R.chooseCPU(game,settings(style)) as Plan;
    const result=R.resolve(game,plan,blue,settings(style));
    if(!('plans' in result)){setMessage(result.error);return;}
    committed.current=true;setBusy(true);setRevealed(result.plans);cpu.current=null;
    const run=++playback.current;
    const factor=speed==='instant'?0:speed==='fast'?.38:1;
    let previousHp:PortraitHp={red:game.fighters.red.hp,blue:game.fighters.blue.hp};
    for(const frame of result.frames as Frame[]){
      if(playback.current!==run)return;
      const nextHp:PortraitHp={red:frame.state.fighters.red.hp,blue:frame.state.fighters.blue.hp};
      const damaged=damagedPortraits(previousHp,nextHp,frame.damages);
      if(damaged.length&&factor){
        setShown(frame.state);setRotation(frame.state.view||0);setCues(frame.cues||[]);setLastRoll(frame.roll??null);setRopeEdge(frame.ropeEdge||null);setCueRun(n=>n+1);
        setDamageFaces(damaged);setPortraitImpact(n=>n+1);setEvent('damage');
        setMessage(damaged.map(id=>`${id==='red'?'赤':'青'}に ${frame.damages?.[id]||previousHp[id]-nextHp[id]} ダメージ！`).join(' ／ '));
        const from=previousHp;
        await new Promise<void>(resolve=>{
          const started=performance.now(),duration=PORTRAIT_TIMING.feedback*factor;
          const tick=(now:number)=>{
            if(playback.current!==run){resolve();return;}
            const progress=Math.min(1,(now-started)/duration);
            setDisplayedHp({red:Math.max(0,from.red)+(Math.max(0,nextHp.red)-Math.max(0,from.red))*progress,blue:Math.max(0,from.blue)+(Math.max(0,nextHp.blue)-Math.max(0,from.blue))*progress});
            if(progress<1)requestAnimationFrame(tick);else resolve();
          };
          requestAnimationFrame(tick);
        });
        const remaining=(PORTRAIT_TIMING.line+PORTRAIT_TIMING.afterglow+PORTRAIT_TIMING.outro-PORTRAIT_TIMING.feedback)*factor;
        await new Promise(resolve=>window.setTimeout(resolve,remaining));
        if(playback.current!==run)return;
        setDamageFaces([]);
      }
      setDisplayedHp(nextHp);previousHp=nextHp;
      setShown(frame.state);setMessage(frame.message);setEvent(frame.kind);setRotation(frame.state.view||0);setCues(frame.cues||[]);setLastRoll(frame.roll??null);setRopeEdge(frame.ropeEdge||null);setCueRun(n=>n+1);
      // Preserve the FIXed 600 ms rope bend even when other playback is sped up.
      if(factor)await new Promise(resolve=>window.setTimeout(resolve,frame.ropeEdge?Math.max(650,frame.ms*factor):frame.ms*factor));
    }
    if(playback.current!==run)return;
    const next=result.state as Match;
    cpu.current=next.winner?null:R.chooseCPU(next,settings(style)) as Plan;
    initializedRound.current=next.round;
    setInputMode('move');setBubble(null);setSpritePreview(null);setGame(next);setShown(next);setPlan(defaultPlan(next));setInterceptPicking(false);setRevealed(null);setEvent('idle');setCues([]);setRopeEdge(null);setBusy(false);committed.current=false;
    setDamageFaces([]);setDisplayedHp({red:next.fighters.red.hp,blue:next.fighters.blue.hp});
    setMessage(next.winner?next.finish:'次の攻防。移動・行動を予約してください。');
  };
  const reset = (scene='normal') => {
    if(busy)return;
    playback.current++;
    setInputMode('move');setBubble(null);
    const next=initial();
    if(scene==='late'){next.fighters.blue.c=3;next.fighters.red.hp=1;next.fighters.blue.hp=1;}
    if(scene==='ground'){next.fighters.blue.c=3;next.fighters.blue.hp=3;next.fighters.blue.down=true;next.fighters.blue.pose='supine';}
    if(scene==='rope'){Object.assign(next.fighters.red,{r:3,c:1,face:'left'});Object.assign(next.fighters.blue,{r:3,c:0,hp:0,down:true,face:'right',pose:'supine'});}
    if(scene==='running'){next.fighters.blue.c=3;}
    if(scene==='dive'){Object.assign(next.fighters.red,{r:6,c:0,area:'corner',face:'right'});Object.assign(next.fighters.blue,{r:5,c:1,face:'left'});}
    if(scene==='corner-run'){Object.assign(next.fighters.red,{r:3,c:3,face:'left'});Object.assign(next.fighters.blue,{r:3,c:5});}
    if(scene==='rope-side-run'){Object.assign(next.fighters.red,{r:6,c:4,face:'left'});Object.assign(next.fighters.blue,{r:6,c:0,area:'corner',face:'up',groggy:true});}
    if(scene==='corner-throw'){Object.assign(next.fighters.red,{r:3,c:3,face:'right'});Object.assign(next.fighters.blue,{r:3,c:4,groggy:true});}
    if(scene==='groggy'){Object.assign(next.fighters.red,{r:1,c:2,face:'left'});Object.assign(next.fighters.blue,{r:1,c:1,groggy:true});}
    if(scene==='high'){Object.assign(next.fighters.red,{r:5,c:0,face:'down'});Object.assign(next.fighters.blue,{r:6,c:0,area:'corner',face:'up'});}
    if(scene==='carry'){Object.assign(next.fighters.red,{r:3,c:1,face:'left'});Object.assign(next.fighters.blue,{r:3,c:0,down:true,hp:0});}
    if(scene==='return'){Object.assign(next.fighters.red,{r:7,c:2,area:'ringside',face:'right'});Object.assign(next.fighters.blue,{r:7,c:3,area:'ringside',down:true,hp:0});}
    if(scene==='count'){Object.assign(next.fighters.red,{r:7,c:2,area:'ringside',face:'right',outsideTurns:4});Object.assign(next.fighters.blue,{r:7,c:3,area:'ringside',face:'left',outsideTurns:4});}
    if(scene==='outside-dive'){Object.assign(next.fighters.red,{r:6,c:0,area:'corner',face:'down'});Object.assign(next.fighters.blue,{r:7,c:1,area:'ringside',groggy:true});}
    if(scene==='red-groggy'){Object.assign(next.fighters.red,{groggy:true});}
    if(scene==='outside'){Object.assign(next.fighters.red,{r:7,c:2,area:'ringside',face:'right'});Object.assign(next.fighters.blue,{r:7,c:3,area:'ringside',face:'left'});}
    cpu.current=R.chooseCPU(next,settings(style)) as Plan;initializedRound.current=next.round;
    setOpponentPortrait(OPPONENT_PORTRAITS[Math.floor(Math.random()*OPPONENT_PORTRAITS.length)]);
    setDamageFaces([]);setDisplayedHp({red:next.fighters.red.hp,blue:next.fighters.blue.hp});
    setSpritePreview(null);setGame(next);setShown(next);setPlan(defaultPlan(next));setInterceptPicking(false);setInputMode('move');setDirectionPicker(null);setRevealed(null);setEvent('idle');setRotation(0);setLastRoll(null);setCues([]);setRopeEdge(null);setMessage('移動先、攻撃先、技の順に選んで行動決定。');
  };
  const saveLog=()=>{
    const blob=new Blob([JSON.stringify({version:'simultaneous-native-20261003-outside',game,plan},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ring-match-log.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const runPath = plan.sprintRoute || (interceptPicking&&ropeGeometry?.returnLocation?R.path(R.fromLocation(ropeGeometry.ropeLocation),R.fromLocation(ropeGeometry.returnLocation),null,16)||[]:game.fighters.red.run ? R.path(game.fighters.red,game.fighters.red.run.origin,null,16)||[] : []);
  const groups = new Map<number,string[]>();for(const line of game.log){if(!groups.has(line.round))groups.set(line.round,[]);groups.get(line.round)!.push(line.text);}
  const f=game.fighters.red;
  const selectedAttack=interceptPicking?plan.ropeIntercept:plan;
  const evaluationPlan={...normalized,...(interceptPicking?plan.ropeIntercept:{}),face:interceptPicking?interceptFace:normalized.face};
  const actionPreview={...game,fighters:{...game.fighters,red:{...f,...(plan.move==='run'?R.cell(f):normalized.to),face:evaluationPlan.face},blue:{...game.fighters.blue,...(selectedAttack?.target||{})}}};
  const availableActions=([...new Set([...R.actions(actionPreview,'red').filter(move=>!['carry','return'].includes(move)),...R.actions(game,'red').filter(move=>['carry','return'].includes(move))])] as Move[])
    .filter(move=>move!=='run'&&(plan.sprint||R.distance(f,normalized.to)<=1||['move','carry','return'].includes(move)||plan.move==='run'||f.run?.kind==='self'||plan.launchRun))
    .filter(move=>move!=='pin'||!R.attackError(actionPreview,'red',{...normalized,move},settings(style)));
  const categories=availableActions.filter(move=>{
    if(plan.sprint&&move!=='strike')return false;
    if(interceptPicking&&!['strike','throw','submission'].includes(move))return false;
    if(move==='move'&&f.run?.kind==='self')return true;
    if(['rest','hold','escape','release'].includes(move))return true;
    if(['carry','return'].includes(move))return !selectingAttack;
    if(!selectingAttack)return f.run?.kind==='thrown'&&move==='move';
    if(!selectedAttack?.target)return f.run?.kind==='thrown'&&move==='move';
    return move!=='move'&&!R.attackError(actionPreview,'red',{...evaluationPlan,move},settings(style));
  });
  const needsTarget=interceptPicking?!plan.ropeIntercept:inputMode==='run'||selectingAttack&&f.run?.kind!=='thrown'&&!['rest','hold','escape','release','carry','return','run','move'].includes(plan.move)&&!plan.target;
  const directionTargets = directionPicker ? TRAVEL_DIRECTIONS.flatMap(d=>{
    if(directionPicker.kind==='carry'||directionPicker.kind==='return'){
      const intent=directionPicker.kind==='carry'?R.carryIntent(game,'red',d.key):R.returnIntent(game,'red',d.key);
      return intent?[{key:d.key,label:directionPicker.kind==='carry'?`相手を運ぶ：${d.label}方向`:`連れ戻す：相手を${R.coordinate(intent.target)}へ`,location:boardLocation((directionPicker.kind==='carry'?intent.actor:intent.target) as Cell)}]:[];
    }
    if(directionPicker.kind==='run'){
      const intent=R.runIntent(game,'red',d.key);
      return intent?[{key:d.key,label:`${R.diagonal(d.key)?'コーナー':'ロープ'}へ走る：${d.label}方向`,location:boardLocation(intent.rebound?intent.origin:intent.goal)}]:[];
    }
    const target=R.ropeTarget({...f,...normalized.to},game.fighters.blue,d.key);
    return target?[{key:d.key,label:`ロープスロー：${d.label}方向${target.kind==='corner'?'（コーナー衝突）':''}`,kind:target.kind,location:boardLocation(target.location)}]:[];
  }):inputMode==='run'?sprintChoices.map((choice:any,index:number)=>({key:`sprint:${index}`,label:`走る ${R.coordinate(choice.to)}`,kind:'run',location:boardLocation(choice.to)})):selectingAttack?Array.from({length:81},(_,i)=>R.world(Math.floor(i/9)-1,i%9-1) as Cell).filter((p:Cell)=>attackCell(boardLocation(p))).map((p:Cell)=>({key:`attack:${p.r}:${p.c}:${R.area(p)}`,label:`攻撃先 ${R.coordinate(p)}`,kind:selectedAttack?.target&&R.same(selectedAttack.target,p)?'attack-selected':'attack',location:boardLocation(p)})):[];
  const hint=game.doubleCount!==null?'両者ダウンのカウント中です。復帰準備を公開すると双方の起き上がりを判定します。':game.hold?'関節技の維持・解除と脱出を同じ攻防で解決します。':f.run?.kind==='thrown'?'戻るか止まるかは決定後。戻る時は反撃・回避の判定だけを行います。':f.run?'戻る進路は固定です。狙うマスと技を選んでください。':f.skip?'場外への落下後は、この手を休んでから次の行動へ進みます。':f.groggy?'移動・方向転換はできません。今の正面への攻撃か、体勢を立て直すを選べます。':f.down?'この手は復帰準備。自分では移動できません。攻撃は立った次の手から。':'攻撃と同じ手は１マス移動、移動のみは２マス。選択した移動は公開後に行います。';

  if(manual)return <><div className="fixed-manual-banner"><b>前版の表示・位置・技を手動確認するモード</b><button type="button" onClick={()=>setManual(false)}>同時攻防の試合に戻る</button></div><FixedManualTest/></>;
  const visibleRopeEdge=rotation===2?({top:'bottom',right:'left',bottom:'top',left:'right'} as const)[ropeEdge||'top']:ropeEdge;
  return <main className="ring-lab simultaneous-native" data-rule-version="simultaneous-native-20261003-outside">
    <header className="ring-lab-titlebar"><div><p>WRESTLING TACTICS / RING LAB</p><h1>RING MATCH</h1></div><strong>攻防 {game.round}</strong></header>
    <div className="native-fighters">{(['red','blue'] as Id[]).map(id=><section key={id} className={`fighter-hud fighter-hud--${id==='red'?'player':'cpu'}`} data-expression={hasDamageFace(id)?'damage':'normal'} data-impact={damageFaces.includes(id)?'true':'false'} style={damageFaces.includes(id)?{animationDuration:`${PORTRAIT_TIMING.feedback*(speed==='fast'?.38:1)}ms`}:undefined} aria-label={`${id==='red'?'赤':'青'}コーナー選手情報`}>
      {damageFaces.includes(id)&&<span key={portraitImpact} className="fighter-hud__impact" aria-hidden="true" style={{animationDuration:`${PORTRAIT_TIMING.feedback*(speed==='fast'?.38:1)}ms`}}/>}
      <div className="fighter-hud__portrait"><img src={portraitSource(portraitBase,id==='red'?'red-protagonist':opponentPortrait,hasDamageFace(id))} alt={`${id==='red'?'主人公':'対戦相手'}・${hasDamageFace(id)?'ダメージ':'通常'}表情`} draggable={false}/></div><div className="fighter-hud__body"><div className="fighter-hud__heading"><b>{id==='red'?'PLAYER':'CPU'}</b></div><div className="fighter-hud__meter"><i style={{width:`${Math.max(0,displayedHp[id])/R.maxHp(shown.fighters[id])*100}%`,transition:busy?'none':undefined}} /></div><small>体力 <b>{Math.max(0,Math.round(displayedHp[id]))} / {R.maxHp(shown.fighters[id])}</b><span className="native-fighter-state" title={status(id)}>{shown.fighters[id].run?.pending?'迎撃待ち':shown.fighters[id].run?'走行中':status(id).split(' / ')[0]}</span>{R.area(shown.fighters[id])==='ringside'&&<span>場外 {(shown.fighters[id].outsideTurns||0)*4}/20</span>}</small></div>
    </section>)}</div>
    <RingBoard groggies={{red:shown.fighters.red.groggy,blue:shown.fighters.blue.groggy}} spritePreview={busy?null:spritePreview} runningFacing={{red:busy?TRAVEL_SPRITES[shown.fighters.red.travelFacing!]:plan.sprint?TRAVEL_SPRITES[plan.runDir]:undefined,blue:busy?TRAVEL_SPRITES[shown.fighters.blue.travelFacing!]:undefined}} wrestlers={fighters} poses={poses} rotation={rotation} reachable={reachable} onSelect={select}
      bubble={busy?null:bubble} reserved={busy||game.hold?null:boardLocation(previewCell)} reservedFacing={ISO[normalized.face]} onTurn={!busy&&!directionPicker&&!f.down&&!f.skip&&!f.groggy&&!f.run&&!plan.launchRun&&!plan.sprint&&!interceptPicking&&!intercept&&!game.hold&&!game.winner&&plan.move!=='run'?(facing)=>updatePlan({face:OPPOSITE_ISO[facing],target:undefined}):null} directionTargets={busy?[]:directionTargets} onDirection={chooseDirection} runPath={runPath.map((p:Cell)=>({row:p.r,column:p.c}))}
      combatResult={null} combatResults={cues} cpuAttack={event==='reveal'&&!!revealed&&['strike','throw','submission','rope','dive','pull-down','knock-down'].includes(revealed.blue.move)} ropeAnimation={{run:cueRun,edge:ropeEdge?visibleRopeEdge||null:null}} />
    <section className="match-message" role="status" aria-live="polite"><b>{busy?(({reveal:'行動公開',move:'移動',attack:'攻撃',damage:'ダメージ',counter:'カウンター',lift:'起こして攻撃',grapple:'組み合い',rope:'ロープの攻防',pin:'フォール',miss:'空振り',result:'攻防の結果'} as Record<string,string>)[event]||'攻防を解決中'):directionPicker?'方向を選択':'操作'}</b><span>{directionPicker?'盤面の色が付いたマスを選択してください。':message}</span></section>
    <section className="game-action-controls native-controls" aria-label="プレイヤーの行動">
      {!busy&&!directionPicker&&!f.down&&!f.groggy&&!f.skip&&!game.hold&&!f.run&&!intercept&&<div className="native-full native-mode">{(['move','attack','run'] as const).map(mode=><button type="button" key={mode} className={inputMode===mode?'is-active':undefined} disabled={mode==='run'&&!sprintChoices.length} onClick={()=>{setInterceptPicking(false);setInputMode(mode);updatePlan({move:mode==='move'?'move':'strike',target:undefined,sprint:false,sprintRoute:undefined,ropeIntercept:undefined,launchRun:false,to:plan.sprint?R.cell(f) as Cell:plan.to});setMessage(mode==='run'?'走る到着マスを選び、その先の攻撃先を選んでください。':mode==='attack'?'色の付いたマスで攻撃先を選んでください。':'移動先を選んでください。');}}>{mode==='move'?'移動':mode==='attack'?'攻撃':'走り攻撃'}</button>)}</div>}
      <div className="native-full native-plan">{revealed?`赤 ${R.NAMES[revealed.red.move]} ／ 青 ${R.NAMES[revealed.blue.move]}`:<><strong>{interceptPicking||intercept?'迎撃：':f.run?.kind==='thrown'?'戻る：':''}{needsTarget?(inputMode==='run'?'走るマスを選択':'攻撃先を選択'):(plan.sprint?'走り ':'')+R.NAMES[selectedAttack?.move||plan.move]}</strong><span>{selectedAttack?.target?`狙い ${R.coordinate(selectedAttack.target)}`:plan.move==='run'?TRAVEL_DIRECTIONS.find(d=>d.key===plan.runDir)?.label:`${R.coordinate(normalized.to)} ・ ${DIRECTIONS.find(d=>d.key===normalized.face)?.label}`}</span></>}</div>
      {directionPicker?<><button type="button" className="is-subtle native-full" onClick={cancelDirection}>戻る</button>{!directionTargets.length&&<p className="native-full native-note">今の位置から選べる方向がありません。戻って移動・行動を選び直してください。</p>}</>:categories.flatMap(move=>{
        const high=R.highAttack({...f,...normalized.to},game.fighters.blue,{...normalized,move});
        return [<button type="button" key={move} className={selectedAttack?.move===move?'is-active':undefined} disabled={busy} onClick={()=>chooseAction(move)}>{move==='move'&&f.run?.kind==='thrown'?'戻りの攻防':move==='move'&&f.run?.kind==='self'?'攻撃しない':move==='rest'&&f.groggy?'体勢を立て直す':high?(move==='throw'?'投げ（高所落とし）':'打撃（高所崩し）'):R.NAMES[move]}</button>];
      })}
      {!directionPicker&&error&&<p className="native-full native-error" role="alert">{error}</p>}
      {!directionPicker&&<button type="button" className="native-full native-publish" disabled={busy||!!error||!!game.winner||needsTarget} onClick={publish}>{busy?'攻防を解決中…':'行動決定'}</button>}
    </section>
    <details className="rules-log native-help"><summary>操作・ルール</summary>
      <p>{hint}</p><p>「移動」で色の付いたマスを選び、回転アイコンで向きを調整。「攻撃」で狙うマスを選び、下の技を選んで行動決定。２マス先は打撃のみです。決定までは選び直せます。</p><p>「走り攻撃」で到着マスを選び、その先１〜２マスの攻撃先を選びます。往復と打撃まで１行動。直線・対角線だけ走れます。走れるマスも同じ色です。選択した直後の吹き出しで「移動」「走る」を確認できます。迎撃も帰り道のマスを選んで技を決めます。</p>
      <p>CPUは攻防開始時に予約します。あなたの未公開の移動や行動、これから出るダイスは見ません。</p>
      <p>同時公開・攻撃移動１マス。通常技１ダメージ、ダウンは復帰準備１回。カウンターは相手の攻撃を中止し、自分の予約行動を試みます。</p>
      <p>命中の仮設定：打撃90%。投げは通常55%・グロッキー80%・ダウン90%、関節技は45%・65%・85%。ロープ到達と戻りまで１行動。80%で戻り、20%で停止。迎撃が失敗した時だけ相手の反撃を判定します。フォール・関節はロープ隣接ならHP０でも自動ブレイク。</p>
      <p>コーナー激突は無傷・立ち状態で隣接１マスへ移り、次の手はグロッキーで移動・方向転換不可。斜め走行は対角線上からのみ。通常の回転は４方向です。</p>
      <p>高所崩しは場外落下あり、高所落としはリング内へ。落下は必ずダウン。飛び技の空振りは自身に１ダメージ＋ダウン。</p>
      <p>グロッキー中は移動・方向転換不可。今向いている正面への技だけ使えます。ダウン中は復帰準備です。隣接した相手が掴み移動・連れ戻しで運べます。運ばれても復帰準備は進みます。</p>
      <p>通常打撃・投げで体勢を崩した時：ダメージ後の体力が上限の２／３以上ならグロッキー。０より多く２／３未満ならグロッキー30％／ダウン70％。０以下と高所落下は必ずダウン。</p>
      <p>場外関節は初回１ダメージで自動解除、ギブアップなし。場外へ出た次の攻防から個別にカウントし、５攻防で20。帰還を先に解決し、期限で残ればリングアウト。ロープスローによる帰還は両者ともリングイン。</p>
      <p>HP０以下の復帰：内部０/−１/−２/−３で60/50/40/30%、失敗ごとに＋10ポイント。投げ同士は40/40/20で崩し合い。両者ダウンは３回の復帰判定を仮採用しています。</p>
    </details>
    <details className="rules-log native-log"><summary>判定ログ（{game.log.length}件）</summary>
      <button type="button" onClick={saveLog}>試合ログを保存</button>
      <ol>{[...groups].reverse().map(([round,lines])=><li key={round}><strong>{round?`攻防 ${round}`:'試合開始'}</strong>{lines.map((line,i)=><p key={i}>{line}</p>)}</li>)}</ol>
    </details>
    <details className="lab-console"><summary className="lab-console__label">試遊設定</summary><div className="native-row">
      <label>CPU傾向 <select value={style} disabled={busy} onChange={e=>{const value=e.target.value;setStyle(value);cpu.current=R.chooseCPU(game,settings(value)) as Plan;}}><option value="balanced">バランス</option><option value="striker">打撃寄り</option><option value="power">投げ寄り</option><option value="technical">関節技寄り</option></select></label>
      <label>演出速度 <select value={speed} disabled={busy} onChange={e=>setSpeed(e.target.value)}><option value="normal">通常</option><option value="fast">速め</option><option value="instant">即時</option></select></label>
      <label>開始場面 <select value={scenario} disabled={busy} onChange={e=>setScenario(e.target.value)}><option value="normal">通常・HP８</option><option value="late">終盤・双方HP１</option><option value="ground">青がダウン</option><option value="rope">ロープ際・青HP０</option><option value="running">ロープスロー迎撃</option><option value="dive">コーナーの飛び技</option><option value="high">高所崩し・高所落とし</option><option value="corner-run">対角線のコーナー走行</option><option value="rope-side-run">ロープ沿いの走り攻撃</option><option value="corner-throw">コーナースロー</option><option value="groggy">コーナー隣・青グロッキー</option><option value="carry">ロープ際から引きずる</option><option value="return">場外から連れ戻す</option><option value="count">場外カウント16・帰還</option><option value="outside-dive">コーナーから場外へ飛ぶ</option><option value="red-groggy">赤グロッキー</option><option value="outside">場外の打撃・投げ</option></select></label>
      <button type="button" disabled={busy} onClick={()=>reset(scenario)}>この場面から</button><button type="button" disabled={busy} onClick={()=>reset()}>試合を初期化</button><button type="button" disabled={busy} onClick={()=>{const next=rotation===0?2:0;setRotation(next);setGame(s=>({...s,view:next}));}}>リングを反対側から見る</button><button type="button" disabled={busy} onClick={()=>setManual(true)}>前版の手動確認を開く</button>
    </div>
      <label className="native-sprite-preview">キャラ８方向の表示確認 <select value={spritePreview||'match'} disabled={busy} onChange={e=>setSpritePreview(e.target.value==='match'?null:e.target.value as CharacterFacing)}><option value="match">試合の向きに戻す</option><option value="right-front">右手前（既存）</option><option value="front">正面（追加）</option><option value="left-front">左手前（既存）</option><option value="profile-left">左横（追加）</option><option value="left-back">左奥（既存）</option><option value="back">背面（追加）</option><option value="right-back">右奥（既存）</option><option value="profile-right">右横（追加）</option></select><small>立ち姿の表示だけを切り替えます。選択した行動・向きは変わりません。</small></label>
    </details>
    {game.winner&&<div className="match-result" role="dialog" aria-modal="true" aria-label="試合結果"><div><p>{game.finish} ／ {game.round-1}攻防</p><h2>{game.winner==='draw'?'DRAW':game.winner==='red'?'RED WIN':'BLUE WIN'}</h2><button type="button" onClick={saveLog}>試合ログを保存</button><button type="button" onClick={()=>reset()}>もう一度試合する</button></div></div>}
  </main>;
}
