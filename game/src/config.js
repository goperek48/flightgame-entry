// Every tuning number, colour and world constant in one place. The game renders at a
// fixed 1280x720 logical area and the renderer scales it to the window, so no rule
// below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Metres per second at full throttle, and the speed below which the wing stops flying. */
export const PLANE = {
  maxSpeed: 105,
  minSpeed: 18,
  stallSpeed: 30,
  cruiseThrottle: 0.72,
  accel: 14,
  drag: 0.12,
  pitchRate: 1.05,
  rollRate: 2.4,
  maxPitch: 0.55,
  maxRoll: 1.15,
  turnFactor: 0.42,
  fuelMax: 100,
  fuelBurnIdle: 0.22,
  fuelBurnFull: 0.85,
  gearSpeed: 46,
  climbPenalty: 0.35,
};

/** Scoring: a ring, a clean landing, a completed mission, a second of flight. */
export const SCORE = { ring: 250, landing: 500, mission: 1000, hopBonus: 150 };

export const MISSIONS = [
  {
    id: 'rings',
    key: '1',
    name: 'RING RUN',
    tag: 'Thread 8 sky rings, then bring her home',
    brief: 'Fly the ring course over the islands and land back on Runway 09.',
  },
  {
    id: 'hop',
    key: '2',
    name: 'ISLAND HOP',
    tag: 'Land on three island strips, in order',
    brief: 'Touch down gently on Palm Cay, Coral Bay and Gull Island. Each landing refuels you.',
  },
  {
    id: 'courier',
    key: '3',
    name: 'COURIER DASH',
    tag: 'One parcel, one far atoll, one tank of fuel',
    brief: 'Reach Far Atoll before the fuel gauge — or the clock — runs out.',
  },
];

/** Islands: centre (x, z), radius in metres, peak height, and an optional runway. */
export const ISLANDS = [
  { name: 'Home Island', x: 0, z: 0, radius: 680, height: 78, runway: { x: 0, z: 60, heading: 90, length: 520, width: 26 } },
  { name: 'Palm Cay', x: -980, z: -760, radius: 330, height: 52, runway: { x: -980, z: -760, heading: 45, length: 340, width: 22 } },
  { name: 'Turtle Rock', x: 1250, z: -950, radius: 390, height: 128 },
  { name: 'Coral Bay', x: 1560, z: 940, radius: 430, height: 62, runway: { x: 1560, z: 940, heading: 0, length: 380, width: 22 } },
  { name: 'Gull Island', x: -1450, z: 860, radius: 310, height: 46, runway: { x: -1450, z: 860, heading: 135, length: 320, width: 22 } },
  { name: 'Far Atoll', x: 2450, z: -420, radius: 360, height: 38, runway: { x: 2450, z: -420, heading: 70, length: 360, width: 22 } },
];

/** The ring course for the Ring Run mission: centres and heights in metres. */
export const RINGS = [
  { x: 420, z: -260, y: 150, r: 22 },
  { x: 880, z: -640, y: 190, r: 22 },
  { x: 1250, z: -950, y: 260, r: 24 },
  { x: 900, z: -1400, y: 220, r: 22 },
  { x: 200, z: -1250, y: 200, r: 22 },
  { x: -600, z: -900, y: 180, r: 22 },
  { x: -980, z: -760, y: 150, r: 22 },
  { x: -420, z: -180, y: 130, r: 24 },
];

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7fb2e0',
  skyLow: '#cfe8f7',
  sun: '#fff3c4',
  oceanDeep: '#0b4a7a',
  ocean: '#1468a0',
  oceanShallow: '#2fa08f',
  sand: '#e8d29a',
  grass: '#4f9e4d',
  forest: '#2f7a3a',
  rock: '#7d7468',
  peak: '#cfc8bd',
  runway: '#3a3f46',
  runwayMark: '#f5f2e8',
  ring: '#ffc233',
  ringDone: '#7dff9a',
  planeBody: '#e8442e',
  planeTrim: '#f6f1e6',
  planeGlass: '#bfe6ff',
  hud: '#eaf6ff',
  hudAmber: '#ffc233',
  hudRed: '#ff5a4e',
  hudGreen: '#7dff9a',
  panel: 'rgba(8, 20, 34, 0.62)',
  text: '#eef4f8',
  muted: '#9fb4c4',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'island-hopper.best';

/** How far the camera sits behind and above the aircraft, in metres. */
export const CAMERA = { behind: 26, above: 8, lookAhead: 46, fov: 68 };
