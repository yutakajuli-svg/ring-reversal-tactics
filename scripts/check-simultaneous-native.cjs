const assert = require('node:assert/strict');
const R = require('../lib/simultaneous-rules.js').RingTrial;
let passed = 0;
function test(label, fn) { fn(); passed++; console.log('PASS', label); }
function adjacent(hp = 8) { const s=R.initial(); s.fighters.blue.c=3; for(const id of R.IDS)s.fighters[id].hp=hp; return s; }
function plan(s,id,move,extras={}) { return {...R.defaultPlan(s,id),move,range:1,...extras}; }
function dice(...values) { let n=0; return () => n<values.length ? (values[n++]-1)/100 : .5; }
function turn(s,r,b,rng=()=>.5) { const x=R.resolve(s,r,b,{},rng); assert.equal(x.error,null); return x.state; }
test('相手のマスを２マス移動で飛び越せない',()=>{const s=adjacent(); assert.equal(R.path(s.fighters.red,{r:3,c:4},s.fighters.blue),null); assert.ok(R.validate(s,'red',plan(s,'red','move',{to:{r:3,c:4}})));});
test('攻撃移動は１、移動のみは２',()=>{const s=R.initial(); assert.ok(R.validate(s,'red',plan(s,'red','strike',{to:{r:2,c:3}}))); assert.equal(R.validate(s,'red',plan(s,'red','move',{to:{r:2,c:3}})),null);});
test('HP１同士の相打ちは双方にダメージとダウン',()=>{const s=adjacent(1),o=turn(s,plan(s,'red','strike'),plan(s,'blue','strike')); assert.equal(o.fighters.red.hp,0);assert.equal(o.fighters.blue.hp,0);assert.ok(o.fighters.red.down&&o.fighters.blue.down);assert.equal(o.doubleCount,0);});
test('打撃を受けて倒れても成立済みの投げは消えない',()=>{const s=adjacent(1),o=turn(s,plan(s,'red','strike'),plan(s,'blue','throw'));assert.equal(o.fighters.red.hp,0);assert.equal(o.fighters.blue.hp,0);assert.ok(o.fighters.red.down&&o.fighters.blue.down);});
test('単独カウンターは相手の攻撃を止め、自分の命中を試す',()=>{const s=adjacent(),o=turn(s,plan(s,'red','strike'),plan(s,'blue','strike'),dice(1,50,99));assert.equal(o.fighters.red.hp,8);assert.equal(o.fighters.blue.hp,8);assert.match(o.log.map(x=>x.text).join('\n'),/赤 打撃命中.*失敗/);});
test('双方カウンターの打撃は各１回の命中で解決',()=>{const s=adjacent(),o=turn(s,plan(s,'red','strike'),plan(s,'blue','strike'),dice(1,1,50,50));assert.equal(o.fighters.red.hp,7);assert.equal(o.fighters.blue.hp,7);assert.equal(o.log.filter(x=>/カウンター 10%/.test(x.text)).length,2);});
test('双方カウンターの投げは崩し合い、膠着ならダメージなし',()=>{const s=adjacent(),o=turn(s,plan(s,'red','throw'),plan(s,'blue','throw'),dice(1,1,90));assert.equal(o.fighters.red.hp,8);assert.equal(o.fighters.blue.hp,8);assert.ok(o.log.some(x=>x.text.includes('膠着')));});
test('投げのダウンも復帰準備１回、同じ攻防では起きない',()=>{const s=adjacent(4),o=turn(s,plan(s,'red','throw'),plan(s,'blue','move'),dice(50,50,1));assert.ok(o.fighters.blue.down);const t=turn(o,plan(o,'red','move'),plan(o,'blue','rest'));assert.equal(t.fighters.blue.down,false);});
test('ダウン中のカウンターはHP０でも立つだけ',()=>{const s=adjacent();Object.assign(s.fighters.blue,{hp:0,down:true});const o=turn(s,plan(s,'red','strike'),plan(s,'blue','rest'),dice(1));assert.equal(o.fighters.blue.hp,0);assert.equal(o.fighters.blue.down,false);assert.equal(o.fighters.red.hp,8);});
test('起こして投げてミスなら受け手は立ち状態',()=>{const s=adjacent();s.fighters.blue.down=true;const o=turn(s,plan(s,'red','throw'),plan(s,'blue','rest'),dice(50,99));assert.equal(o.fighters.blue.down,false);assert.equal(o.fighters.blue.hp,8);});
test('関節の立ち70%・ダウン80%を使い分ける',()=>{for(const down of [false,true]){const s=adjacent();s.fighters.blue.down=down;const o=turn(s,plan(s,'red','submission'),plan(s,'blue',down?'rest':'move'),dice(50,75));assert.equal(!!o.hold,down);assert.equal(o.fighters.blue.hp,down?7:8);}});
test('ロープ関節はHP０でもダメージ前にブレイク',()=>{const s=adjacent();Object.assign(s.fighters.red,{c:1,face:'left'});Object.assign(s.fighters.blue,{c:0,hp:0,down:true});const o=turn(s,plan(s,'red','submission'),plan(s,'blue','rest'),dice(50,50));assert.equal(o.fighters.blue.hp,0);assert.equal(o.fighters.blue.down,false);assert.equal(o.hold,null);});
test('ロープフォールはカウントせずダウンを維持',()=>{const s=adjacent();s.fighters.red.c=1;Object.assign(s.fighters.blue,{c:0,hp:0,down:true});const o=turn(s,plan(s,'red','pin'),plan(s,'blue','rest'));assert.equal(o.winner,null);assert.equal(o.fighters.blue.down,true);assert.equal(o.fighters.blue.hp,0);assert.equal(o.log.filter(x=>x.text.includes('フォール・カウント')).length,0);});
test('ロープ際の通常攻撃は禁止・強化しない',()=>{const s=adjacent();Object.assign(s.fighters.red,{c:1,face:'left'});Object.assign(s.fighters.blue,{c:0});const o=turn(s,plan(s,'red','strike'),plan(s,'blue','move'));assert.equal(o.fighters.blue.hp,7);});
test('関節は維持に成功しても初回込み３ダメージで終了',()=>{const s=adjacent();s.fighters.blue.down=true;let o=turn(s,plan(s,'red','submission'),plan(s,'blue','rest'));for(let i=0;i<2;i++)o=turn(o,plan(o,'red','hold'),plan(o,'blue','escape'),dice(99,1,1,1));assert.equal(o.fighters.blue.hp,5);assert.equal(o.hold,null);assert.equal(o.fighters.blue.down,true);});
test('関節の維持失敗は受け手が立つ、HP回復なし',()=>{const s=adjacent();let o=turn(s,plan(s,'red','submission'),plan(s,'blue','move'));o=turn(o,plan(o,'red','hold'),plan(o,'blue','escape'),dice(99,99));assert.equal(o.hold,null);assert.equal(o.fighters.blue.down,false);assert.equal(o.fighters.blue.hp,7);});
test('フォールは３回成功で勝利、返された時は立つ',()=>{const s=adjacent();Object.assign(s.fighters.blue,{hp:0,down:true});let o=turn(s,plan(s,'red','pin'),plan(s,'blue','rest'),dice(50,50,50));assert.equal(o.winner,'red');o=turn(s,plan(s,'red','pin'),plan(s,'blue','rest'),dice(99));assert.equal(o.winner,null);assert.equal(o.fighters.blue.hp,0);assert.equal(o.fighters.blue.down,false);});
test('HP０以下の復帰失敗は次の確率を10上げる',()=>{const s=adjacent();Object.assign(s.fighters.blue,{hp:-3,down:true});const o=turn(s,plan(s,'red','move'),plan(s,'blue','rest'),dice(99));assert.equal(o.fighters.blue.recoveryFails,1);assert.equal(R.recoveryChance(o.fighters.blue),40);});
test('ロープスローは到達80%で次の戻りを固定する',()=>{const s=adjacent(),o=turn(s,plan(s,'red','rope',{ropeDir:'right'}),plan(s,'blue','move'),dice(50,50));assert.equal(o.fighters.blue.c,6);assert.deepEqual(o.fighters.blue.run.origin,{r:3,c:3});assert.equal(R.normalize(o,'blue',plan(o,'blue','strike',{to:{r:1,c:1}})).to.c,3);});
test('自分で走る手は攻撃なし、次の手の戻りは失敗判定なし',()=>{const s=R.initial();const o=turn(s,plan(s,'red','run',{runDir:'left'}),plan(s,'blue','move'));assert.equal(o.fighters.red.c,0);assert.equal(o.fighters.blue.hp,8);assert.ok(o.fighters.red.run);const t=turn(o,plan(o,'red','move'),plan(o,'blue','move'));assert.equal(t.fighters.red.c,2);assert.equal(t.fighters.red.run,null);});
test('両者起きられない３回のカウントで引き分け',()=>{let s=adjacent(0);for(const id of R.IDS)Object.assign(s.fighters[id],{down:true,hp:-3});s.doubleCount=0;for(let i=0;i<3;i++)s=turn(s,plan(s,'red','rest'),plan(s,'blue','rest'),()=>.99);assert.equal(s.winner,'draw');});
test('CPUの予約は元の状態を変更しない',()=>{const s=R.initial(),before=R.copy(s);R.chooseCPU(s);assert.deepEqual(s,before);});
test('場外の同じ高さでは打撃・投げを使えるが寝技決着はリング内',()=>{const s=adjacent();for(const id of R.IDS)Object.assign(s.fighters[id],{r:7,area:'ringside'});assert.equal(R.attackError(s,'red',plan(s,'red','strike')),null);assert.equal(R.attackError(s,'red',plan(s,'red','throw')),null);assert.ok(R.attackError(s,'red',plan(s,'red','submission')));});
test('コーナー上は正しい高さで予約し、床の角には移動しない',()=>{const s=adjacent();Object.assign(s.fighters.red,{r:5,c:0});Object.assign(s.fighters.blue,{r:3,c:3});assert.equal(R.canSelectCell(s,'red',{r:6,c:0,area:'corner'}),true);assert.equal(R.canSelectCell(s,'red',{r:6,c:0,area:'ring'}),false);});
test('飛ぶ前のカウンターなら飛び技の空振りダウンを発生させない',()=>{const s=adjacent();Object.assign(s.fighters.red,{r:6,c:0,area:'corner'});Object.assign(s.fighters.blue,{r:5,c:1});const o=turn(s,plan(s,'red','dive'),plan(s,'blue','move'),dice(1));assert.equal(o.fighters.red.area,'corner');assert.equal(o.fighters.red.down,false);assert.equal(o.fighters.blue.hp,8);});
test('飛んだ後の空振りは低い位置に着地して１回休み',()=>{const s=adjacent();Object.assign(s.fighters.red,{r:6,c:0,area:'corner'});Object.assign(s.fighters.blue,{r:5,c:1});const o=turn(s,plan(s,'red','dive'),plan(s,'blue','move'),dice(50,99));assert.equal(o.fighters.red.area,'ring');assert.equal(o.fighters.red.down,true);assert.equal(o.fighters.blue.hp,8);});
test('ダブルダウン中は移動予約を出さず起き上がりを判定',()=>{const s=adjacent(0);for(const id of R.IDS)s.fighters[id].down=true;s.doubleCount=0;assert.equal(R.canSelectCell(s,'red',{r:2,c:2}),false);assert.deepEqual(R.normalize(s,'red',plan(s,'red','rest',{to:{r:2,c:2}})).to,R.cell(s.fighters.red));});
test("関節技の移動は攻撃側もロープの外に押し出さない",()=>{const s=adjacent();Object.assign(s.fighters.red,{r:2,c:5,area:"ring"});Object.assign(s.fighters.blue,{r:2,c:6,area:"ring"});s.hold={attacker:"blue",defender:"red",count:1,dr:0,dc:1,posture:"standing"};const o=turn(s,plan(s,"red","escape"),plan(s,"blue","hold"),dice(99,1,99,1));for(const f of Object.values(o.fighters))assert.ok(R.inside(f));assert.equal(o.fighters.blue.c,6);});
if(process.argv.includes('--quick')){console.log(`${passed} rule checks passed.`);process.exit(0);}
let seed=3419;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const results={red:0,blue:0,draw:0,unfinished:0,rounds:0};
for(let m=0;m<100;m++){
  let s=R.initial();
  for(let t=0;t<200&&!s.winner;t++){
    const mirrored=R.copy(s);mirrored.fighters={red:R.copy(s.fighters.blue),blue:R.copy(s.fighters.red)};
    if(mirrored.hold){mirrored.hold.attacker=R.other(mirrored.hold.attacker);mirrored.hold.defender=R.other(mirrored.hold.defender);}
    mirrored.history=mirrored.history.map(h=>({...h,red:h.blue,blue:h.red}));
    const rp=R.chooseCPU(mirrored,{},rng),bp=R.chooseCPU(s,{},rng);const x=R.resolve(s,rp,bp,{},rng);
    assert.equal(x.error,null,JSON.stringify({s,rp,bp,error:x.error}));s=x.state;
    assert.equal(R.same(s.fighters.red,s.fighters.blue),false,'同じマスへの重なり');
    for(const f of Object.values(s.fighters)){assert.ok(R.inside(f),JSON.stringify({m,t,f,rp,bp,events:s.log.slice(-12)}));assert.ok(f.hp>=-3&&f.hp<=8);}
    if(s.hold)assert.notEqual(s.hold.attacker,s.hold.defender);
  }
  results[s.winner||'unfinished']++;results.rounds+=s.round-1;
  if(!s.winner&&results.unfinished===1)console.log('First long match diagnostic:',JSON.stringify({fighters:s.fighters,lastActions:s.history.slice(-5),lastEvents:s.log.slice(-10)}));
}
console.log(`${passed} rule checks passed; 100 seeded CPU matches:`,results);
