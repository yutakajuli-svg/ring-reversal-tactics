const assert=require('node:assert/strict');
const {randomCpuSettings,recordCpuSettings,cpuSettingsFooter}=require('../lib/cpu-settings.js');
const combinations=new Set();
for(let style=0;style<4;style++)for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++){
 const values=[(style+.5)/4,(a+.5)/3,(b+.5)/3,(c+.5)/3];let i=0;
 const result=randomCpuSettings(()=>values[i++]);assert.equal(i,4);combinations.add(JSON.stringify(result));
}
assert.equal(combinations.size,108);
const p={a:'慎重',b:'押し通す',c:'立て直す'},q={a:'奔放',b:'裏をかく',c:'勝負に出る'};
const first=recordCpuSettings([],1,'balanced',p);p.a='強気';assert.equal(first[0].personality.a,'慎重');
assert.strictEqual(recordCpuSettings(first,2,'balanced',first[0].personality),first);
const second=recordCpuSettings(first,3,'power',q);assert.equal(first.length,1);assert.equal(second.length,2);
const footer=cpuSettingsFooter('striker',q,second).join('\n');
assert.match(footer,/現在の設定：CPU傾向：打撃寄り/);assert.match(footer,/攻防1から使用：CPU傾向：バランス/);assert.match(footer,/攻防3から使用：CPU傾向：投げ寄り/);assert.match(footer,/奔放 × 裏をかく × 勝負に出る/);
console.log('PASS all 108 random settings; recorded settings survive later changes; current and used settings are distinguished.');
