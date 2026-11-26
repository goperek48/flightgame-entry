// The archipelago: island heights, the runway flats, and the ring course.
// heightAt(x, z) is the one function the flight model and the renderer both trust:
// the ground is where it says it is, nowhere else.

import { ISLANDS, RINGS } from './config.js';
import { valueNoise } from './random.js';

/** Falloff of one island: 1 at its centre, 0 past its shore. */
function islandBump(island, x, z) {
  const dx = x - island.x;
  const dz = z - island.z;
  const d = Math.sqrt(dx * dx + dz * dz) / island.radius;
  if (d >= 1) return 0;
  return Math.exp(-d * d * 2.4);
}

/** How much a runway flattens the ground near it: 1 on the strip, 0 past its apron. */
function runwayFlatten(runway, x, z) {
  const heading = (runway.heading * Math.PI) / 180;
  const along = (x - runway.x) * Math.sin(heading) + (z - runway.z) * -Math.cos(heading);
  const across = (x - runway.x) * Math.cos(heading) + (z - runway.z) * Math.sin(heading);
  const halfLen = runway.length / 2 + 90;
  const halfWid = runway.width / 2 + 70;
  if (Math.abs(along) > halfLen || Math.abs(across) > halfWid) return 0;
  const a = 1 - Math.abs(along) / halfLen;
  const c = 1 - Math.abs(across) / halfWid;
  return Math.min(a, c);
}

export function heightAt(x, z) {
  let height = 0;
  for (const island of ISLANDS) {
    height += island.height * islandBump(island, x, z);
  }
  // Rolling hills on land, never in the sea: the noise fades out below the beach.
  const hills = (valueNoise(x, z, 260) - 0.5) * 2 * 14 + (valueNoise(x + 900, z - 400, 90) - 0.5) * 2 * 5;
  height += hills * Math.min(1, Math.max(0, height / 24));
  // Every runway sits on a flat apron at 2 m above the sea.
  let flatten = 0;
  for (const island of ISLANDS) {
    if (island.runway) flatten = Math.max(flatten, runwayFlatten(island.runway, x, z));
  }
  return height * (1 - flatten) + 2 * flatten;
}

/** True when (x, z) is over water. */
export function isWater(x, z) {
  return heightAt(x, z) <= 2.5;
}

/** The runway under (x, z), or null when the point is off every strip. */
export function runwayAt(x, z) {
  for (const island of ISLANDS) {
    const runway = island.runway;
    if (!runway) continue;
    const heading = (runway.heading * Math.PI) / 180;
    const along = (x - runway.x) * Math.sin(heading) + (z - runway.z) * -Math.cos(heading);
    const across = (x - runway.x) * Math.cos(heading) + (z - runway.z) * Math.sin(heading);
    if (Math.abs(along) <= runway.length / 2 && Math.abs(across) <= runway.width / 2) {
      return { ...runway, island: island.name, along, across };
    }
  }
  return null;
}

/** The ring course, as fixed world positions the missions share. */
export function ringCourse() {
  return RINGS.map((ring, index) => ({ ...ring, index }));
}

/** Clouds: fixed seeded puffs the renderer draws as soft billboards. */
export function makeClouds(random, count = 26) {
  const clouds = [];
  for (let index = 0; index < count; index += 1) {
    clouds.push({
      x: random.range(-2600, 2600),
      z: random.range(-2200, 2200),
      y: random.range(300, 460),
      size: random.range(90, 220),
      puffs: Math.floor(random.range(3, 6)),
    });
  }
  return clouds;
}
