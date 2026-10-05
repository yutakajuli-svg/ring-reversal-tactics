import { PERSONALITY_AXES } from './cpu-personality.js';
export const CPU_STYLE_LABELS={balanced:'バランス',striker:'打撃寄り',power:'投げ寄り',technical:'関節技寄り'};
export function randomCpuSettings(rng=Math.random){
 const pick=values=>values[Math.floor(rng()*values.length)];
 return {style:pick(Object.keys(CPU_STYLE_LABELS)),personality:{a:pick(PERSONALITY_AXES[0]),b:pick(PERSONALITY_AXES[1]),c:pick(PERSONALITY_AXES[2])}};
}
export function recordCpuSettings(history,round,style,personality){
 const last=history.at(-1);
 if(last&&last.style===style&&['a','b','c'].every(axis=>last.personality[axis]===personality[axis]))return history;
 return [...history,{round,style,personality:{...personality}}];
}
export function cpuSettingsFooter(style,personality,history=[]){
 const describe=(style,p)=>`CPU傾向：${CPU_STYLE_LABELS[style]} ／ 性格：${p.a} × ${p.b} × ${p.c}`;
 return ['CPU設定の記録',`現在の設定：${describe(style,personality)}`,...history.map(entry=>`攻防${entry.round}から使用：${describe(entry.style,entry.personality)}`)];
}
