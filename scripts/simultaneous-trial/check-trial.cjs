const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','..','public','ring-reversal-simultaneous-trial.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);assert.equal(scripts.length,2);scripts.forEach(s=>new Function(s));
class Element{
  constructor(){this.children=[];this.value='';this.textContent='';this.dataset={};this.events={};this.classList={add(){}};this.selectedOptions=[{textContent:'確認用の場面'}];}
  set innerHTML(v){this._html=v;this.children=[];}get innerHTML(){return this._html||'';}
  append(x){this.children.push(x);}replaceChildren(){this.children=[];}setAttribute(){}
  addEventListener(event,fn){this.events[event]=fn;}
}
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]),elements=new Map(ids.map(id=>[id,new Element()]));
const document={getElementById(id){assert.ok(elements.has(id),`Element ${id} exists`);return elements.get(id);},createElement(){return new Element();}};
const el=id=>elements.get(id);
for(const [id,value]of Object.entries({attackSteps:'1',strikeMode:'called',collision:'contest',cpuStyle:'balanced',speed:'instant',scenario:'normal'}))el(id).value=value;
const sandbox={document,console,Math,setTimeout};vm.createContext(sandbox);
vm.runInContext(scripts.join('\n')+'\nglobalThis.ui={getState:()=>game,getPlan:()=>plan,getCpu:()=>cpuPlan,commit,restart};',sandbox);
(async()=>{
  assert.equal(el('board').children.length,49);assert.match(el('plan').textContent,/予約済み/);
  const cpu=JSON.stringify(sandbox.ui.getCpu());
  el('board').children[3*7+3].events.click();assert.equal(sandbox.ui.getPlan().to.c,3);
  el('actions').children.find(b=>b.textContent==='投げ').events.click();assert.equal(sandbox.ui.getPlan().to.c,3,'行動変更で移動先を消さない');assert.equal(JSON.stringify(sandbox.ui.getCpu()),cpu,'CPUの予約はプレイヤー選択で変わらない');
  el('actions').children.find(b=>b.textContent==='移動のみ').events.click();el('board').children[1*7+2].events.click();
  el('actions').children.find(b=>b.textContent==='打撃').events.click();assert.equal(el('commit').disabled,true);assert.match(el('error').textContent,/１|1/);
  sandbox.ui.restart();await sandbox.ui.commit();assert.equal(sandbox.ui.getState().round,2);assert.equal(el('board').children.length,49);assert.match(el('logs').innerHTML,/攻防 1/);
  for(const scenario of ['late','ground','rope','running']){sandbox.ui.restart(scenario);assert.equal(sandbox.ui.getState().round,1);assert.equal(el('board').children.length,49);assert.equal(el('commit').disabled,false);await sandbox.ui.commit();assert.equal(sandbox.ui.getState().round,2);}
  sandbox.ui.restart('rope');assert.equal(sandbox.ui.getState().fighters.blue.hp,0);
  el('actions').children.find(b=>b.textContent==='関節技').events.click();assert.equal(el('commit').disabled,false);await sandbox.ui.commit();assert.equal(sandbox.ui.getState().fighters.blue.hp,0);
  console.log('Standalone UI checks passed: controls, preserved movement, CPU commitment, instant playback, reset and all starting scenarios.');
})().catch(e=>{console.error(e);process.exitCode=1;});
