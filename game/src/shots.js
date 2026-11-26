// The screenshot scenes behind ?shot=title|cover|approach|rings. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (bank toward the target, climb or descend toward its height,
// hold the throttle near cruise), so the frame is what real play looks like and
// the same seed always gives the same frame.

import { STEP } from './config.js';
import { createAircraft, stepFlight, currentTarget } from './flight.js';
import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Steer toward the mission target and hold a cruise altitude above it. */
function autopilot(state) {
  const target = currentTarget(state);
  const dx = target.x - state.x;
  const dz = target.z - state.z;
  const wantedHeading = Math.atan2(dx, -dz);
  const headingError = wrapAngle(wantedHeading - state.heading);
  const targetAlt = target.kind === 'ring' ? target.y + 6 : 150;
  const altError = targetAlt - state.y;
  return {
    pitch: clamp(altError / 60, -0.8, 0.8),
    roll: clamp(headingError * 1.4, -1, 1),
    throttleDelta: state.speed < 68 ? 1 : state.speed > 78 ? -1 : 0,
    brake: false,
  };
}

/** Run the world forward `seconds` under the autopilot, one fixed step at a time. */
function flyForward(state, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    stepFlight(state, autopilot(state));
    if (state.crashed || state.missionDone) break;
  }
}

/**
 * Set `state` to the named scene and return the screen to draw over it.
 * Scenes: title (parked on the home strip), cover (mid ring-run, a ring ahead),
 * approach (final approach to the home runway), rings (deep in the course).
 */
export function stageShot(name, state) {
  if (name === 'title') {
    const fresh = createAircraft('rings');
    Object.assign(state, fresh);
    return { screen: SCREEN_TITLE };
  }
  if (name === 'approach') {
    const fresh = createAircraft('rings');
    Object.assign(state, fresh);
    // All rings done: the autopilot flies the final to the home runway, not the course.
    state.targetRing = state.rings.length;
    // On final: 900 m out, 130 m up, lined up with Runway 09, gear-speed flight.
    state.x = -950;
    state.z = 60;
    state.y = 132;
    state.heading = Math.PI / 2;
    state.speed = 58;
    state.throttle = 0.45;
    state.airborne = true;
    state.landed = false;
    state.message = 'FINAL — RUNWAY 09 AHEAD';
    state.messageTimer = 99;
    flyForward(state, 5);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'rings') {
    const fresh = createAircraft('rings');
    Object.assign(state, fresh);
    state.throttle = 0.7;
    flyForward(state, 21);
    return { screen: SCREEN_PLAY };
  }
  // cover: the hero frame — rings ahead, islands and sea below, HUD lit.
  const fresh = createAircraft('rings');
  Object.assign(state, fresh);
  state.throttle = 0.7;
  flyForward(state, 15);
  return { screen: SCREEN_PLAY };
}
