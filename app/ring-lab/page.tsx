'use client';

import { useEffect, useRef, useState } from 'react';
import { RingTrial as R } from '../../lib/simultaneous-rules';
import { RingBoard, type BoardLocation, type BoardRotation, type RingSide, type WrestlerState } from './ring-board';
import './ring-lab.css';

type Id = 'red' | 'blue';
type Direction = 'up' | 'right' | 'down' | 'left';
type Move = 'strike' | 'throw' | 'submission' | 'pin' | 'rope' | 'run' | 'move' | 'rest' | 'hold' | 'escape' | 'release' | 'dive';
type Cell = { r:number; c:number; area?:BoardLocation['area'] };
type Fighter = Cell & { face:Direction; hp:number; down:boolean; pose?:'prone'|'supine'; recoveryFails:number; run:{kind:string;origin:Cell;rope:Cell}|null; ropeAnchor:Cell|null };
type Match = { round:number; fighters:Record<Id,Fighter>; hold:{attacker:Id;defender:Id;count:number;dr:number;dc:number;posture:string}|null; doubleCount:number|null; winner:Id|'draw'|null; finish:string; history:{red:string;blue:string;distance:number}[]; log:{round:number;text:string}[] };
type Plan = { move:Move; to:Cell; face:Direction; range:number; ropeDir:Direction; runDir:Direction };
type Frame = { state:Match; message:string;kind:string;ms:number };
const ISO:Record<Direction,RingSide> = {up:'right-back',right:'right-front',down:'left-front',left:'left-back'};
const DIRECTIONS:{key:Direction;label:string}[] = [{key:'up',label:'右奥'},{key:'right',label:'右手前'},{key:'down',label:'左手前'},{key:'left',label:'左奥'}];
const OPPOSITE_ISO:Record<RingSide,Direction> = {'right-back':'up','right-front':'right','left-front':'down','left-back':'left'};
const settings = (style:string) => ({...R.DEFAULTS,cpuStyle:style});
const initial = () => R.initial() as Match;
const defaultPlan = (s:Match) => R.defaultPlan(s,'red') as Plan;
const boardLocation = (p:Cell):BoardLocation => ({area:R.area(p),row:p.r,column:p.c}) as BoardLocation;

export default function RingLabPage() {
  const [game,setGame] = useState<Match>(initial);
  const [shown,setShown] = useState<Match>(game);
  const [plan,setPlan] = useState<Plan>(()=>defaultPlan(game));
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('緑のマスで移動予約 → 技を選んで公開');
  const [revealed,setRevealed] = useState<{red:Plan;blue:Plan}|null>(null);
  const [rotation,setRotation] = useState<BoardRotation>(0);
  const [style,setStyle] = useState('balanced');
  const [speed,setSpeed] = useState('fast');
  const [event,setEvent] = useState('idle');
  const [scenario,setScenario] = useState('normal');
  const [directionPicker,setDirectionPicker] = useState<{kind:'rope'|'run';previous:Plan}|null>(null);
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
    if(shown.hold)return shown.hold.attacker===id?`関節技 ${shown.hold.count}/3回`:'関節技を受けている';
    if(f.down)return shown.doubleCount!==null?`ダウンカウント ${shown.doubleCount}/3`:f.hp<=0?'ダウン / 復帰判定':'ダウン / 復帰準備１回';
    return f.run?`${R.coordinate(f.run.origin)}へ戻る進路が固定`:'立ち状態';
  };
  const reachable = (location:BoardLocation) => !busy && !directionPicker && plan.move!=='run' && !game.winner
    && R.canSelectCell(game,'red',{r:location.row,c:location.column,area:location.area});
  const select = (location:BoardLocation) => {
    if(!reachable(location))return;
    const to={r:location.row,c:location.column,area:location.area};
    setPlan(p=>({...p,to,face:R.facingToward(to,game.fighters.blue) as Direction}));
    setMessage('移動予約済み。回転アイコンで向きを調整できます。');
  };
  const updatePlan = (change:Partial<Plan>) => {if(!busy)setPlan(p=>({...p,...change}));};
  const chooseAction = (move:Move) => {
    if(busy)return;
    if(move==='rope'||move==='run')setDirectionPicker({kind:move,previous:plan});
    updatePlan({move});
  };
  const chooseDirection = (key:string) => {
    if(!directionPicker||busy)return;
    const direction=key as Direction;
    updatePlan(directionPicker.kind==='rope'?{ropeDir:direction}:{runDir:direction});
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
    for(const frame of result.frames as Frame[]){
      if(playback.current!==run)return;
      setShown(frame.state);setMessage(frame.message);setEvent(frame.kind);
      if(factor)await new Promise(resolve=>window.setTimeout(resolve,frame.ms*factor));
    }
    if(playback.current!==run)return;
    const next=result.state as Match;
    cpu.current=next.winner?null:R.chooseCPU(next,settings(style)) as Plan;
    initializedRound.current=next.round;
    setGame(next);setShown(next);setPlan(defaultPlan(next));setRevealed(null);setEvent('idle');setBusy(false);committed.current=false;
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
    if(scene==='outside'){Object.assign(next.fighters.red,{r:7,c:2,area:'ringside',face:'right'});Object.assign(next.fighters.blue,{r:7,c:3,area:'ringside',face:'left'});}
    cpu.current=R.chooseCPU(next,settings(style)) as Plan;initializedRound.current=next.round;
    setGame(next);setShown(next);setPlan(defaultPlan(next));setDirectionPicker(null);setRevealed(null);setEvent('idle');setMessage('緑のマスで移動予約 → 技を選んで公開');
  };
  const saveLog=()=>{
    const blob=new Blob([JSON.stringify({version:'simultaneous-native-20261002',game,plan},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ring-match-log.json';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const runPath = game.fighters.red.run ? R.path(game.fighters.red,game.fighters.red.run.origin,null,16)||[] : [];
  const groups = new Map<number,string[]>();for(const line of game.log){if(!groups.has(line.round))groups.set(line.round,[]);groups.get(line.round)!.push(line.text);}
  const f=game.fighters.red;
  const directionTargets = directionPicker ? DIRECTIONS.flatMap(d=>{
    if(directionPicker.kind==='run'){
      const intent=R.runIntent(game,'red',d.key);
      return intent?[{key:d.key,label:`ロープへ走る：${d.label}方向`,location:boardLocation(intent.rebound?intent.origin:intent.goal)}]:[];
    }
    const target=game.fighters.blue;
    if(R.area(target)!=='ring')return [];
    const destination={r:d.key==='up'?0:d.key==='down'?6:target.r,c:d.key==='left'?0:d.key==='right'?6:target.c};
    const route=R.path(target,destination,normalized.to,R.distance(target,destination));
    // The destination must be a straight rope route; hit eligibility is judged only after simultaneous movement.
    return R.inside(destination)&&route?.length===R.distance(target,destination)&&route.length>0?[{key:d.key,label:`ロープスロー：${d.label}方向`,location:boardLocation(destination)}]:[];
  }):[];
  const hint=game.doubleCount!==null?'両者ダウンのカウント中です。復帰準備を公開すると双方の起き上がりを判定します。':game.hold?'関節技の維持・解除と脱出を同じ攻防で解決します。':f.run?'戻る進路は固定です。途中で当てる攻撃を選べます。':f.down?'この手は復帰準備。１マスまで這って移動できます。攻撃は立った次の手から。':'攻撃と同じ手は１マス移動、移動のみは２マス。選択した移動は公開後に行います。';

  return <main className="ring-lab simultaneous-native" data-rule-version="simultaneous-native-20261002">
    <header className="ring-lab-titlebar"><div><p>WRESTLING TACTICS / RING LAB</p><h1>RING MATCH</h1></div><strong>攻防 {game.round}</strong></header>
    {(['blue','red'] as Id[]).map(id=><section key={id} className={`fighter-hud fighter-hud--${id==='red'?'player':'cpu'}`} aria-label={`${id==='red'?'赤':'青'}コーナー選手情報`}>
      <div className="fighter-hud__portrait" aria-hidden="true">{id==='red'?'R':'B'}</div><div className="fighter-hud__body"><div className="fighter-hud__heading"><b>{id==='red'?'RED':'BLUE'} CORNER</b><span>{id==='red'?'PLAYER':'CPU・予約済み'}</span></div><strong>{id==='red'?'RED':'BLUE'} WRESTLER</strong><div className="fighter-hud__meter"><i style={{width:`${Math.max(0,shown.fighters[id].hp)/8*100}%`}} /></div><small>体力 <b>{Math.max(0,shown.fighters[id].hp)} / 8</b>　{status(id)}</small></div>
    </section>)}
    <RingBoard wrestlers={fighters} poses={poses} rotation={rotation} reachable={reachable} onSelect={select}
      reserved={busy||game.hold?null:boardLocation(directionPicker?.kind==='run'?f:normalized.to)} reservedFacing={ISO[normalized.face]} onTurn={!busy&&!directionPicker&&!f.down&&!f.run&&!game.hold&&!game.winner&&plan.move!=='run'?(facing)=>updatePlan({face:OPPOSITE_ISO[facing]}):null} directionTargets={busy?[]:directionTargets} onDirection={chooseDirection} runPath={runPath.map((p:Cell)=>({row:p.r,column:p.c}))}
      combatResult={event==='miss'?{outcome:'miss',actor:'red',subject:'red',run:game.round}:null} ropeAnimation={{run:shown.round,edge:event==='rope'?'right':null}} />
    <section className="match-message" role="status" aria-live="polite"><b>{busy?'同時攻防を解決中':directionPicker?'方向を選択':'行動を予約'}</b><span>{directionPicker?'盤面の色が付いたマスを選択してください。':message}</span></section>
    <section className="game-action-controls native-controls" aria-label="プレイヤーの行動">
      <div className="native-full native-plan">{revealed?`赤 ${R.NAMES[revealed.red.move]} ／ 青 ${R.NAMES[revealed.blue.move]}`:<><strong>{R.NAMES[plan.move]}</strong><span>{R.coordinate(normalized.to)} ・ {DIRECTIONS.find(d=>d.key===normalized.face)?.label}</span><small>CPU：予約済み</small></>}</div>
      {directionPicker?<><strong>盤面の色が付いたマスを選択</strong><button type="button" className="is-subtle native-full" onClick={cancelDirection}>戻る</button>{!directionTargets.length&&<p className="native-full native-note">今の位置から選べる方向がありません。戻って移動・行動を選び直してください。</p>}</>:(R.actions(game,'red') as Move[]).map(move=><button type="button" key={move} className={plan.move===move?'is-active':undefined} disabled={busy} onClick={()=>chooseAction(move)}>{R.NAMES[move]}</button>)}
      {plan.move==='strike'&&<div className="native-full native-row"><b>打撃の距離</b>{[1,2].map(range=><button type="button" key={range} disabled={busy} className={plan.range===range?'is-active':undefined} onClick={()=>updatePlan({range})}>{range}マス狙い</button>)}</div>}
      {!directionPicker&&(plan.move==='rope'||plan.move==='run')&&<p className="native-full native-note">{plan.move==='rope'?'投げる':'走る'}方向：{DIRECTIONS.find(d=>d.key===(plan.move==='rope'?plan.ropeDir:plan.runDir))?.label}　<button type="button" disabled={busy} onClick={()=>chooseAction(plan.move)}>方向を選び直す</button></p>}
      {!directionPicker&&error&&<p className="native-full native-error" role="alert">{error}</p>}
      {!directionPicker&&<button type="button" className="native-full native-publish" disabled={busy||!!error||!!game.winner} onClick={publish}>{busy?'攻防を解決中…':'せーので行動公開'}</button>}
      {(f.down||f.run||game.hold||game.doubleCount!==null)&&<p className="native-full native-note">{hint}</p>}
    </section>
    <details className="rules-log native-help"><summary>操作・ルール</summary>
      <p>{hint}</p><p>移動を予約したら、盤面の回転アイコンで向きを調整し、行動を選んで同時公開します。薄い赤の選手は移動先の予約です。</p>
      <p>CPUは攻防開始時に予約します。あなたの未公開の移動や行動、これから出るダイスは見ません。</p>
      <p>同時公開・攻撃移動１マス。通常技１ダメージ、ダウンは復帰準備１回。カウンターは相手の攻撃を中止し、自分の予約行動を試みます。</p>
      <p>命中：打撃・投げ90%、立ち関節70%、ダウン関節80%。ロープ到達80%で戻り、20%で留まります。フォール・関節はロープ隣接ならHP０でも自動ブレイク。</p>
      <p>HP０以下の復帰：内部０/−１/−２/−３で60/50/40/30%、失敗ごとに＋10ポイント。投げ同士は40/40/20で崩し合い。両者ダウンは３回の復帰判定を仮採用しています。</p>
    </details>
    <details className="rules-log native-log"><summary>判定ログ（{game.log.length}件）</summary>
      <button type="button" onClick={saveLog}>試合ログを保存</button>
      <ol>{[...groups].reverse().map(([round,lines])=><li key={round}><strong>{round?`攻防 ${round}`:'試合開始'}</strong>{lines.map((line,i)=><p key={i}>{line}</p>)}</li>)}</ol>
    </details>
    <details className="lab-console"><summary className="lab-console__label">試遊設定</summary><div className="native-row">
      <label>CPU傾向 <select value={style} disabled={busy} onChange={e=>{const value=e.target.value;setStyle(value);cpu.current=R.chooseCPU(game,settings(value)) as Plan;}}><option value="balanced">バランス</option><option value="striker">打撃寄り</option><option value="power">投げ寄り</option><option value="technical">関節技寄り</option></select></label>
      <label>演出速度 <select value={speed} disabled={busy} onChange={e=>setSpeed(e.target.value)}><option value="normal">通常</option><option value="fast">速め</option><option value="instant">即時</option></select></label>
      <label>開始場面 <select value={scenario} disabled={busy} onChange={e=>setScenario(e.target.value)}><option value="normal">通常・HP８</option><option value="late">終盤・双方HP１</option><option value="ground">青がダウン</option><option value="rope">ロープ際・青HP０</option><option value="running">青がロープから戻る</option><option value="dive">コーナーの飛び技</option><option value="outside">場外の打撃・投げ</option></select></label>
      <button type="button" disabled={busy} onClick={()=>reset(scenario)}>この場面から</button><button type="button" disabled={busy} onClick={()=>reset()}>試合を初期化</button><button type="button" disabled={busy} onClick={()=>setRotation(r=>r===0?2:0)}>リングを反対側から見る</button>
    </div></details>
    {game.winner&&<div className="match-result" role="dialog" aria-modal="true" aria-label="試合結果"><div><p>{game.finish} ／ {game.round-1}攻防</p><h2>{game.winner==='draw'?'DRAW':game.winner==='red'?'RED WIN':'BLUE WIN'}</h2><button type="button" onClick={saveLog}>試合ログを保存</button><button type="button" onClick={()=>reset()}>もう一度試合する</button></div></div>}
  </main>;
}
