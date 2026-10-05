const assert=require('node:assert/strict');
const R=require('../lib/simultaneous-rules.js').RingTrial;
const other=id=>id==='red'?'blue':'red';
const pairs=[['rope','rope'],['rope','throw'],['throw','rope'],['rope','submission'],['submission','rope']];
for(const [red,blue] of pairs){
 const totals={red:0,blue:0,stalemate:0};
 for(let die=1;die<=100;die++){
  const s=R.initial();s.fighters.blue.c=3;
  const plans=Object.fromEntries([['red',red],['blue',blue]].map(([id,move])=>[id,{...R.defaultPlan(s,id),move,range:1,ropeDir:s.fighters[id].face}]));
  // Two failed counter rolls, successful non-rope control rolls, then the contest.
  const rolls=[50,50,...[red,blue].filter(m=>m!=='rope').map(()=>1),die];let n=0;
  const x=R.resolve(s,plans.red,plans.blue,{},()=>((rolls[n++]??99)-1)/100);
  assert.equal(x.error,null);
  const initialAttack=x.frames.find(f=>f.cues?.length&&['attack','miss'].includes(f.kind));
  const hits=(initialAttack?.cues||[]).filter(c=>c.outcome==='hit');
  assert.ok(hits.length<=1);
  const winner=hits[0]?.actor;
  totals[winner||'stalemate']++;
  assert.ok(x.state.log.some(l=>/捕まえる技同士の崩し合い/.test(l.text)));
  const ropeLogs=x.state.log.filter(l=>/のロープスロー成立/.test(l.text));
  assert.equal(ropeLogs.length,winner&&plans[winner].move==='rope'?1:0);
  if(winner&&plans[winner].move==='rope')assert.ok(ropeLogs[0].text.startsWith(winner==='red'?'赤':'青'));
  if(!winner){assert.equal(s.fighters.red.hp,x.state.fighters.red.hp);assert.equal(s.fighters.blue.hp,x.state.fighters.blue.hp);assert.ok(!x.frames.some(f=>f.message==='ロープへ走らされる'));}
 }
 assert.deepEqual(totals,{red:40,blue:40,stalemate:20});
 console.log(`PASS ${red}/${blue}: red 40, blue 40, stalemate 20; only the winning rope throw starts.`);
}
// The winner of one counter still cancels only the opponent's ordinary attack.
for(const owner of ['red','blue']){
 const s=R.initial();s.fighters.blue.c=3;
 const p=id=>({...R.defaultPlan(s,id),move:'rope',range:1,ropeDir:s.fighters[id].face});
 let n=0;const values=owner==='red'?[1,99]:[99,1];
 const x=R.resolve(s,p('red'),p('blue'),{},()=>((values[n++]??99)-1)/100);
 const hit=x.frames.flatMap(f=>f.cues||[]).filter(c=>c.outcome==='hit');
 assert.ok(hit.some(c=>c.actor===owner));assert.ok(!hit.some(c=>c.actor===other(owner)));
}
console.log('PASS either side can counter a competing rope throw.');
