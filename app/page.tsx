'use client';

import { useEffect, useMemo, useState } from 'react';

type Pos = { r: number; c: number };
type Facing = 'N' | 'E' | 'S' | 'W';
type IntentKind = 'advance' | 'strike' | 'rebound';
type Intent = { kind: IntentKind; path: Pos[]; attack?: Pos; facing: Facing };

const SIZE = 7;
const DIRS: Record<Facing, Pos> = { N: { r: -1, c: 0 }, E: { r: 0, c: 1 }, S: { r: 1, c: 0 }, W: { r: 0, c: -1 } };
const FACE_LABEL: Record<Facing, string> = { N: '↖', E: '↗', S: '↘', W: '↙' };
const FACE_NAME: Record<Facing, string> = { N: '奥', E: '右', S: '手前', W: '左' };

function same(a: Pos, b: Pos) { return a.r === b.r && a.c === b.c; }
function inside(p: Pos) { return p.r >= 0 && p.r < SIZE && p.c >= 0 && p.c < SIZE; }
function front(pos: Pos, facing: Facing): Pos { return { r: pos.r + DIRS[facing].r, c: pos.c + DIRS[facing].c }; }
function projected(p: Pos): React.CSSProperties {
  return { left: `${50 + ((p.c - p.r - 1) * 100) / 14}%`, top: `${((p.r + p.c) * 100) / 14}%` };
}
function faceToward(from: Pos, to: Pos): Facing {
  const dr = to.r - from.r, dc = to.c - from.c;
  if (Math.abs(dc) > Math.abs(dr)) return dc > 0 ? 'E' : 'W';
  return dr > 0 ? 'S' : 'N';
}

function shortestPath(start: Pos, goal: Pos, blocked: Pos, max = 99): Pos[] {
  const queue: { p: Pos; path: Pos[] }[] = [{ p: start, path: [] }];
  const seen = new Set([`${start.r},${start.c}`]);
  const order: Facing[] = ['N', 'E', 'S', 'W'];
  while (queue.length) {
    const current = queue.shift()!;
    if (same(current.p, goal)) return current.path;
    if (current.path.length >= max) continue;
    for (const d of order) {
      const next = { r: current.p.r + DIRS[d].r, c: current.p.c + DIRS[d].c };
      const key = `${next.r},${next.c}`;
      if (!inside(next) || same(next, blocked) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ p: next, path: [...current.path, next] });
    }
  }
  return [];
}

function makeCpuIntent(cpu: Pos, player: Pos): Intent {
  const distance = Math.abs(cpu.r - player.r) + Math.abs(cpu.c - player.c);
  if (distance === 1) return { kind: 'strike', path: [], attack: player, facing: faceToward(cpu, player) };
  const candidates: Pos[] = (Object.keys(DIRS) as Facing[])
    .map((d) => ({ r: player.r - DIRS[d].r, c: player.c - DIRS[d].c }))
    .filter((p) => inside(p) && !same(p, cpu));
  candidates.sort((a, b) => (Math.abs(cpu.r - a.r) + Math.abs(cpu.c - a.c)) - (Math.abs(cpu.r - b.r) + Math.abs(cpu.c - b.c)));
  const full = candidates.length ? shortestPath(cpu, candidates[0], player) : [];
  const path = full.slice(0, 2), end = path.at(-1) ?? cpu;
  const canStrike = Math.abs(end.r - player.r) + Math.abs(end.c - player.c) === 1;
  return { kind: 'advance', path, attack: canStrike ? player : undefined, facing: canStrike ? faceToward(end, player) : path.length ? faceToward(path.at(-2) ?? cpu, end) : faceToward(cpu, player) };
}

function reboundIntent(cpu: Pos, travel: Facing): Intent {
  const path: Pos[] = [];
  let p = cpu;
  for (let i = 0; i < 3; i += 1) {
    const next = { r: p.r + DIRS[travel].r, c: p.c + DIRS[travel].c };
    if (!inside(next)) break;
    path.push(next); p = next;
  }
  return { kind: 'rebound', path, facing: travel };
}

function roll() { return Math.floor(Math.random() * 6) + 1; }

export default function Home() {
  const [player, setPlayer] = useState<Pos>({ r: 5, c: 2 });
  const [cpu, setCpu] = useState<Pos>({ r: 1, c: 4 });
  const [playerFacing, setPlayerFacing] = useState<Facing>('N');
  const [cpuFacing, setCpuFacing] = useState<Facing>('S');
  const [intent, setIntent] = useState<Intent>(() => makeCpuIntent({ r: 1, c: 4 }, { r: 5, c: 2 }));
  const [moved, setMoved] = useState(false);
  const [hits, setHits] = useState({ player: 0, cpu: 0 });
  const [round, setRound] = useState(1);
  const [whipMode, setWhipMode] = useState(false);
  const [reservedStrike, setReservedStrike] = useState<Pos | null>(null);
  const [message, setMessage] = useState('CPUの予定を見て、移動先を選んでください。');
  const [history, setHistory] = useState<string[]>(['試合開始。先に3回STRIKEを成功させれば勝利。']);
  const [winner, setWinner] = useState<'PLAYER' | 'CPU' | null>(null);

  const reachable = useMemo(() => {
    if (moved || winner) return [];
    const cells: Pos[] = [];
    for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) {
      const p = { r, c };
      if (!same(p, player) && !same(p, cpu) && shortestPath(player, p, cpu, 2).length > 0) cells.push(p);
    }
    return cells;
  }, [player, cpu, moved, winner]);

  const intentName = intent.kind === 'rebound' ? 'REBOUND' : intent.attack ? 'MOVE → STRIKE' : 'MOVE';
  const reboundSet = new Set(intent.kind === 'rebound' ? intent.path.map((p) => `${p.r},${p.c}`) : []);
  const pathSet = new Set(intent.path.map((p) => `${p.r},${p.c}`));
  const attackKey = intent.attack ? `${intent.attack.r},${intent.attack.c}` : '';
  const frontTile = front(player, playerFacing);
  const adjacentFront = same(frontTile, cpu);
  const canReserve = intent.kind === 'rebound' && reboundSet.has(`${frontTile.r},${frontTile.c}`);

  function addLog(line: string) { setHistory((old) => [line, ...old].slice(0, 7)); }

  function movePlayer(destination: Pos) {
    if (moved || winner || !reachable.some((p) => same(p, destination))) return;
    const path = shortestPath(player, destination, cpu, 2), previous = path.at(-2) ?? player;
    setPlayer(destination); setPlayerFacing(faceToward(previous, destination)); setMoved(true); setWhipMode(false);
    setMessage('移動完了。向きを調整してアクションを選んでください。');
  }

  function finishRound(nextPlayer = player, cancelled = false, reserved = reservedStrike, baseHits = hits) {
    if (cancelled) {
      setMoved(false); setWhipMode(false); setReservedStrike(null); setRound((n) => n + 1);
      setMessage('反動ルートが見えています。進路を読んで迎撃を予約できます。');
      return;
    }
    let nextCpu = cpu, nextHits = { ...baseHits }, logLine = '';
    if (intent.kind === 'rebound') {
      let stopped = false;
      for (const step of intent.path) {
        if (reserved && same(step, reserved)) {
          const d = roll(); nextCpu = step;
          if (d >= 4) { nextHits.player += 1; logLine = `迎撃STRIKE成功！ 1D6=${d}`; }
          else logLine = `迎撃STRIKE失敗。1D6=${d}`;
          stopped = true; break;
        }
        if (same(step, nextPlayer)) {
          nextCpu = { r: step.r - DIRS[intent.facing].r, c: step.c - DIRS[intent.facing].c };
          nextHits.cpu += 1; logLine = 'REBOUNDに巻き込まれ、CPUの攻撃成功。'; stopped = true; break;
        }
        nextCpu = step;
      }
      if (!stopped) logLine = 'CPUがロープから反動して走り抜けた。';
    } else {
      nextCpu = intent.path.at(-1) ?? cpu;
      if (intent.attack && same(intent.attack, nextPlayer)) {
        const d = roll();
        if (d >= 4) { nextHits.cpu += 1; logLine = `CPU STRIKE成功。1D6=${d}`; }
        else logLine = `CPU STRIKE失敗。1D6=${d}`;
      } else logLine = intent.attack ? 'PLAYERが攻撃予定地点から逃れた。' : 'CPUが距離を詰めた。';
    }
    setCpu(nextCpu); setCpuFacing(intent.facing); setHits(nextHits); addLog(logLine);
    if (nextHits.player >= 3 || nextHits.cpu >= 3) {
      const result = nextHits.player >= 3 ? 'PLAYER' : 'CPU'; setWinner(result); setMessage(`${result} WIN！`); return;
    }
    setIntent(makeCpuIntent(nextCpu, nextPlayer)); setMoved(false); setWhipMode(false); setReservedStrike(null); setRound((n) => n + 1);
    setMessage('新しいCPU予定が表示されました。');
  }

  function strike() {
    if (winner) return;
    if (canReserve) {
      setReservedStrike(frontTile); setMessage('STRIKEを予約。CPUがそのマスへ入ると迎撃します。'); addLog('PLAYER：REBOUNDへの迎撃STRIKEを予約。');
      setTimeout(() => finishRound(player, false, frontTile), 260); return;
    }
    if (!adjacentFront) { setMessage('STRIKEは正面1マスにいる相手、またはREBOUND経路へ使えます。'); return; }
    const d = roll(), nextHits = { ...hits };
    if (d >= 4) nextHits.player += 1;
    setHits(nextHits); addLog(`PLAYER STRIKE ${d >= 4 ? '成功' : '失敗'}。1D6=${d}`);
    if (nextHits.player >= 3) { setWinner('PLAYER'); setMessage('PLAYER WIN！'); return; }
    setTimeout(() => finishRound(player, false, null, nextHits), 260);
  }

  function whip(direction: Facing) {
    if (winner || !adjacentFront) { setWhipMode(false); setMessage('WHIPは正面1マスの相手に使います。'); return; }
    const d = roll();
    if (d < 4) { addLog(`PLAYER WHIP失敗。1D6=${d}`); setMessage('WHIP失敗。CPUが予定行動を実行します。'); setWhipMode(false); setTimeout(() => finishRound(player), 260); return; }
    let edge = { ...cpu };
    while (inside({ r: edge.r + DIRS[direction].r, c: edge.c + DIRS[direction].c })) edge = { r: edge.r + DIRS[direction].r, c: edge.c + DIRS[direction].c };
    const returnDirection: Facing = direction === 'N' ? 'S' : direction === 'S' ? 'N' : direction === 'E' ? 'W' : 'E';
    setCpu(edge); setCpuFacing(direction); setIntent(reboundIntent(edge, returnDirection));
    addLog(`WHIP成功！ 1D6=${d}。CPU予定をREBOUNDへ変更。`); setMessage('CPUの元の予定をキャンセル。次はREBOUNDです。');
    setTimeout(() => finishRound(player, true), 260);
  }

  function reset() {
    const p = { r: 5, c: 2 }, e = { r: 1, c: 4 };
    setPlayer(p); setCpu(e); setPlayerFacing('N'); setCpuFacing('S'); setIntent(makeCpuIntent(e, p)); setMoved(false); setHits({ player: 0, cpu: 0 });
    setRound(1); setWhipMode(false); setReservedStrike(null); setWinner(null); setMessage('CPUの予定を見て、移動先を選んでください。');
    setHistory(['試合開始。先に3回STRIKEを成功させれば勝利。']);
  }

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'restart_match',
      title: '試合を最初からやり直す',
      description: '現在の試合作戦と得点を消去し、同じ初期配置で試合を再開します。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => { reset(); return { status: 'restarted', round: 1 }; },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const cells: Pos[] = [];
  for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) cells.push({ r, c });

  return (
    <main className="game-shell">
      <header className="topbar"><div><p className="eyebrow">TACTICAL PRO-WRESTLING / PROTOTYPE 01</p><h1>RING REVERSAL</h1></div><div className="round-box"><span>ROUND</span><strong>{String(round).padStart(2, '0')}</strong></div></header>
      <section className="score-row" aria-label="試合状況">
        <div className="fighter-card player-card"><div><span>PLAYER</span><strong>BLUE CORNER</strong></div><div className="hit-pips" aria-label={`成功打撃 ${hits.player}/3`}>{[0,1,2].map((n)=><i key={n} className={n<hits.player?'on':''}/>)}</div></div>
        <div className="versus">FIRST TO 3</div>
        <div className="fighter-card cpu-card"><div><span>CPU</span><strong>RED CORNER</strong></div><div className="hit-pips" aria-label={`成功打撃 ${hits.cpu}/3`}>{[0,1,2].map((n)=><i key={n} className={n<hits.cpu?'on':''}/>)}</div></div>
      </section>
      <div className="game-grid">
        <section className="intent-panel panel"><p className="panel-kicker">ENEMY INTENT</p><h2>{intentName}</h2><div className={`intent-symbol ${intent.kind}`} aria-hidden="true">{intent.kind==='rebound'?'⇠⇠⇠':intent.attack?'➜ ✦':'➜'}</div><p>{intent.kind==='rebound'?'ロープ反動で3マス直進':intent.attack?'表示ルートを移動後、赤いマスへ打撃':'PLAYERへ最大2マス接近'}</p><dl><div><dt>移動</dt><dd>{intent.path.length} マス</dd></div><div><dt>向き</dt><dd>{FACE_NAME[intent.facing]} {FACE_LABEL[intent.facing]}</dd></div></dl></section>
        <section className="ring-wrap" aria-label="7×7リング"><div className="ring-back-rope" aria-hidden="true"/><div className="board">
          {cells.map((cell)=>{const key=`${cell.r},${cell.c}`, isReachable=reachable.some((p)=>same(p,cell)); const cls=['tile',isReachable?'reachable':'',pathSet.has(key)?'intent-path':'',attackKey===key?'attack-tile':'',reboundSet.has(key)?'rebound-tile':'',reservedStrike&&same(reservedStrike,cell)?'reserved':''].filter(Boolean).join(' '); return <button key={key} className={cls} style={projected(cell)} onClick={()=>movePlayer(cell)} aria-label={`${cell.r+1}行${cell.c+1}列${isReachable?'へ移動':''}`} disabled={!isReachable}/>})}
          <div className="token player-token" style={projected(player)}><span className="face-arrow">{FACE_LABEL[playerFacing]}</span><b>P</b><small>PLAYER</small></div>
          <div className="token cpu-token" style={projected(cpu)}><span className="face-arrow">{FACE_LABEL[cpuFacing]}</span><b>C</b><small>CPU</small></div>
        </div><div className="ring-front-rope" aria-hidden="true"/><div className="ring-label">7 × 7 RING</div></section>
        <section className="log-panel panel"><p className="panel-kicker">MATCH LOG</p><ol>{history.map((line,i)=><li key={`${line}-${i}`} className={i===0?'latest':''}>{line}</li>)}</ol></section>
      </div>
      <section className="command-deck"><output className="message" aria-live="polite">{message}</output><div className="controls"><div className="face-controls" aria-label="向きを変える"><span>FACE</span>{(Object.keys(DIRS) as Facing[]).map((d)=><button key={d} className={playerFacing===d?'selected':''} onClick={()=>{setPlayerFacing(d);setWhipMode(false)}} aria-label={`${FACE_NAME[d]}を向く`}>{FACE_LABEL[d]}</button>)}</div><div className="action-controls"><button className="action strike" onClick={strike}>STRIKE<small>{canReserve?'迎撃予約':'正面1マス'}</small></button><button className={`action whip ${whipMode?'selected':''}`} onClick={()=>{setWhipMode((v)=>!v);setMessage(adjacentFront?'振る方向を選んでください。':'先に正面1マスへ相手を捉えてください。')}}>WHIP<small>ロープへ振る</small></button><button className="action wait" onClick={()=>{addLog('PLAYERはアクションを使わずターン終了。');finishRound(player)}}>END<small>行動せず終了</small></button></div></div>
        {whipMode&&<div className="whip-directions"><span>WHIP DIRECTION</span>{(Object.keys(DIRS) as Facing[]).map((d)=><button key={d} onClick={()=>whip(d)}>{FACE_LABEL[d]} {FACE_NAME[d]}</button>)}</div>}
        <div className="legend"><span><i className="lg-move"/>移動可能</span><span><i className="lg-path"/>CPU移動</span><span><i className="lg-hit"/>攻撃地点</span><span><i className="lg-rebound"/>REBOUND</span></div>
      </section>
      {winner&&<div className="result-overlay"><div><p>THE WINNER IS</p><h2>{winner}</h2><button onClick={reset}>REMATCH</button></div></div>}
      {!winner&&<button className="reset-button" onClick={reset}>↻ RESET</button>}
    </main>
  );
}
