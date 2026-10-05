import { RingTrial as R } from './simultaneous-rules';

type Id = 'red' | 'blue';
type Cell = { r: number; c: number; area?: 'ring' | 'ringside' | 'corner' };
export type PlaybackFrame = { state: any; message: string; kind: string; ms: number; ropeEdge?: string | null; cues?: { actor: Id; subject: Id; outcome: 'hit' | 'miss' }[]; damages?: Partial<Record<Id, number>>; [key: string]: any };
const name = (id: Id) => id === 'red' ? '赤' : '青';
const other = (id: Id): Id => id === 'red' ? 'blue' : 'red';
const moveName = (id: Id, plans: any) => plans[id].move === 'strike' && (plans[id].sprint || plans[id].launchRun) ? '走り打撃' : (R.NAMES as Record<string,string>)[plans[id].move] || '攻撃';
function contestCall(plans: any): string {
  return plans.red.move === plans.blue.move
    ? `両者、${moveName('red',plans)}を狙って組み合う！`
    : `赤は${moveName('red',plans)}、青は${moveName('blue',plans)}！互いに崩しにかかる！`;
}
function contestFinish(winner: Id | null, plans: any): string {
  if (!winner) return '互いに崩せない！膠着！';
  const target=name(other(winner)), move=plans[winner].move;
  return `${name(winner)}が崩した！${move==='rope'?`${target}をロープへ投げる！`:move==='submission'?`${target}を関節技で捕らえた！`:`${target}に投げが決まった！`}`;
}

export function plannedRunPath(state: any, plan: any, interceptPicking: boolean): Cell[] {
  if (plan.sprintRoute) return plan.sprintRoute;
  const actor = state.fighters.red;
  if (interceptPicking && plan.move === 'rope') {
    const g: any = R.ropeGeometry({ ...actor, ...plan.to }, state.fighters.blue, plan.ropeDir);
    return g?.returnLocation ? R.path(R.fromLocation(g.ropeLocation), R.fromLocation(g.returnLocation), null, 16) || [] : [];
  }
  const thrown = state.fighters.blue.run;
  if (thrown?.attacker === 'red') return R.path(thrown.rope, thrown.origin, null, 16) || [];
  if (actor.run) return R.path(actor, actor.run.origin, null, 16) || [];
  if (plan.launchRun || plan.move === 'run') {
    const intent = R.runIntent(state, 'red', plan.runDir);
    if (intent) return R.path(actor, intent.rebound ? intent.origin : intent.goal, null, 16) || [];
  }
  return [];
}

function moving(previous: any, next: any): Id[] {
  return (['red', 'blue'] as Id[]).filter(id => !R.same(previous.fighters[id], next.fighters[id]));
}
function attackCall(id: Id, plans: any, frame: PlaybackFrame): string {
  const move = /迎撃/.test(frame.message) ? plans[id].ropeIntercept?.move || 'strike' : /反撃|カウンター/.test(frame.message) ? 'strike' : plans[id].move;
  const target = name(other(id));
  if (move === 'rope') return `${name(id)}が${target}をロープに投げる！`;
  if (move === 'strike') return `${name(id)}が${target}に${plans[id].sprint || plans[id].launchRun ? '走り打撃' : '打撃'}攻撃！`;
  if (move === 'throw') return `${name(id)}が${target}に投げを仕掛ける！`;
  if (move === 'submission' || move === 'hold') return `${name(id)}が${target}に関節技を仕掛ける！`;
  if (move === 'dive') return `${name(id)}が高所から跳ぶ！`;
  return `${name(id)}が${target}に${(R.NAMES as Record<string,string>)[move] || '攻撃'}！`;
}

/** Presentation only: never resolve combat again or inspect random outcomes. */
export function commentaryFrames(initial: any, frames: PlaybackFrame[], plans: any): PlaybackFrame[] {
  const output: PlaybackFrame[] = [];
  let previous = initial;
  let attackResult: string | null = null;
  let ropeRunner: Id | null = null;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const moved = moving(previous, frame.state);
    let message = frame.message;
    const attacks = frame.cues || [];
    if (frame.kind === 'move' || frame.kind === 'rope') attackResult=null;
    if (frame.message === '投げ同士が組み合う') message=contestCall(plans);
    if (frame.kind === 'pin') {
      const id = (['red', 'blue'] as Id[]).find(id => plans[id].move === 'pin');
      if (id) {
        output.push({ ...frame, state: previous, message: `${name(id)}が${name(other(id))}をフォール！`, kind: 'announce', ms: 720, cues: [], damages: {}, ropeEdge: null });
        if (/返した/.test(message)) message = `${name(other(id))}がフォールを返した！`;
      }
    }
    if (attacks.length) {
      const simultaneous = new Set(attacks.map(c=>c.actor)).size===2;
      const competing=!!frame.contestResult;
      const alreadyGrappling=competing&&frames[index-1]?.message==='投げ同士が組み合う';
      const calls = alreadyGrappling ? [] : competing ? [contestCall(plans)] : simultaneous ? [plans.red.move===plans.blue.move&&moveName('red',plans)===moveName('blue',plans)
        ? `両者、${moveName('red',plans)}を繰り出す！`
        : `赤は${moveName('red',plans)}、青は${moveName('blue',plans)}を仕掛ける！`] : [...new Set(attacks.map(c => attackCall(c.actor, plans, frame)))];
      for (const call of calls) output.push({ ...frame, state: previous, message: call, kind: 'announce', ms: 720, cues: [], damages: {}, ropeEdge: null });
      const results = attacks.map(c => c.outcome === 'miss' ? `${name(c.actor)}の攻撃は空振り！` : plans[c.actor].move === 'rope' && !/迎撃|反撃|カウンター/.test(frame.message) ? 'ロープスロー成功！' : `${name(c.subject)}にヒット！`);
      const hits=attacks.filter(c=>c.outcome==='hit');
      message = competing ? frame.contestResult.cancelled==='rope-break' ? `${name(frame.contestResult.winner)}が崩したが、ロープブレイク！` : contestFinish(frame.contestResult.winner,plans)
        : simultaneous && hits.length===2 ? '相打ち！互いにヒット！'
        : simultaneous && !hits.length ? '互いに届かない！両者の攻撃は空振り！'
        : simultaneous && hits.length===1 ? `${name(hits[0].actor)}の${moveName(hits[0].actor,plans)}が${name(hits[0].subject)}を捉えた！${name(other(hits[0].actor))}の攻撃は空振り！`
        : results.join(' ／ ');
      attackResult=message;
    }
    if (frame.message === 'ロープへ走らされる') { ropeRunner=moved[0] || ropeRunner; message = `${name(ropeRunner || 'blue')}がロープへ走らされる！`; }
    else if (frame.message === 'ロープから直線で戻る') message = `${name(moved[0] || 'blue')}がロープから戻ってくる！`;
    else if (frame.message === 'ロープ到達の結果') {
      const stopped = /ロープで停止/.test(frames[index + 1]?.message || '');
      const runner = ropeRunner || (['red', 'blue'] as Id[]).find(id => previous.fighters[id].run?.kind==='thrown') || (['red', 'blue'] as Id[]).find(id => plans[other(id)].move === 'rope') || 'blue';
      message = stopped ? `${name(runner)}がロープで踏みとどまる！` : `${name(runner)}、ロープにバウンド！`;
    } else if (frame.message === '双方が移動' || frame.message === '固定した進路を走る') {
      const ids = moved.length ? moved : (['red', 'blue'] as Id[]).filter(id => plans[id].sprint || plans[id].launchRun || plans[id].move === 'run');
      message = ids.map(id => `${name(id)}が${plans[id].sprint || plans[id].launchRun || plans[id].move === 'run' || previous.fighters[id].run ? '走る' : '移動する'}！`).join(' ／ ') || '両者が間合いを変える！';
    } else if (/ロープで停止.*迎撃は空振り/.test(frame.message)) message = frame.message.replace('。', '！').replace('の迎撃は空振り', 'の迎撃は空振り、グロッキー！');
    const damageIds = (['red', 'blue'] as Id[]).filter(id => (frame.damages?.[id] || 0) > 0);
    if (damageIds.length) {
      const selfMiss=damageIds.some(id=>plans[id].move==='dive'&&/空振り|かわされ/.test(frame.message));
      const conditions=damageIds.map(id=>frame.state.fighters[id].down?`${name(id)}、ダウン！`:frame.state.fighters[id].groggy?`${name(id)}、グロッキー！`:'').filter(Boolean).join(' ');
      message = attackResult&&!selfMiss ? `${attackResult}${conditions?' '+conditions:''}` : damageIds.map(id => {
      const selfMiss = plans[id].move === 'dive' && /空振り|かわされ/.test(frame.message);
      return `${selfMiss ? `${name(id)}は着地に失敗！` : `${name(id)}にヒット！これは痛い！`}${frame.state.fighters[id].down ? ' ダウン！' : frame.state.fighters[id].groggy ? ' グロッキー！' : ''}`;
      }).join(' ／ ');
    }
    output.push({ ...frame, message });
    previous = frame.state;
  }
  return output;
}

