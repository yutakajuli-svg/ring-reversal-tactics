// Trial rules: all damage is 1. RNG is injected so boundaries can be tested.
export type Id = 'red' | 'blue';
export type Location = { area: 'ring' | 'corner' | 'ringside'; row: number; column: number };
export type Fighter = { location: Location; facing: 'right-front' | 'right-back' | 'left-back' | 'left-front'; stance: 'standing' | 'down' };
export type Positions = Record<Id, Fighter>;
export type Move = 'strike' | 'throw' | 'submission' | 'pin' | 'hold' | 'escape' | 'release' | 'rest';
export const MOVE_NAMES: Record<Move, string> = { strike: '打撃 / 追撃', throw: '投げ', submission: '関節技', pin: 'フォール', hold: '締め続ける', escape: '脱出・ロープへ', release: '技を離す', rest: '復帰を待つ' };
export type Vital = { hp: number; down: number; pose: 'prone' | 'supine' };
export type Hold = { attacker: Id; defender: Id; count: number; dr: number; dc: number };
export type Rules = { vitals: Record<Id, Vital>; hold: Hold | null; winner: Id | null; finish: string; log: string[]; ply: number };
export const other = (id: Id): Id => id === 'red' ? 'blue' : 'red';
const name = (id: Id) => id === 'red' ? '赤' : '青';
export function initialRules(): Rules {
  return { vitals: { red: { hp: 8, down: 0, pose: 'prone' }, blue: { hp: 8, down: 0, pose: 'prone' } }, hold: null, winner: null, finish: '', log: ['試合開始：体力8 / 全ダメージ1 / 資源なしの試遊'], ply: 0 };
}
function clone(s: Rules): Rules { return { ...s, vitals: { red: { ...s.vitals.red }, blue: { ...s.vitals.blue } }, hold: s.hold ? { ...s.hold } : null, log: [...s.log] }; }
function note(s: Rules, message: string) { s.log.push(`T${Math.floor(s.ply / 2) + 1} ${message}`); s.log = s.log.slice(-300); }
function check(s: Rules, label: string, chance: number, rng: () => number) {
  const die = Math.floor(rng() * 100) + 1;
  const ok = die <= chance;
  note(s, `${label} ${chance}% / D100=${die} → ${ok ? '成功' : '失敗'}`);
  return ok;
}
export function canAct(s: Rules, p: Positions, id: Id) { return !s.winner && !s.hold && p[id].stance === 'standing'; }
function ahead(a: Fighter, b: Fighter) {
  const vectors = { 'right-front': [0, 1], 'right-back': [-1, 0], 'left-back': [0, -1], 'left-front': [1, 0] };
  const [dr, dc] = vectors[a.facing];
  const r = b.location.row - a.location.row, c = b.location.column - a.location.column;
  return (dr ? c === 0 && r * dr > 0 : r === 0 && c * dc > 0) ? Math.abs(r) + Math.abs(c) : 0;
}
export function moveError(s: Rules, p: Positions, id: Id, move: Move): string | null {
  if (s.winner) return '試合は終了しています';
  if (s.hold) {
    const own = s.hold.attacker === id;
    return (own && (move === 'hold' || move === 'release')) || (!own && move === 'escape') ? null : '関節技の攻防中です';
  }
  if (move === 'rest') return p[id].stance === 'down' ? null : 'ダウンしていません';
  if (!canAct(s, p, id)) return 'ダウン中です';
  if (move === 'hold' || move === 'escape' || move === 'release') return '関節技は掛かっていません';
  const a = p[id], b = p[other(id)];
  if (a.location.area !== b.location.area || a.location.area === 'corner') return '同じ高さから使用してください';
  const distance = ahead(a, b);
  if (move === 'strike') return distance >= 1 && distance <= 2 ? null : '正面1〜2マスの相手が対象です';
  const adjacent = Math.abs(a.location.row - b.location.row) + Math.abs(a.location.column - b.location.column) === 1;
  if (move === 'pin') return a.location.area !== 'ring' ? 'フォールはリング内のみです' : adjacent && b.stance === 'down' ? null : '隣接したダウン中の相手が対象です';
  if (distance !== 1) return '正面に隣接した相手が対象です';
  if (move === 'throw') return b.stance === 'standing' ? null : '立っている相手が対象です';
  return a.location.area !== 'ring' ? '関節技はリング内のみです' : b.stance === 'down' ? null : 'ダウン中の相手が対象です';
}
function knockDown(s: Rules, p: Positions, id: Id, turns: number, pose: Vital['pose']) {
  if (p[id].stance !== 'down') { s.vitals[id].down = turns; s.vitals[id].pose = pose; }
  p[id].stance = 'down';
}
function damage(s: Rules, p: Positions, id: Id, category: 'strike' | 'throw' | 'submission', rng: () => number) {
  const v = s.vitals[id];
  v.hp = Math.max(-3, v.hp - 1);
  note(s, `${name(id)}に1ダメージ（表示HP ${Math.max(0, v.hp)} / 内部 ${v.hp}）`);
  if (category === 'submission') {
    if (v.hp <= 0) {
      const attacker = other(id), fatigue = s.vitals[attacker].hp <= 1 ? 10 : s.vitals[attacker].hp <= 4 ? 5 : 0;
      const chance = [50, 35, 20, 10][-v.hp] + fatigue;
      if (!check(s, `${name(id)} 根性`, chance, rng)) { s.winner = attacker; s.finish = 'ギブアップ'; note(s, `${name(attacker)}の勝利：ギブアップ`); }
    }
    return;
  }
  if (p[id].stance === 'down') return; // A follow-up never resets the recovery clock.
  const chance = v.hp <= 0 ? 100 : category === 'throw' ? (v.hp <= 1 ? 60 : v.hp <= 4 ? 40 : 20) : v.hp <= 1 ? 20 : v.hp <= 4 ? 10 : 0;
  if (chance > 0 && check(s, `${name(id)} ダウン`, chance, rng)) knockDown(s, p, id, category === 'throw' ? 2 : 1, category === 'throw' ? 'supine' : 'prone');
}
function release(s: Rules, p: Positions, escaped: boolean, reason: string) {
  const h = s.hold!;
  s.hold = null;
  p[h.attacker].stance = 'standing'; s.vitals[h.attacker].down = 0;
  if (escaped) {
    if (s.vitals[h.defender].hp <= 0) s.vitals[h.defender].hp = 1;
    p[h.defender].stance = 'standing'; s.vitals[h.defender].down = 0;
  } else { p[h.defender].stance = 'down'; s.vitals[h.defender].down = 1; }
  note(s, `${reason}：${name(h.defender)} ${escaped ? '立ち状態で脱出' : '1回休みのダウン'}`);
}
function atRope(p: Positions, id: Id) { const l = p[id].location; return l.row === 0 || l.row === 6 || l.column === 0 || l.column === 6; }
function shiftHold(s: Rules, p: Positions, toward: boolean) {
  const h = s.hold!;
  const sign = toward ? 1 : -1;
  const next = ([h.attacker, h.defender] as Id[]).map(id => ({ id, row: p[id].location.row + h.dr * sign, column: p[id].location.column + h.dc * sign }));
  if (next.every(l => l.row >= 0 && l.row <= 6 && l.column >= 0 && l.column <= 6 && !((l.row === 0 || l.row === 6) && (l.column === 0 || l.column === 6)))) {
    for (const l of next) p[l.id].location = { area: 'ring', row: l.row, column: l.column };
    note(s, toward ? 'ロープへ1マス移動' : 'ロープから1マス引き戻した');
  } else note(s, '移動先がないため、その場で継続');
  if (atRope(p, h.defender)) release(s, p, true, 'ロープブレイク');
}
function movementChance(s: Rules, id: Id) { const delta = s.vitals[id].hp - s.vitals[other(id)].hp; return 60 + Math.sign(delta) * 10; }
export function endAction(input: Rules, positions: Positions, actor: Id) {
  const s = clone(input), p = structuredClone(positions), next = other(actor);
  s.ply += 1;
  if (!s.winner && !s.hold && p[next].stance === 'down' && s.vitals[next].down === 0 && s.vitals[next].hp > 0) {
    p[next].stance = 'standing'; note(s, `${name(next)}が復帰。通常行動できます`);
  }
  return { rules: s, positions: p };
}
export function externalHit(input: Rules, positions: Positions, victim: Id, rng = Math.random, category: 'strike' | 'throw' = 'strike') {
  const s = clone(input), p = structuredClone(positions); damage(s, p, victim, category, rng); return { rules: s, positions: p };
}
export function act(input: Rules, positions: Positions, actor: Id, move: Move, rng = Math.random) {
  const error = moveError(input, positions, actor, move);
  if (error) return { rules: input, positions, error };
  const s = clone(input), p = structuredClone(positions), defender = other(actor);
  note(s, `${name(actor)}：${MOVE_NAMES[move]}`);
  if (move === 'rest') {
    s.vitals[actor].down = Math.max(0, s.vitals[actor].down - 1);
    note(s, s.vitals[actor].hp <= 0 ? '体力0：自力復帰できません' : `復帰準備：残り${s.vitals[actor].down}回休み（次の自分の番に判定）`);
  } else if (s.hold) {
    const h = s.hold, aHp = s.vitals[h.attacker].hp, dHp = s.vitals[h.defender].hp;
    const fatigue = aHp <= 1 ? 10 : aHp <= 4 ? 5 : 0;
    if (move === 'release' || (move === 'hold' && h.count >= 3)) release(s, p, false, h.count >= 3 ? '3回の上限で解除（追加ダメージなし）' : '攻撃側が技を離した');
    else if (move === 'hold') {
      if (!check(s, '維持', (dHp <= 1 ? 95 : dHp <= 4 ? 85 : 70) - fatigue, rng)) release(s, p, true, '維持失敗で脱出');
      else {
        const back = check(s, '攻撃側の移動', movementChance(s, actor), rng);
        shiftHold(s, p, !back);
        if (s.hold) { s.hold.count++; damage(s, p, h.defender, 'submission', rng); }
      }
    } else {
      if (check(s, '自力脱出', (dHp <= 1 ? 15 : dHp <= 4 ? 30 : 50) + fatigue, rng)) release(s, p, true, '自力脱出');
      else if (check(s, '受け手の移動', movementChance(s, actor), rng)) shiftHold(s, p, true);
    }
  } else if (move === 'pin') {
    if (atRope(p, defender)) note(s, 'ロープブレイク：フォール解除');
    else {
      s.vitals[defender].pose = 'supine';
      const hp = s.vitals[defender].hp, aHp = s.vitals[actor].hp;
      const chance = (hp >= 5 ? 30 : hp >= 2 ? 50 : hp === 1 ? 70 : [90, 93, 96, 98][-hp]) - (aHp <= 1 ? 10 : aHp <= 4 ? 5 : 0);
      let count = 0;
      for (let i = 1; i <= 3; i++) { if (!check(s, `カウント${i}`, chance, rng)) break; count++; }
      if (count === 3) { s.winner = actor; s.finish = '3カウント'; note(s, `${name(actor)}の勝利：1！ 2！ 3！`); }
      else {
        note(s, `${count ? Array.from({ length: count }, (_, i) => `${i + 1}！`).join(' ') : ''} フォールを返した！`);
        if (s.vitals[defender].hp <= 0) s.vitals[defender].hp = 1;
        s.vitals[defender].down = 0; p[defender].stance = 'standing';
      }
    }
  } else if (check(s, `${name(defender)} 迎撃`, 10, rng)) {
    // A successful counter gets the receiver back on their feet, even at HP0.
    // It cancels the original move; no second counter or extra recovery roll.
    p[defender].stance = 'standing'; s.vitals[defender].down = 0;
    knockDown(s, p, actor, 1, 'prone');
    damage(s, p, actor, 'strike', rng);
    note(s, `${name(defender)}が迎撃して立ち上がり、${name(actor)}はダウン（体力回復なし）`);
  }
  else if (check(s, '命中', 90, rng)) {
    if (move === 'submission') {
      if (atRope(p, defender)) note(s, 'ロープブレイク：関節技は成立しません');
      else {
        const l = p[defender].location;
        const edge = [{ distance: l.row, dr: -1, dc: 0 }, { distance: 6 - l.row, dr: 1, dc: 0 }, { distance: l.column, dr: 0, dc: -1 }, { distance: 6 - l.column, dr: 0, dc: 1 }].sort((a,b) => a.distance - b.distance)[0];
        s.hold = { attacker: actor, defender, count: 1, dr: edge.dr, dc: edge.dc };
        s.vitals[defender].down = 0;
        damage(s, p, defender, 'submission', rng);
      }
    } else damage(s, p, defender, move === 'throw' ? 'throw' : 'strike', rng);
  }
  return { ...endAction(s, p, actor), error: null };
}
