const assert=require('node:assert/strict');
const R=require('../lib/simultaneous-rules.js').RingTrial;
const plan=(s,id,move,extra={})=>({...R.defaultPlan(s,id),move,range:1,...extra});
const dice=(...values)=>{let n=0;return()=>((values[n++]||50)-1)/100;};
const resolve=(s,r,b,rng=dice())=>{const x=R.resolve(s,r,b,{},rng);assert.equal(x.error,null);return x;};
function waiting(){const s=R.initial();s.fighters.blue.c=3;return resolve(s,plan(s,'red','rope',{ropeDir:'right'}),plan(s,'blue','move')).state;}
let passed=0;const test=(name,f)=>{f();passed++;console.log('PASS',name);};
test('戻りは迎撃予約後に判定',()=>{const s=waiting();assert.equal(s.fighters.blue.run.pending,true);assert.equal(s.fighters.blue.run.attacker,'red');assert.equal(s.log.some(x=>/ロープから戻る 80%/.test(x.text)),false);});
test('戻る側は通常攻撃を選べない',()=>{const s=waiting();assert.deepEqual(R.actions(s,'blue'),['move']);assert.ok(R.validate(s,'blue',plan(s,'blue','strike')));assert.equal(R.chooseCPU(s).move,'move');});
test('ロープ停止は無傷、迎撃側だけグロッキー',()=>{const s=waiting(),o=resolve(s,plan(s,'red','strike'),plan(s,'blue','move'),dice(99)).state;assert.equal(o.fighters.blue.c,6);assert.equal(o.fighters.blue.hp,8);assert.equal(o.fighters.blue.run,null);assert.ok(o.fighters.red.groggy);assert.ok(R.actions(o,'blue').includes('run'));});
for(const range of [1,2])test(`${range}マス迎撃の命中`,()=>{const s=waiting(),o=resolve(s,plan(s,'red','strike',{target:{r:3,c:2+range},range}),plan(s,'blue','move'),dice(50,50,50,99)).state;assert.equal(o.fighters.blue.hp,7);assert.equal(o.fighters.red.hp,8);});
test('２マス迎撃ミスは追加ダメージなしのグロッキー',()=>{const s=waiting(),o=resolve(s,plan(s,'red','strike',{target:{r:3,c:4},range:2}),plan(s,'blue','move'),dice(50,50,99)).state;assert.ok(o.fighters.red.groggy);assert.equal(o.fighters.red.hp,8);assert.equal(o.fighters.blue.hp,8);});
test('カウンターは迎撃を消して反撃',()=>{const s=waiting(),o=resolve(s,plan(s,'red','strike',{target:{r:3,c:3}}),plan(s,'blue','move'),dice(50,1,50)).state;assert.equal(o.fighters.red.hp,7);assert.equal(o.fighters.blue.hp,8);});
test('予告マスを外れた相手には当たらない',()=>{const s=R.initial();s.fighters.blue.c=3;const o=resolve(s,plan(s,'red','strike',{target:{r:3,c:3}}),plan(s,'blue','move',{to:{r:2,c:3}})).state;assert.equal(o.fighters.blue.hp,8);});
test('自走の到着と出発でしなる',()=>{const s=R.initial(),x=resolve(s,plan(s,'red','run',{runDir:'left'}),plan(s,'blue','move'));assert.ok(x.frames.some(f=>f.ropeEdge==='left'));const y=resolve(x.state,plan(x.state,'red','move'),plan(x.state,'blue','move'));assert.equal(y.frames.find(f=>f.kind==='move').ropeEdge,'left');});
test('ロープ停止後は通常移動か走る攻撃を選べる',()=>{
 const s=waiting(),stopped=resolve(s,plan(s,'red','strike'),plan(s,'blue','move'),dice(99)).state;
 const x=resolve(stopped,plan(stopped,'red','rest'),plan(stopped,'blue','strike',{launchRun:true,runDir:'left',target:{r:3,c:2}}),dice(50,50,99));
 assert.equal(x.state.fighters.red.hp,7);assert.equal(x.frames.find(f=>f.kind==='move').ropeEdge,'right');
});
console.log(`${passed} interception and FIX presentation checks passed.`);
