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
type Fighter = Cell & { face:Direction; hp:number; maxHp?:number; outsideTurns?:number; down:boolean; skip?:boolean; groggy?:boolean; travelFacing?:TravelDirection; pose?:'prone'|'supine'; recoveryFails:number; run:{kind:string;origin:Cell;rope:Cell}|null; ropeAnchor:Cell|null };
type Match = { view?:BoardRotation;round:number; fighters:Record<Id,Fighter>; hold:{attacker:Id;defender:Id;count:number;dr:number;dc:number;posture:string}|null; doubleCount:number|null; winner:Id|'draw'|null; finish:string; history:{red:string;blue:string;distance:number}[]; log:{round:number;text:string}[] };
type Plan = { move:Move; to:Cell; face:Direction; range:number; ropeDir:TravelDirection; runDir:TravelDirection; carryDir:Direction; returnDir:Direction };
type Cue={outcome:'hit'|'miss';actor:Id;subject:Id;run:number};
type Frame = { state:Match; message:string;kind:string;ms:number;roll?:number|null;ropeEdge?:'top'|'right'|'bottom'|'left'|null;cues?:Cue[];damages?:Partial<PortraitHp> };
const ISO:Record<Direction,RingSide> = {up:'right-back',right:'right-front',down:'left-front',left:'left-back'};
const DIRECTIONS:{key:Direction;label:string}[] = [{key:'up',label:'右奥'},{key:'right',label:'右手前'},{key:'down',label:'左手前'},{key:'left',label:'左奥'}];
const TRAVEL_DIRECTIONS:{key:TravelDirection;label:string}[]=[...DIRECTIONS,{key:'up-left',label:'奥のコーナー'},{key:'up-right',label:'右のコーナー'},{key:'down-right',label:'手前のコーナー'},{key:'down-left',label:'左のコーナー'}];
const TRAVEL_SPRITES:Partial<Record<TravelDirection,CharacterFacing>>={'up-left':'back','up-right':'profile-right','down-right':'front','down-left':'profile-left'};
const OPPOSITE_ISO:Record<RingSide,Direction> = {'right-back':'up','right-front':'right','left-front':'down','left-back':'left'};
const settings = (style:string) => ({...R.DEFAULTS,cpuStyle:style});
const initial = () => R.initial() as Match;
const defaultPlan = (s:Match) => R.defaultPlan(s,'red') as Plan;
const boardLocation = (p:Cell):BoardLocation => ({area:R.area(p),row:p.r,column:p.c}) as BoardLocation;

export default function RingLabPage() {
  const [game,setGame] = useState<Match>(initial);
  const [shown,setShown] = useState<Match>(game);
  const [plan,setPlan] = useState<Plan>(()=>defaultPlan(game));
  const [spritePreview,setSpritePreview] = useState<CharacterFacing|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('緑のマスで移動予約 → 技を選んで公開');
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
  const error = game.winner ? '' : R.validate(game,'red',plan,settings(style));
  const fighters = Object.fromEntries((['red','blue'] as Id[]).map(id=>[id,{location:boardLocation(shown.fighters[id]),facing:ISO[id==='red'&&!busy?normalized.face:shown.fighters[id].face],stance:shown.fighters[id].down?'down':'standing'}])) as Record<Id,WrestlerState>;
  const poses:Record<Id,'prone'|'supine'> = {red:shown.fighters.red.pose||'prone',blue:shown.fighters.blue.pose||'prone'};
  const status = (id:Id) => {
    const f=shown.fighters[id];
    if(f.groggy)return 'グロッキー / 体勢を立て直す１回';
    if(f.skip)return '場外落下 / 次の手は行動不能';
    if(shown.hold)return shown.hold.attacker===id?`関節技 ${shown.hold.count}/3回`:'関節技を受けている';
    if(f.down)return shown.doubleCount!==null?`ダウンカウント ${shown.doubleCount}/3`:f.hp<=0?'ダウン / 復帰判定':'ダウン / 復帰準備１回';
    return f.run?`${R.coordinate(f.run.origin)}へ戻る進路が固定`:'立ち状態';
  };
  const hasDamageFace = (id:Id) => damageFaces.includes(id) || shown.fighters[id].down || !!shown.fighters[id].groggy;
  const reachable = (location:BoardLocation) => !busy && !directionPicker && !['run','carry','return'].includes(plan.move) && !game.winner
    && R.canSelectCell(game,'red',{r:location.row,c:location.column,area:location.area});
  const select = (location:BoardLocation) => {
    if(!reachable(location))return;
    const to={r:location.row,c:location.column,area:location.area};
    setPlan(p=>({...p,to}));
    setMessage('移動予約済み。回転アイコンで向きを調整できます。');
  };
  const updatePlan = (change:Partial<Plan>) => {if(!busy)setPlan(p=>({...p,...change}));};
  const chooseAction = (move:Move) => {
    if(busy)return;
    if(['rope','run','carry','return'].includes(move))setDirectionPicker({kind:move as 'rope'|'run'|'carry'|'return',previous:plan});
    updatePlan({move});
  };
  const chooseDirection = (key:string) => {
    if(!directionPicker||busy)return;
    const direction=key as TravelDirection;
    updatePlan(directionPicker.kind==='rope'?{ropeDir:direction}:directionPicker.kind==='run'?{runDir:direction}:directionPicker.kind==='carry'?{carryDir:direction as Direction}:{returnDir:direction as Direction});
    setDirectionPicker(null);setMessage('方向を予約しました。行動公開で攻防を判定します。');
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
      if(factor)await new Promise(resolve=>window.setTimeout(resolve,frame.ms*factor));
    }
    if(playback.current!==run)return;
    const next=result.state as Match;
    cpu.current=next.winner?null:R.chooseCPU(next,settings(style)) as Plan;
    initializedRound.current=next.round;
    setSpritePreview(null);setGame(next);setShown(next);setPlan(defaultPlan(next));setRevealed(null);setEvent('idle');setCues([]);setRopeEdge(null);setBusy(false);committed.current=false;
    setDamageFaces([]);setDisplayedHp({red:next.fighters.red.hp,blue:next.fighters.blue.hp});
    setMessage(next.winner?next.finish:'次の攻防。移動・行動を予約してください。');
  };
  const reset = (scene='normal') => {
    if(busy)return;
    playback.current++;
    const next=initial();
    if(scene==='late'){next.fighters.blue.c=3;next.fighters.red.hp=1;next.fighters.blue.hp=1;}
    if(scene==='ground'){next.fighters.blue.c=3;next.fighters.blue.hp=3;next.fighters.blue.down=true;next.fighters.blue.pose='supine';}
    if(scene==='rope'){Object.assign(next.fighters.red,{r:3,c:1,face:'left'});Object.assign(next.fighters.blue,{r:3,c:0,hp:0,down:true,face:'right',pose:'supine'});}
    if(scene==='running'){next.fighters.blue.c=6;next.fighters.blue.run={kind:'thrown',origin:{r:3,c:3},rope:{r:3,c:6}};}
    if(scene==='dive'){Object.assign(next.fighters.red,{r:6,c:0,area:'corner',face:'right'});Object.assign(next.fighters.blue,{r:5,c:1,face:'left'});}
    if(scene==='corner-run'){Object.assign(next.fighters.red,{r:3,c:3,face:'left'});Object.assign(next.fighters.blue,{r:3,c:5});}
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
    setSpritePreview(null);setGame(next);setShown(next);setPlan(defaultPlan(next));setDirectionPicker(null);setRevealed(null);setEvent('idle');setRotation(0);setLastRoll(null);setCues([]);setRopeEdge(null);setMessage('緑のマスで移動予約 → 技を選んで公開');
  };
  const saveLog=()=>{
    const blob=new Blob([JSON.stringify({version:'simultaneous-native-20261003-outside',game,plan},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ring-match-log.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const runPath = game.fighters.red.run ? R.path(game.fighters.red,game.fighters.red.run.origin,null,16)||[] : [];
  const groups = new Map<number,string[]>();for(const line of game.log){if(!groups.has(line.round))groups.set(line.round,[]);groups.get(line.round)!.push(line.text);}
  const f=game.fighters.red;
  const actionPreview={...game,fighters:{...game.fighters,red:{...f,...normalized.to,face:normalized.face}}};
  const availableActions=[...new Set([...R.actions(actionPreview,'red').filter(move=>!['carry','return'].includes(move)),...R.actions(game,'red').filter(move=>['carry','return'].includes(move))])] as Move[];
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
  }):[];
  const hint=game.doubleCount!==null?'両者ダウンのカウント中です。復帰準備を公開すると双方の起き上がりを判定します。':game.hold?'関節技の維持・解除と脱出を同じ攻防で解決します。':f.run?'戻る進路は固定です。途中で当てる攻撃を選べます。':f.skip?'場外への落下後は、この手を休んでから次の行動へ進みます。':f.groggy?'この手は立ったまま体勢を立て直します。移動・攻撃は次の手から。':f.down?'この手は復帰準備。自分では移動できません。攻撃は立った次の手から。':'攻撃と同じ手は１マス移動、移動のみは２マス。選択した移動は公開後に行います。';

  if(manual)return <><div className="fixed-manual-banner"><b>前版の表示・位置・技を手動確認するモード</b><button type="button" onClick={()=>setManual(false)}>同時攻防の試合に戻る</button></div><FixedManualTest/></>;
  const visibleRopeEdge=rotation===2?({top:'bottom',right:'left',bottom:'top',left:'right'} as const)[ropeEdge||'top']:ropeEdge;
  return <main className="ring-lab simultaneous-native" data-rule-version="simultaneous-native-20261003-outside">
    <header className="ring-lab-titlebar"><div><p>WRESTLING TACTICS / RING LAB</p><h1>RING MATCH</h1></div><strong>攻防 {game.round}</strong></header>
    {(['blue','red'] as Id[]).map(id=><section key={id} className={`fighter-hud fighter-hud--${id==='red'?'player':'cpu'}`} data-expression={hasDamageFace(id)?'damage':'normal'} data-impact={damageFaces.includes(id)?'true':'false'} style={damageFaces.includes(id)?{animationDuration:`${PORTRAIT_TIMING.feedback*(speed==='fast'?.38:1)}ms`}:undefined} aria-label={`${id==='red'?'赤':'青'}コーナー選手情報`}>
      {damageFaces.includes(id)&&<span key={portraitImpact} className="fighter-hud__impact" aria-hidden="true" style={{animationDuration:`${PORTRAIT_TIMING.feedback*(speed==='fast'?.38:1)}ms`}}/>}
      <div className="fighter-hud__portrait"><img src={portraitSource(portraitBase,id==='red'?'red-protagonist':opponentPortrait,hasDamageFace(id))} alt={`${id==='red'?'主人公':'対戦相手'}・${hasDamageFace(id)?'ダメージ':'通常'}表情`} draggable={false}/></div><div className="fighter-hud__body"><div className="fighter-hud__heading"><b>{id==='red'?'RED':'BLUE'} CORNER</b><span>{id==='red'?'PLAYER':'CPU・予約済み'}</span></div><strong>{id==='red'?'RED':'BLUE'} WRESTLER</strong><div className="fighter-hud__meter"><i style={{width:`${Math.max(0,displayedHp[id])/R.maxHp(shown.fighters[id])*100}%`,transition:busy?'none':undefined}} /></div><small>体力 <b>{Math.max(0,Math.round(displayedHp[id]))} / {R.maxHp(shown.fighters[id])}</b>　{status(id)}{R.area(shown.fighters[id])==='ringside'?` ／ 場外 ${(shown.fighters[id].outsideTurns||0)*4}/20`:''}</small></div>
    </section>)}
    <RingBoard groggies={{red:shown.fighters.red.groggy,blue:shown.fighters.blue.groggy}} spritePreview={busy?null:spritePreview} runningFacing={{red:busy?TRAVEL_SPRITES[shown.fighters.red.travelFacing!]:undefined,blue:busy?TRAVEL_SPRITES[shown.fighters.blue.travelFacing!]:undefined}} wrestlers={fighters} poses={poses} rotation={rotation} reachable={reachable} onSelect={select}
      reserved={busy||game.hold?null:boardLocation(directionPicker?.kind==='run'?f:normalized.to)} reservedFacing={ISO[normalized.face]} onTurn={!busy&&!directionPicker&&!f.down&&!f.skip&&!f.groggy&&!f.run&&!game.hold&&!game.winner&&plan.move!=='run'?(facing)=>updatePlan({face:OPPOSITE_ISO[facing]}):null} directionTargets={busy?[]:directionTargets} onDirection={chooseDirection} runPath={runPath.map((p:Cell)=>({row:p.r,column:p.c}))}
      combatResult={null} combatResults={cues} cpuAttack={event==='reveal'&&!!revealed&&['strike','throw','submission','rope','dive','pull-down','knock-down'].includes(revealed.blue.move)} ropeAnimation={{run:cueRun,edge:ropeEdge?visibleRopeEdge||null:null}} />
    <section className="match-message" role="status" aria-live="polite"><b>{busy?'同時攻防を解決中':directionPicker?'方向を選択':'行動を予約'}</b><span>{directionPicker?'盤面の色が付いたマスを選択してください。':message}</span>{lastRoll!==null&&<em>D100 {lastRoll}</em>}</section>
    <section className="game-action-controls native-controls" aria-label="プレイヤーの行動">
      <div className="native-full native-plan">{revealed?`赤 ${R.NAMES[revealed.red.move]} ／ 青 ${R.NAMES[revealed.blue.move]}`:<><strong>{R.NAMES[plan.move]}</strong><span>{R.coordinate(normalized.to)} ・ {DIRECTIONS.find(d=>d.key===normalized.face)?.label}</span><small>CPU：予約済み</small></>}</div>
      {directionPicker?<><strong>盤面の色が付いたマスを選択</strong><button type="button" className="is-subtle native-full" onClick={cancelDirection}>戻る</button>{!directionTargets.length&&<p className="native-full native-note">今の位置から選べる方向がありません。戻って移動・行動を選び直してください。</p>}</>:availableActions.map(move=><button type="button" key={move} className={plan.move===move?'is-active':undefined} disabled={busy} onClick={()=>chooseAction(move)}>{move==='rest'&&f.groggy?'体勢を立て直す':R.highAttack({...f,...normalized.to},game.fighters.blue,{...normalized,move})?(move==='throw'?'投げ（高所落とし）':'打撃（高所崩し）'):R.NAMES[move]}</button>)}
      {plan.move==='strike'&&<div className="native-full native-row"><b>打撃の距離</b>{[1,2].map(range=><button type="button" key={range} disabled={busy} className={plan.range===range?'is-active':undefined} onClick={()=>updatePlan({range})}>{range}マス狙い</button>)}</div>}
      {!directionPicker&&(['rope','run','carry','return'].includes(plan.move))&&<p className="native-full native-note">{plan.move==='return'?'相手の帰還位置':plan.move==='carry'?'運ぶ方向':plan.move==='rope'?'投げる方向':'走る方向'}：{TRAVEL_DIRECTIONS.find(d=>d.key===(plan.move==='rope'?plan.ropeDir:plan.move==='run'?plan.runDir:plan.move==='carry'?plan.carryDir:plan.returnDir))?.label}　<button type="button" disabled={busy} onClick={()=>chooseAction(plan.move)}>方向を選び直す</button></p>}
      {!directionPicker&&error&&<p className="native-full native-error" role="alert">{error}</p>}
      {!directionPicker&&<button type="button" className="native-full native-publish" disabled={busy||!!error||!!game.winner} onClick={publish}>{busy?'攻防を解決中…':'せーので行動公開'}</button>}
      {(f.down||f.groggy||f.run||game.hold||game.doubleCount!==null)&&<p className="native-full native-note">{hint}</p>}
    </section>
    <details className="rules-log native-help"><summary>操作・ルール</summary>
      <p>{hint}</p><p>移動を予約したら、盤面の回転アイコンで向きを調整し、行動を選んで同時公開します。薄い赤の選手は移動先の予約です。</p>
      <p>CPUは攻防開始時に予約します。あなたの未公開の移動や行動、これから出るダイスは見ません。</p>
      <p>同時公開・攻撃移動１マス。通常技１ダメージ、ダウンは復帰準備１回。カウンターは相手の攻撃を中止し、自分の予約行動を試みます。</p>
      <p>命中：打撃・投げ90%、立ち関節70%、ダウン関節80%。ロープ到達80%で戻り、20%で留まります。フォール・関節はロープ隣接ならHP０でも自動ブレイク。</p>
      <p>コーナー激突は無傷・立ち状態で隣接１マスへ移り、次の手はグロッキーで１回休み。斜め走行は対角線上からのみ。通常の回転は４方向です。</p>
      <p>高所崩しは場外落下あり、高所落としはリング内へ。落下は必ずダウン。飛び技の空振りは自身に１ダメージ＋ダウン。</p>
      <p>ダウン・グロッキー中は自分では移動できません。隣接した相手が掴み移動・連れ戻しで運べます。運ばれても復帰準備は進みます。</p>
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
      <label>開始場面 <select value={scenario} disabled={busy} onChange={e=>setScenario(e.target.value)}><option value="normal">通常・HP８</option><option value="late">終盤・双方HP１</option><option value="ground">青がダウン</option><option value="rope">ロープ際・青HP０</option><option value="running">青がロープから戻る</option><option value="dive">コーナーの飛び技</option><option value="high">高所崩し・高所落とし</option><option value="corner-run">対角線のコーナー走行</option><option value="corner-throw">コーナースロー</option><option value="groggy">コーナー隣・青グロッキー</option><option value="carry">ロープ際から引きずる</option><option value="return">場外から連れ戻す</option><option value="count">場外カウント16・帰還</option><option value="outside-dive">コーナーから場外へ飛ぶ</option><option value="red-groggy">赤グロッキー</option><option value="outside">場外の打撃・投げ</option></select></label>
      <button type="button" disabled={busy} onClick={()=>reset(scenario)}>この場面から</button><button type="button" disabled={busy} onClick={()=>reset()}>試合を初期化</button><button type="button" disabled={busy} onClick={()=>{const next=rotation===0?2:0;setRotation(next);setGame(s=>({...s,view:next}));}}>リングを反対側から見る</button><button type="button" disabled={busy} onClick={()=>setManual(true)}>前版の手動確認を開く</button>
    </div>
      <label className="native-sprite-preview">キャラ８方向の表示確認 <select value={spritePreview||'match'} disabled={busy} onChange={e=>setSpritePreview(e.target.value==='match'?null:e.target.value as CharacterFacing)}><option value="match">試合の向きに戻す</option><option value="right-front">右手前（既存）</option><option value="front">正面（追加）</option><option value="left-front">左手前（既存）</option><option value="profile-left">左横（追加）</option><option value="left-back">左奥（既存）</option><option value="back">背面（追加）</option><option value="right-back">右奥（既存）</option><option value="profile-right">右横（追加）</option></select><small>立ち姿の表示だけを切り替えます。選択した行動・向きは変わりません。</small></label>
    </details>
    {game.winner&&<div className="match-result" role="dialog" aria-modal="true" aria-label="試合結果"><div><p>{game.finish} ／ {game.round-1}攻防</p><h2>{game.winner==='draw'?'DRAW':game.winner==='red'?'RED WIN':'BLUE WIN'}</h2><button type="button" onClick={saveLog}>試合ログを保存</button><button type="button" onClick={()=>reset()}>もう一度試合する</button></div></div>}
  </main>;
}
