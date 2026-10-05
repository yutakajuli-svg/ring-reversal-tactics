const assert=require('node:assert/strict');
const R=require('../lib/simultaneous-rules.js').RingTrial;
const plan=(s,id,move,extra={})=>({...R.defaultPlan(s,id),move,range:1,...extra});
const dice=(...values)=>{let n=0;return()=>((values[n++]??50)-1)/100;};
const resolve=(s,r,b,rng=dice())=>{const x=R.resolve(s,r,b,{},rng);assert.equal(x.error,null);return x;};
let passed=0;const test=(name,f)=>{f();passed++;console.log('PASS',name);};
const adjacent=()=>{const s=R.initial();s.fighters.blue.c=3;return s;};
test('ロープ停止後は短距離でも相手へ走って近・遠攻撃できる',()=>{
 for(const range of [1,2]){
  const s=R.initial();Object.assign(s.fighters.red,{r:6,c:3});Object.assign(s.fighters.blue,{r:3,c:3,groggy:true});
  const o=R.sprintOptions(s,'red').find(o=>R.sprintReach(o.to,s.fighters.blue,o.direction)===range);assert.ok(o);
  assert.equal(o.route.length,3-range);
  const x=resolve(s,plan(s,'red','strike',{to:o.to,sprint:true,sprintRoute:o.route,runDir:o.direction,target:R.cell(s.fighters.blue),range}),plan(s,'blue','rest'),dice(50,50,99));
  assert.equal(x.state.fighters.blue.hp,7);assert.equal(x.state.round,2);
 }
});
test('短い対角線も走れるが、直線・対角線外は選べない',()=>{
 const s=R.initial();Object.assign(s.fighters.red,{r:2,c:2});Object.assign(s.fighters.blue,{r:4,c:4});
 const o=R.sprintOptions(s,'red').find(o=>o.direction==='down-right');assert.ok(o);assert.equal(o.route.length,1);
 s.fighters.blue.c=5;assert.equal(R.sprintOptions(s,'red').length,0);
});
test('グロッキーは正面のみ、移動と方向転換を固定',()=>{
 for(const face of ['up','right','down','left']){
  const s=R.initial();Object.assign(s.fighters.red,{r:3,c:3,face,groggy:true});
  const p=R.normalize(s,'red',plan(s,'red','strike',{to:{r:2,c:2},face:'left'}));
  assert.ok(R.same(p.to,s.fighters.red));assert.equal(p.face,face);assert.equal(R.sprintOptions(s,'red').length,0);
  for(const d of R.DIRS){Object.assign(s.fighters.blue,{r:3+d.dr,c:3+d.dc});assert.equal(R.attackError(s,'red',p)===null,d.key===face);}
 }
});
test('グロッキーの正面攻撃は成立し、１行動後に回復',()=>{
 const s=adjacent();s.fighters.red.groggy=true;
 const x=resolve(s,plan(s,'red','strike'),plan(s,'blue','move'),dice(50,50,99));
 assert.equal(x.state.fighters.blue.hp,7);assert.equal(x.state.fighters.red.groggy,false);assert.equal(x.state.fighters.red.face,'right');
});
test('通常・グロッキー・ダウンの成功確率は別々',()=>{
 assert.deepEqual([{}, {groggy:true},{down:true}].map(t=>R.hitChance('throw',t)),[55,80,90]);
 assert.deepEqual([{}, {groggy:true},{down:true}].map(t=>R.hitChance('submission',t)),[45,65,85]);
});
test('グロッキー中も正面の関節技は拘束まで成立',()=>{
 const s=adjacent();s.fighters.red.groggy=true;
 const x=resolve(s,plan(s,'red','submission'),plan(s,'blue','move'),dice(50,40));
 assert.equal(x.state.hold?.attacker,'red');assert.equal(x.state.fighters.red.groggy,false);
});
test('往復走りと攻撃は１行動、到着と出発のロープ演出',()=>{
 const s=R.initial(),o=R.sprintOptions(s,'red')[0];
 const x=resolve(s,plan(s,'red','strike',{to:o.to,sprint:true,sprintRoute:o.route,runDir:o.direction,target:R.cell(s.fighters.blue)}),plan(s,'blue','move'),dice(50,50,99));
 assert.equal(x.state.round,2);assert.equal(x.state.fighters.red.c,3);assert.equal(x.state.fighters.blue.hp,7);assert.equal(x.state.fighters.red.run,null);
 assert.equal(x.frames.filter(f=>f.ropeEdge==='left').length,2);
});
test('近い走り空振りは無傷のグロッキー',()=>{
 const s=R.initial(),o=R.sprintOptions(s,'red')[0];
 const x=resolve(s,plan(s,'red','strike',{to:o.to,sprint:true,sprintRoute:o.route,runDir:o.direction,target:R.cell(s.fighters.blue)}),plan(s,'blue','move',{to:{r:2,c:4}}));
 assert.equal(x.state.fighters.red.hp,8);assert.ok(x.state.fighters.red.groggy);assert.ok(!x.state.fighters.red.down);
});
test('ロープ沿いの走りは毎マスしなり・待機を挟まない',()=>{
 for(const [r,c,tr,tc,direction] of [[6,4,6,0,'left'],[0,2,0,6,'right'],[4,0,0,0,'up'],[2,6,6,6,'down']]){
  const s=R.initial();Object.assign(s.fighters.red,{r,c});Object.assign(s.fighters.blue,{r:tr,c:tc,area:'corner'});
  const o=R.sprintOptions(s,'red').find(o=>o.direction===direction&&R.sprintReach(o.to,s.fighters.blue,direction)===1);assert.ok(o);
  const x=resolve(s,plan(s,'red','strike',{to:o.to,sprint:true,sprintRoute:o.route,runDir:direction,target:R.cell(s.fighters.blue)}),plan(s,'blue','move'));
  const moves=x.frames.filter(f=>f.kind==='move');assert.equal(moves.length,3);assert.ok(moves.every(f=>f.ropeEdge===null));
 }
});
test('遠い走りの空振りと手前の激突は低体力でダウンもある',()=>{
 for(const collision of [false,true]){
  const s=R.initial();s.fighters.red.hp=4;s.fighters.blue.c=6;
  const o=R.sprintOptions(s,'red').find(o=>o.to.c===4);
  const x=resolve(s,plan(s,'red','strike',{to:o.to,sprint:true,sprintRoute:o.route,runDir:o.direction,target:R.cell(s.fighters.blue),range:2}),plan(s,'blue','move',{to:collision?{r:3,c:4}:{r:2,c:6}}),dice(99));
  assert.equal(x.state.fighters.red.hp,4);assert.ok(x.state.fighters.red.down);
 }
});
test('コーナー上は３方向の隣接から走り近攻撃、遠は禁止',()=>{
 for(const [r,c,dir] of [[2,0,'down'],[6,4,'left'],[2,4,'down-left']]){
  const s=R.initial();Object.assign(s.fighters.red,{r,c});Object.assign(s.fighters.blue,{r:6,c:0,area:'corner'});
  const o=R.sprintOptions(s,'red').find(o=>o.direction===dir&&R.sprintReach(o.to,s.fighters.blue,dir)===1);assert.ok(o);
  const p=plan(s,'red','strike',{to:o.to,sprint:true,sprintRoute:o.route,runDir:dir,target:R.cell(s.fighters.blue)});
  const preview=R.copy(s);Object.assign(preview.fighters.red,o.to);assert.equal(R.attackError(preview,'red',p),null);assert.ok(R.attackError(preview,'red',{...p,range:2}));
  const x=resolve(s,p,plan(s,'blue','move'),dice(50,50,99));assert.equal(x.state.fighters.blue.hp,7);assert.equal(x.state.fighters.blue.area,'corner');assert.ok(x.state.fighters.blue.groggy);
 }
});
test('ロープスローの戻りと迎撃は同じ１行動、赤優先',()=>{
 const s=adjacent(),x=resolve(s,plan(s,'red','rope',{ropeDir:'right',ropeIntercept:{move:'strike',target:{r:3,c:3},range:1}}),plan(s,'blue','strike'),dice(50,50,99));
 assert.equal(x.state.fighters.blue.hp,7);assert.equal(x.state.fighters.red.hp,8);assert.equal(x.state.fighters.blue.run,null);assert.equal(x.state.round,2);
 assert.equal(x.state.log.filter(l=>/勢いで反撃/.test(l.text)).length,0);assert.equal(x.frames.filter(f=>f.ropeEdge==='right').length,2);
});
test('ロープ停止で赤は無傷グロッキー、青は次に走れる',()=>{
 const s=adjacent(),x=resolve(s,plan(s,'red','rope',{ropeDir:'right'}),plan(s,'blue','move'),dice(99));
 assert.equal(x.state.fighters.blue.c,6);assert.ok(x.state.fighters.red.groggy);assert.equal(x.state.fighters.red.hp,8);assert.ok(R.sprintOptions(x.state,'blue').length);
});
test('戻る相手は近・遠とも迎撃が当たったマスで停止',()=>{
 for(const range of [1,2])for(const move of range===1?['strike','throw','submission']:['strike']){
  const s=adjacent(),target={r:3,c:2+range,area:'ring'};
  const x=resolve(s,plan(s,'red','rope',{ropeDir:'right',ropeIntercept:{move,target,range}}),plan(s,'blue','move'),dice(50,40,99));
  assert.equal(x.state.fighters.blue.hp,7);assert.ok(R.same(x.state.fighters.blue,target));assert.equal(x.state.fighters.blue.run,null);
  const impact=x.frames.findIndex(f=>/迎撃が決まった/.test(f.message));assert.ok(impact>=0);
  for(const frame of x.frames.slice(impact))assert.ok(R.same(frame.state.fighters.blue,target),'命中後に走り抜けない');
 }
});
test('赤ミス青成功はカウンター、双方ミスは赤のみ無傷グロッキー',()=>{
 for(const counter of [true,false]){
  const s=adjacent(),x=resolve(s,plan(s,'red','rope',{ropeDir:'right'}),plan(s,'blue','move'),dice(50,99,counter?50:99,99));
  assert.equal(x.state.fighters.red.hp,counter?7:8);assert.equal(x.state.fighters.blue.hp,8);assert.equal(!!x.state.fighters.red.groggy,!counter);
 }
});
console.log(`${passed} revised-rule checks passed`);
