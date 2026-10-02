'use strict';
const R = RingTrial, $ = id => document.getElementById(id);
let game = R.initial(), plan, cpuPlan, busy = false, shown = game, announced = null;
const settings = () => ({ attackSteps: Number($('attackSteps').value), strikeMode: $('strikeMode').value, collision: $('collision').value, cpuStyle: $('cpuStyle').value });
function lockRound() { plan = R.defaultPlan(game, 'red'); cpuPlan = R.chooseCPU(game, settings()); announced = null; shown = game; render(); }
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
function button(label, selected, handler, disabled = false) {
  const b = document.createElement('button'); b.textContent = label; b.className = selected ? 'selected' : ''; b.disabled = busy || disabled; b.addEventListener('click', handler); return b;
}
function choices(id, items, key, label, disabled = false) {
  const el = $(id); el.replaceChildren();
  for (const item of items) el.append(button(label(item), plan[key] === item.key, () => { plan[key] = item.key; render(); }, disabled));
}
function stateText(s, id) {
  const f = s.fighters[id];
  if (s.hold) return s.hold.attacker === id ? `関節技を維持中 ${s.hold.count}/3` : `関節技で拘束中 ${s.hold.count}/3`;
  if (f.down) return s.doubleCount !== null ? `ダウンカウント ${s.doubleCount}/3` : f.hp <= 0 ? 'ダウン・復帰判定が必要' : 'ダウン・復帰準備１回';
  if (f.run) return `${R.coordinate(f.run.origin)}への戻り移動が固定`;
  return '立ち状態';
}
function renderBoard() {
  const el = $('board'), normalized = R.normalize(game, 'red', plan), red = shown.fighters.red;
  el.replaceChildren();
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const pos = { r, c }, b = document.createElement('button'); b.className = 'cell' + (R.atRope(pos) ? ' edge' : '');
    const selectable = !busy && plan.move !== 'run' && R.canSelectCell(game, 'red', pos);
    if (selectable) b.classList.add('selectable');
    if (!busy && R.same(pos, normalized.to)) b.classList.add('reserved');
    if (red.run && R.path(red, red.run.origin, null, 12)?.some(p => R.same(p, pos))) b.classList.add('route');
    b.disabled = !selectable; b.title = `${R.coordinate(pos)}${R.atRope(pos) ? '・ロープ隣接' : ''}`; b.setAttribute('aria-label', b.title);
    b.innerHTML = `<span class="coord">${R.coordinate(pos)}</span>`;
    for (const id of R.IDS) {
      const f = shown.fighters[id];
      if (R.same(f, pos)) b.innerHTML += `<span class="token ${id}${f.down ? ' down' : ''}">${f.down ? '↓' : R.DIRS.find(d => d.key === f.face).mark}<small>${R.name(id)}</small></span>`;
    }
    b.addEventListener('click', () => { plan.to = pos; plan.face = R.facingToward(pos, game.fighters.blue); render(); });
    el.append(b);
  }
}
function renderLog() {
  const groups = new Map();
  for (const item of game.log) { if (!groups.has(item.round)) groups.set(item.round, []); groups.get(item.round).push(item.text); }
  $('logs').innerHTML = [...groups].reverse().map(([round, lines]) => `<div class="log-round"><strong>${round ? `攻防 ${round}` : '試合開始'}</strong>${lines.map(line => `<p>${esc(line)}</p>`).join('')}</div>`).join('');
}
function render() {
  const s = shown, f = game.fighters.red, normalized = R.normalize(game, 'red', plan), held = !!game.hold;
  $('scores').innerHTML = R.IDS.map(id => { const x = s.fighters[id]; return `<div class="score ${id}"><b>${R.name(id)} ${id === 'red' ? 'あなた' : 'CPU'}</b><div class="hp">${Math.max(0, x.hp)} <small>/ ８</small></div><div class="bar"><i style="width:${Math.max(0,x.hp)/8*100}%"></i></div><div class="status">${esc(stateText(s,id))}</div></div>`; }).join('');
  $('round').textContent = game.winner ? '試合終了' : `攻防 ${game.round} · ${busy ? '解決中' : '行動を予約'}`;
  renderBoard();
  $('actions').replaceChildren();
  for (const move of R.actions(game, 'red')) $('actions').append(button(R.NAMES[move], plan.move === move, () => { plan.move = move; render(); }));
  choices('faces', R.DIRS, 'face', d => d.mark, held || !!f.run || plan.move === 'run' || f.down);
  choices('ranges', [{ key:1 },{ key:2 }], 'range', d => `${d.key}マス`);
  choices('ropeDirections', R.DIRS, 'ropeDir', d => d.mark);
  choices('runDirections', R.runDirections(game, 'red'), 'runDir', d => d.mark);
  $('rangeRow').hidden = plan.move !== 'strike' || settings().strikeMode !== 'called';
  $('ropeRow').hidden = plan.move !== 'rope'; $('runRow').hidden = plan.move !== 'run';
  $('movementHint').textContent = game.doubleCount !== null ? '両者ダウンのカウント中は移動せず、起き上がりを判定します。' : held ? '拘束中の移動は維持・脱出の判定で決まります。' : f.run ? `${R.coordinate(f.run.origin)}へ戻る進路が固定されています。途中で相手との間合いに入れば攻防を判定します。` : plan.move === 'run' ? '方向を選ぶとロープまでの直線移動を予約します。この手は攻撃しません。' : f.down ? '復帰準備と一緒に１マスまで移動できます。' : `攻撃する手は${settings().attackSteps}マス、移動のみの手は２マスまで。向きは下で調整できます。`;
  $('phaseHint').textContent = held ? '攻撃側は維持・解除、受け手は脱出を試みます。' : f.down ? 'この手では攻撃できません。カウンター成功なら立ち上がり、攻撃は次の手です。' : '移動後の位置・向き・間合いで攻撃できるかを決めます。相手も同時に動きます。';
  const face = R.DIRS.find(d => d.key === normalized.face)?.mark || '';
  $('plan').textContent = announced ? `公開：赤 ${R.NAMES[announced.red.move]} ／ 青 ${R.NAMES[announced.blue.move]}` : `赤の予約：${R.coordinate(normalized.to)}／${face}／${R.NAMES[plan.move]}${plan.move === 'strike' && settings().strikeMode === 'called' ? `・${plan.range}マス狙い` : ''}　青：予約済み`;
  const error = game.winner ? '' : R.validate(game, 'red', plan, settings());
  $('error').textContent = error || '';
  $('commit').disabled = busy || !!error || !!game.winner;
  $('commit').textContent = busy ? '攻防を解決中…' : game.winner ? '試合終了' : 'せーので行動公開';
  for (const id of ['restart','startScenario','scenario','cpuStyle','attackSteps','strikeMode','collision','speed']) $(id).disabled = busy;
  if (!busy) $('stage').textContent = game.winner ? `${game.winner === 'draw' ? '引き分け' : R.name(game.winner) + 'の勝利'}：${game.finish}` : '移動先と行動を予約してください。';
  renderLog();
}
async function commit() {
  if (busy || game.winner) return;
  const result = R.resolve(game, plan, cpuPlan, settings());
  if (result.error) { $('error').textContent = result.error; return; }
  busy = true; announced = result.plans;
  const factor = $('speed').value === 'instant' ? 0 : $('speed').value === 'fast' ? .38 : 1;
  try {
    for (const frame of result.frames) {
      shown = frame.state; render(); $('board').dataset.event = frame.kind; $('stage').textContent = frame.message;
      if (factor) await new Promise(resolve => setTimeout(resolve, frame.ms * factor));
    }
    game = result.state;
  } finally { busy = false; $('board').dataset.event = ''; lockRound(); }
}
function restart(scenario = 'normal') {
  if (busy) return;
  game = R.initial();
  if (scenario === 'late') { game.fighters.red.c = 2; game.fighters.blue.c = 3; game.fighters.red.hp = 1; game.fighters.blue.hp = 1; }
  if (scenario === 'ground') { game.fighters.blue.c = 3; game.fighters.blue.hp = 3; game.fighters.blue.down = true; }
  if (scenario === 'rope') { Object.assign(game.fighters.red, { r:3,c:1,face:'left' }); Object.assign(game.fighters.blue, { r:3,c:0,face:'right',hp:0,down:true }); }
  if (scenario === 'running') { Object.assign(game.fighters.red, { r:3,c:2,face:'right' }); Object.assign(game.fighters.blue, { r:3,c:6,face:'left',run:{kind:'thrown',origin:{r:3,c:3},rope:{r:3,c:6}} }); }
  if (scenario !== 'normal') game.log.push({round:0,text:`確認用の場面：${$('scenario').selectedOptions[0].textContent}`});
  lockRound();
}
$('commit').addEventListener('click', commit);
$('restart').addEventListener('click', () => restart());
$('startScenario').addEventListener('click', () => restart($('scenario').value));
for (const id of ['cpuStyle','attackSteps','strikeMode','collision']) $(id).addEventListener('change', () => { cpuPlan = R.chooseCPU(game, settings()); render(); });
lockRound();
