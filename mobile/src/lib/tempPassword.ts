/**
 * Random temporary passwords for invited residents, managers and staff.
 * Replaces the old fixed defaults (e.g. "Welcome@123"), which anyone could guess.
 * Always satisfies typical rules: upper, lower, digit, symbol, 12 characters.
 */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '@#$%';

function randomInt(max: number): number {
  const g: any = (globalThis as any).crypto;
  if (g && typeof g.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    g.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

const pick = (set: string) => set[randomInt(set.length)];

export function generateTempPassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const all = UPPER + LOWER + DIGITS;
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
