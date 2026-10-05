const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const R=require('../lib/simultaneous-rules.js').RingTrial,G=require('../lib/fixed-board-geometry.js');
const {personalityScore,PERSONALITY_AXES}=require('../lib/cpu-personality.js');
const score=require('./fixtures/personality-audit-v3.cjs');
let base=cp.execFileSync('git',['show','f0da818:lib/simultaneous-rules.js'],{encoding:'utf8'});
base=base.replace("import * as G from './fixed-board-geometry.js';",'').replace('export const RingTrial','const RingTrial').replace('candidates.sort((a, b) => b.score - a.score);','for(const candidate of candidates)candidate.score+=bonus(s,candidate.p,options.cpuPersonality,{distance,same,atRope}); candidates.sort((a,b)=>b.score-a.score);');
const T=new Function('G','bonus',base+'return RingTrial;')(G,score);
const random=seed=>{let n=seed>>>0;return()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);};
const legal=(s,p)=>{if(!R.validate(s,'blue',p,{}))return p;const allowed=R.actions(s,'blue'),d=R.defaultPlan(s,'blue');for(const move of [...(allowed.includes('rest')?['rest']:[]),...allowed]){const q=R.normalize(s,'blue',{...d,move});if(!R.validate(s,'blue',q,{}))return q;}throw Error('No fallback');};
const profiles=PERSONALITY_AXES[0].flatMap(a=>PERSONALITY_AXES[1].flatMap(b=>PERSONALITY_AXES[2].map(c=>({a,b,c}))));
let compared=0;
for(const profile of profiles)for(const scenario of ['normal','pinch','retreated','repeated','outside-groggy'])for(let seed=1;seed<=5;seed++){
 const s=R.initial();if(scenario!=='normal')s.fighters.blue.hp=2;
 if(scenario==='retreated')s.history=Array.from({length:2},()=>({red:'strike',blue:'move',distance:2}));
 if(scenario==='repeated')s.history=Array.from({length:3},()=>({red:'strike',blue:'strike',distance:2}));
 if(scenario==='outside-groggy')Object.assign(s.fighters.blue,{r:3,c:7,area:'ringside',groggy:true});
 const opts={cpuPersonality:profile},before=JSON.stringify(s),actual=R.chooseCPU(s,opts,random(seed)),expected=legal(s,T.chooseCPU(s,opts,random(seed)));
 assert.deepEqual(actual,expected);assert.equal(JSON.stringify(s),before);assert.equal(R.validate(s,'blue',actual,{}),null);
 assert.equal(personalityScore(s,actual,profile,R),score(s,actual,profile,R));compared++;
}
// Full matches use the integrated CPU, not the source-rewriting audit factory.
if(process.argv.includes('--decisions-only')){console.log(`PASS ${compared} integrated decisions match frozen audit v3.`);process.exit(0);}
let errors=0,unfinished=0,totalRounds=0;
for(const profile of profiles)for(let seed=1;seed<=20;seed++){
 let s=R.initial(),turn=0;
 while(!s.winner&&turn<100){
  const mirror=R.copy(s);mirror.fighters={red:s.fighters.blue,blue:s.fighters.red};mirror.history=s.history.map(h=>({...h,red:h.blue,blue:h.red}));
  if(s.hold)mirror.hold={...s.hold,attacker:R.other(s.hold.attacker),defender:R.other(s.hold.defender)};
  const red=R.chooseCPU(mirror,{},random(seed*10000+turn*31)),blue=R.chooseCPU(s,{cpuPersonality:profile},random(seed*10000+turn*31+1));
  const x=R.resolve(s,red,blue,{},random(seed*10000+turn*31+2));if(x.error){errors++;break;}s=x.state;turn++;
 }
 totalRounds+=turn;if(!s.winner)unfinished++;
}
assert.equal(errors,0);assert.equal(unfinished,0);
console.log(`PASS ${compared} integrated decisions match audit v3; 540 matches finished, 0 errors; mean rounds ${(totalRounds/540).toFixed(2)}.`);
