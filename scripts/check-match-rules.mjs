import assert from 'node:assert/strict';
import { act, endAction, externalHit, initialRules, moveError } from '../lib/match-rules.ts';
const positions = () => ({ red: { location: { area: 'ring', row: 3, column: 2 }, facing: 'right-front', stance: 'standing' }, blue: { location: { area: 'ring', row: 3, column: 3 }, facing: 'left-back', stance: 'standing' } });
const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected random check'); return values.shift(); };
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
test('all initial hits are 1; initial state remains immutable', () => {
  const s = initialRules(), p = positions();
  const out = act(s,p,'red','throw',rolls(.5,.1,.99));
  assert.equal(out.rules.vitals.blue.hp,7); assert.equal(s.vitals.blue.hp,8); assert.equal(p.blue.stance,'standing');
});
test('throw down skips exactly two own actions and uses supine art', () => {
  let {rules:s, positions:p}=act(initialRules(),positions(),'red','throw',rolls(.5,.1,0));
  assert.equal(s.vitals.blue.pose,'supine'); assert.equal(s.vitals.blue.down,2);
  ({rules:s,positions:p}=act(s,p,'blue','rest')); assert.equal(s.vitals.blue.down,1);
  ({rules:s,positions:p}=endAction(s,p,'red')); assert.equal(p.blue.stance,'down');
  ({rules:s,positions:p}=act(s,p,'blue','rest')); assert.equal(s.vitals.blue.down,0); assert.equal(p.blue.stance,'down');
  ({rules:s,positions:p}=endAction(s,p,'red')); assert.equal(p.blue.stance,'standing');
});
test('follow-up never resets recovery; zero HP cannot recover', () => {
  const s=initialRules(),p=positions(); p.blue.stance='down'; s.vitals.blue.down=0;
  let out=externalHit(s,p,'blue',rolls()); assert.equal(out.rules.vitals.blue.down,0);
  out.rules.vitals.blue.hp=0; out=endAction(out.rules,out.positions,'red'); assert.equal(out.positions.blue.stance,'down');
});
test('pin requires three successes; failed pin restores HP1 and standing', () => {
  const s=initialRules(),p=positions(); s.vitals.blue.hp=-3;p.blue.stance='down';
  let out=act(s,p,'red','pin',rolls(0,0,0)); assert.equal(out.rules.winner,'red');
  out=act(s,p,'red','pin',rolls(0,0,.99)); assert.equal(out.rules.winner,null); assert.equal(out.rules.vitals.blue.hp,1); assert.equal(out.positions.blue.stance,'standing');
});
test('rope pin breaks without rolling', () => {
  const s=initialRules(),p=positions();p.blue.location.row=0;p.blue.location.column=2;p.red.location.row=1;p.blue.stance='down';
  const out=act(s,p,'red','pin',rolls());assert.equal(out.rules.winner,null);assert.ok(out.rules.log.some(line=>line.includes('ロープブレイク')));
});
test('submission first damage; escape precedes movement and recovers HP', () => {
  const s=initialRules(),p=positions();p.blue.stance='down'; s.vitals.blue.hp=0;
  let out=act(s,p,'red','submission',rolls(.5,0,0));assert.equal(out.rules.hold.count,1);assert.equal(out.rules.vitals.blue.hp,-1);
  out=act(out.rules,out.positions,'blue','escape',rolls(0));assert.equal(out.rules.hold,null);assert.equal(out.rules.vitals.blue.hp,1);assert.equal(out.positions.blue.stance,'standing');
});
test('maintenance failure releases and restores; movement failure can break before damage', () => {
  const s=initialRules(),p=positions();p.blue.stance='down';s.vitals.blue.hp=0;s.hold={attacker:'red',defender:'blue',count:1,dr:-1,dc:0};
  let out=act(s,p,'red','hold',rolls(.99));assert.equal(out.rules.hold,null);assert.equal(out.rules.vitals.blue.hp,1);
  p.red.location.row=1;p.blue.location.row=1;s.vitals.blue.hp=4;
  out=act(s,p,'red','hold',rolls(0,.99));assert.equal(out.rules.hold,null);assert.equal(out.rules.vitals.blue.hp,4);assert.equal(out.positions.blue.location.row,0);
});
test('maximum three damages, next attacker action releases without fourth damage', () => {
  let s=initialRules(),p=positions();p.blue.stance='down';s.hold={attacker:'red',defender:'blue',count:1,dr:-1,dc:0};
  let out=act(s,p,'red','hold',rolls(0,0));assert.equal(out.rules.hold.count,2);
  out=act(out.rules,out.positions,'red','hold',rolls(0,0));assert.equal(out.rules.hold.count,3);assert.equal(out.rules.vitals.blue.hp,6);
  out=act(out.rules,out.positions,'red','hold',rolls());assert.equal(out.rules.hold,null);assert.equal(out.rules.vitals.blue.hp,6);assert.equal(out.rules.vitals.blue.down,1);
});
test('guts failure finishes; lower bound survives a successful check', () => {
  const s=initialRules(),p=positions();p.blue.stance='down';s.vitals.blue.hp=-3;
  let out=act(s,p,'red','submission',rolls(.5,0,.99));assert.equal(out.rules.winner,'red');assert.equal(out.rules.finish,'ギブアップ');
  out=act(s,p,'red','submission',rolls(.5,0,0));assert.equal(out.rules.winner,null);assert.equal(out.rules.vitals.blue.hp,-3);
});
test('counter cancels ordinary damage and does not chain', () => {
  const out=act(initialRules(),positions(),'red','throw',rolls(0));assert.equal(out.rules.vitals.red.hp,7);assert.equal(out.rules.vitals.blue.hp,8);
  assert.equal(out.positions.red.stance,'down');assert.equal(out.positions.blue.stance,'standing');
});
test('HP0 counter gets receiver standing without healing and allows a finishing pin', () => {
  const s=initialRules(),p=positions();s.vitals.red.hp=1;s.vitals.blue.hp=-1;p.blue.stance='down';
  let out=act(s,p,'red','strike',rolls(0));
  assert.equal(out.rules.vitals.red.hp,0);assert.equal(out.rules.vitals.blue.hp,-1);
  assert.equal(out.positions.red.stance,'down');assert.equal(out.positions.blue.stance,'standing');
  assert.equal(moveError(out.rules,out.positions,'blue','pin'),null);
  out=act(out.rules,out.positions,'blue','pin',rolls(0,0,0));assert.equal(out.rules.winner,'blue');
});
test('illegal moves leave state untouched; hold blocks normal attacks', () => {
  const s=initialRules(),p=positions();assert.ok(moveError(s,p,'red','submission'));s.hold={attacker:'red',defender:'blue',count:1,dr:-1,dc:0};
  const out=act(s,p,'red','strike',rolls());assert.ok(out.error);assert.equal(out.rules,s);
});
console.log(`${checks} rule checks passed`);
