/** Small, fast, seedable PRNG. Never use Math.random() in seed data: judges must see identical data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
export const intBetween = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
