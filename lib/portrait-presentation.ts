export const OPPONENT_PORTRAITS = ['a-brown-short', 'b-black-bob', 'c-burgundy-long', 'd-short-dark', 'e-black-long', 'f-green', 'g-plump-bob'] as const;
export type PortraitId = 'red' | 'blue';
export type PortraitHp = Record<PortraitId, number>;
// MENKO: status feedback and HP 360ms; one line 720ms; afterglow 360ms; outro 320ms.
export const PORTRAIT_TIMING = { feedback: 360, line: 720, afterglow: 360, outro: 320 };
export function damagedPortraits(previous: PortraitHp, next: PortraitHp, damages?: Partial<PortraitHp>): PortraitId[] {
  // Use internal HP too: damage still has an expression when the visible HP is already zero.
  return (['red', 'blue'] as const).filter(id => (damages?.[id] ?? 0) > 0 || next[id] < previous[id]);
}
export function portraitSource(base: string, character: string, damaged: boolean) {
  return `${base}assets/portraits/faces-v2/${character}-${damaged ? 'damage' : 'normal'}.png`;
}
