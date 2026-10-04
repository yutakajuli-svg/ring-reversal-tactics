const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const R=require('../lib/simultaneous-rules.js').RingTrial;
const moduleSource=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/portrait-presentation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exportsObject={};new Function('exports',moduleSource)(exportsObject);
const {damagedPortraits,OPPONENT_PORTRAITS,portraitSource}=exportsObject;
assert.deepEqual(damagedPortraits({red:8,blue:8},{red:7,blue:7}),['red','blue']);
assert.deepEqual(damagedPortraits({red:-3,blue:8},{red:-3,blue:8},{red:1}),['red']);
assert.deepEqual(damagedPortraits({red:8,blue:8},{red:8,blue:8},{}),[]);
for(const character of ['red-protagonist',...OPPONENT_PORTRAITS])for(const damage of [false,true]){
 const source=portraitSource('/ring-reversal-tactics/',character,damage);
 assert.ok(source.startsWith('/ring-reversal-tactics/assets/portraits/'));
 assert.ok(fs.existsSync(path.join(__dirname,'../public/assets/portraits/faces-v2',path.basename(source))));
}
function scenario(hp){const s=R.initial();s.fighters.blue.c=3;for(const id of R.IDS)s.fighters[id].hp=hp;return s;}
function plan(s,id,move){return {...R.defaultPlan(s,id),move,range:1};}
let s=scenario(8),x=R.resolve(s,plan(s,'red','strike'),plan(s,'blue','strike'),{},()=>.5);
let impacts=x.frames.filter(f=>Object.keys(f.damages).length);
assert.equal(impacts.length,1);assert.deepEqual(impacts[0].damages,{blue:1,red:1});
s=scenario(-3);s.fighters.blue.down=true;
x=R.resolve(s,plan(s,'red','strike'),plan(s,'blue','rest'),{},()=>.5);
assert.ok(x.frames.some(f=>f.damages.blue===1&&f.state.fighters.blue.hp===-3));
s=scenario(8);x=R.resolve(s,plan(s,'red','strike'),plan(s,'blue','strike'),{},()=>.98);
assert.ok(x.frames.every(f=>Object.keys(f.damages).length===0));
console.log('PASS: both faces for simultaneous hits, capped HP damage recorded once, miss keeps normal faces, all 14 assets and GitHub Pages paths.');
