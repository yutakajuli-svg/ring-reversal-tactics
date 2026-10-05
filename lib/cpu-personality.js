// Approved nine keywords; trial decision weights verified in personality audit v3.
export const PERSONALITY_AXES=[['強気','慎重','奔放'],['押し通す','合わせる','裏をかく'],['粘る','勝負に出る','立て直す']];
export const DEFAULT_PERSONALITY={a:'強気',b:'合わせる',c:'粘る'};
const attack=p=>p.move!=='move'&&p.move!=='rest';
export function personalityScore(s,p,active,R){
 const f=s.fighters.blue,t=s.fighters.red,gap=R.distance(p.to,t),old=R.distance(f,t),moved=!R.same(f,p.to),atk=attack(p),running=!!p.sprint;
 const own=s.history.slice(-3).map(h=>h.blue),opp=s.history.slice(-3).map(h=>h.red);
 const count=arr=>Object.entries(arr.reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]);
 const repeated=count(opp)[0],known=repeated&&repeated[1]>=2?repeated[0]:null;
 let n=0;
 if(active.a==='強気')n+=(atk?1:0)+(gap===1?1.3:0)+(gap<old?.4:0);
 if(active.a==='慎重')n+=(gap===2?1.6:0)-(running||p.move==='dive'?.8:0);
 if(active.a==='奔放')n+=(running||['rope','dive'].includes(p.move)?1:0)-(own.filter(m=>m===p.move).length*.7);
 if(active.b==='押し通す')n+=own.length&&p.move===own.at(-1)?1.4:0;
 // Persist with the attack, rather than perpetually chasing the opponent's last square.
 if(active.b==='押し通す'&&own.length===3&&own.every(m=>m==='strike')&&opp.length===3&&opp.every(m=>m==='strike'))n+=!moved?7:0;
 if(active.b==='合わせる'&&known){
  if(known==='throw')n+=(p.move==='strike'?1.4:0)+(gap===2?1.4:0);
  if(known==='strike')n+=(p.move==='throw'?1.6:0)+(gap===1?.7:0);
  if(known==='submission')n+=(R.atRope(p.to)?1.4:0)+(moved?.6:0);
 }
 if(active.b==='裏をかく'&&known)n+=(p.move!==known&&atk?.8:0)+(p.move==='rope'?1.1:0)-(p.move===own.at(-1)?.6:0);
 if(f.hp<=3){
  if(active.c==='粘る')n+=(!moved?.8:0)+(atk&&!running&&p.move!=='dive'?.8:0)-(running?.5:0);
  if(active.c==='勝負に出る')n+=(running||['dive','throw','rope','pin'].includes(p.move)?2.2:0)-(p.move==='move'?.8:0);
  if(active.c==='立て直す'){
   let retreats=0;for(let i=s.history.length-1;i>=0&&s.history[i].blue==='move';i--)retreats++;
   if(retreats<2)n+=(p.move==='move'?2.5:0)+(gap>old?1.4:0)+(R.atRope(p.to)?.5:0)-(running?1:0);
   else n+=(atk?4:0)-(p.move==='move'?4:0);
  }
 }
 return n;
}
