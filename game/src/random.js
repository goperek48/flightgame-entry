// A small seeded random generator (mulberry32) plus the value-noise the terrain
// uses, so the same seed always builds the same archipelago and the same weather.

export function createRandom(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) {
      return min + (max - min) * this.next();
    },
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
  };
}

function hash2(x, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth 2D value noise in [0, 1], tiled by the cell size. */
export function valueNoise(x, z, cell = 240) {
  const cx = Math.floor(x / cell);
  const cz = Math.floor(z / cell);
  const fx = smooth(x / cell - cx);
  const fz = smooth(z / cell - cz);
  const a = hash2(cx, cz);
  const b = hash2(cx + 1, cz);
  const c = hash2(cx, cz + 1);
  const d = hash2(cx + 1, cz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
