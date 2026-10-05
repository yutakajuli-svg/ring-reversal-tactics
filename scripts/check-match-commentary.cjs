const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const R=require('../lib/simultaneous-rules.js').RingTrial;
const exportsObject={};
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/match-commentary.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports',source)(()=>({RingTrial:R}),exportsObject);
const {commentaryFrames,plannedRunPath}=exportsObject;
const plan=(s,id,move,extra={})=>({...R.defaultPlan(s,id),move,range:1,...extra});
const dice=(...values)=>{let n=0;return()=>((values[n++]??50)-1)/100;};
const adjacent=()=>{const s=R.initial();s.fighters.blue.c=3;return s;};
function playback(s,r,b,rng){
 const x=R.resolve(s,r,b,{},rng);assert.equal(x.error,null);
 const before=JSON.stringify(x),frames=commentaryFrames(s,x.frames,x.plans);
 assert.equal(JSON.stringify(x),before,'presentation must not mutate combat results');
 assert.deepEqual(frames.at(-1).state,x.state);
 const originals=frames.filter(f=>f.kind!=='announce');
 assert.equal(originals.length,x.frames.length);
 originals.forEach((f,i)=>{assert.deepEqual(f.state,x.frames[i].state);assert.deepEqual(f.damages,x.frames[i].damages);assert.equal(f.ms,x.frames[i].ms);assert.equal(f.ropeEdge,x.frames[i].ropeEdge);});
 return frames;
}
let s=adjacent();
let frames=playback(s,plan(s,'red','strike'),plan(s,'blue','strike'),()=>.5);
assert.equal(frames.filter(f=>f.kind==='announce').length,1);
assert.ok(frames.some(f=>f.message==='両者、打撃を繰り出す！'));
assert.ok(frames.some(f=>f.message.startsWith('相打ち！互いにヒット！')));
assert.ok(!frames.some(f=>/赤にヒット.*青にヒット|青にヒット.*赤にヒット/.test(f.message)));
s=adjacent();frames=playback(s,plan(s,'red','strike'),plan(s,'blue','strike'),dice(99,99,1,99,99));
assert.ok(frames.some(f=>f.message.startsWith('赤の打撃が青を捉えた！青の攻撃は空振り！')));
s=adjacent();frames=playback(s,plan(s,'red','strike'),plan(s,'blue','strike'),()=>.98);
assert.ok(frames.some(f=>f.message==='互いに届かない！両者の攻撃は空振り！'));
for(const [red,blue] of [['throw','throw'],['submission','submission'],['rope','rope'],['rope','throw'],['submission','rope']]){
 for(const die of [20,60,90]){
  s=adjacent();const values=red==='throw'&&blue==='throw'?[99,99,die]:[99,99,...[red,blue].filter(m=>m!=='rope').map(()=>1),die];
  frames=playback(s,plan(s,'red',red),plan(s,'blue',blue),dice(...values,40,50,99));
  const outcome=frames.find(f=>f.contestResult&&f.kind!=='announce');assert.ok(outcome);
  assert.equal(outcome.contestResult.winner,die<=40?'red':die<=80?'blue':null);
  assert.ok(outcome.message.includes(die>80?'膠着':`${die<=40?'赤':'青'}が崩した！`));
  assert.ok(!outcome.message.includes('空振り'));
  assert.equal(frames.filter(f=>/組み合う|互いに崩しにかかる/.test(f.message)).length,1);
  if(red==='rope'&&blue==='rope'&&die<=80)assert.ok(frames.some(f=>f.message===`${die<=40?'青':'赤'}、ロープにバウンド！`));
 }
}
s=adjacent();frames=playback(s,plan(s,'red','strike'),plan(s,'blue','move'),()=>.98);
assert.ok(frames.some(f=>/赤の攻撃は空振り/.test(f.message)));
s=adjacent();const rope=plan(s,'red','rope',{ropeDir:'right',ropeIntercept:{move:'strike',target:{r:3,c:3},range:1}});
const route=plannedRunPath(s,rope,true);assert.ok(route.length>0);assert.ok(route.every(p=>p.r===3));
frames=playback(s,rope,plan(s,'blue','move'),dice(50,40,50,99));
assert.ok(frames.some(f=>f.message==='赤が青をロープに投げる！'));
assert.ok(frames.some(f=>/ロープにバウンド/.test(f.message)));
assert.ok(frames.some(f=>/赤が青に打撃攻撃/.test(f.message)));
frames=playback(s,rope,plan(s,'blue','move'),dice(99));
assert.ok(frames.some(f=>/ロープで踏みとどまる/.test(f.message)));
assert.ok(!frames.some(f=>/ロープにバウンド/.test(f.message)));
s=R.initial();const choice=R.sprintOptions(s,'red')[0];
assert.deepEqual(plannedRunPath(s,{sprintRoute:choice.route},false),choice.route);
Object.assign(s.fighters.red,{r:3,c:0,ropeAnchor:{r:3,c:3}});
assert.ok(plannedRunPath(s,plan(s,'red','strike',{launchRun:true,runDir:'right'}),false).length);
s=adjacent();s.fighters.blue.down=true;s.fighters.blue.pose='supine';
frames=playback(s,plan(s,'red','pin'),R.defaultPlan(s,'blue'),()=>.98);
assert.ok(frames.some(f=>f.message==='赤が青をフォール！'));
assert.ok(frames.some(f=>f.message==='青がフォールを返した！'));
s=R.initial();Object.assign(s.fighters.red,{r:6,c:0,area:'corner',face:'right'});Object.assign(s.fighters.blue,{r:5,c:1,face:'left'});
frames=playback(s,plan(s,'red','dive'),plan(s,'blue','move'),()=>.98);
assert.ok(frames.some(f=>/赤は着地に失敗/.test(f.message)));
assert.ok(!frames.some(f=>/赤にヒット/.test(f.message)));
console.log('PASS: attack/miss commentary, rope bounce/stop distinction, all three path previews; states, damage and FIX timing unchanged.');

