// The aircraft and the rules of the sky: an arcade flight model in fixed steps,
// the three missions, landings, crashes, fuel and the score.
//
// Heading is radians, 0 = north (-z), growing clockwise. Speed is m/s; the HUD
// shows knots. The model never trusts the renderer: terrain comes from heightAt.

import { PLANE, SCORE, STEP, RINGS, ISLANDS } from './config.js';
import { heightAt, isWater, runwayAt, ringCourse } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_MISSION = 8;
export const EVENT_REFUEL = 16;
export const EVENT_DITCHED = 32;

const TWO_PI = Math.PI * 2;

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TWO_PI;
  while (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** A fresh aircraft, parked at the home runway threshold, facing down the strip. */
export function createAircraft(missionId) {
  const home = ISLANDS[0].runway;
  return {
    missionId,
    x: home.x - Math.sin((home.heading * Math.PI) / 180) * (home.length / 2 - 40),
    z: home.z + Math.cos((home.heading * Math.PI) / 180) * (home.length / 2 - 40),
    y: 2.5,
    heading: (home.heading * Math.PI) / 180,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelMax,
    damage: 0,
    score: 0,
    ringsHit: 0,
    landings: 0,
    hopsDone: [],
    missionDone: false,
    crashed: false,
    landed: true,
    airborne: false,
    time: 0,
    message: '',
    messageTimer: 0,
    rings: ringCourse(),
    targetRing: 0,
    hopTargets: ['Palm Cay', 'Coral Bay', 'Gull Island'],
    courierTarget: 'Far Atoll',
    timer: missionId === 'courier' ? 300 : 0,
  };
}

/** Where the mission wants the pilot to go next: a ring, a strip, or home. */
export function currentTarget(state) {
  if (state.missionId === 'rings') {
    if (state.targetRing < state.rings.length) {
      return { kind: 'ring', name: 'Ring ' + (state.targetRing + 1), ...state.rings[state.targetRing] };
    }
    return { kind: 'runway', ...ISLANDS[0].runway, name: 'Home Island' };
  }
  if (state.missionId === 'hop') {
    const next = state.hopTargets[state.hopsDone.length];
    if (!next) return { kind: 'runway', ...ISLANDS[0].runway, name: 'Home Island' };
    const island = ISLANDS.find((item) => item.name === next);
    return { kind: 'runway', ...island.runway, name: next };
  }
  const island = ISLANDS.find((item) => item.name === state.courierTarget);
  return { kind: 'runway', ...island.runway, name: state.courierTarget };
}

/** One fixed step of flight. `input` is { pitch, roll, throttleDelta, brake }. */
export function stepFlight(state, input, dt = STEP) {
  if (state.crashed || state.missionDone) return 0;
  let events = 0;
  state.time += dt;

  // Throttle: the lever moves, the engine answers, the fuel gauge falls.
  state.throttle = clamp(state.throttle + input.throttleDelta * dt * 1.4, 0, 1);
  if (state.fuel <= 0) state.throttle = 0;
  const burn = (PLANE.fuelBurnIdle + state.throttle * PLANE.fuelBurnFull) * dt;
  state.fuel = Math.max(0, state.fuel - (state.airborne ? burn : burn * 0.25));

  // The wing: pitch and roll answer the stick, the nose follows the bank.
  const pitchTarget = clamp(input.pitch * PLANE.maxPitch, -PLANE.maxPitch, PLANE.maxPitch);
  const rollTarget = clamp(input.roll * PLANE.maxRoll, -PLANE.maxRoll, PLANE.maxRoll);
  state.pitch += clamp(pitchTarget - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  state.roll += clamp(rollTarget - state.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
  // A right bank turns the nose right: heading grows clockwise.
  state.heading = wrapAngle(state.heading + Math.sin(state.roll) * PLANE.turnFactor * (state.speed / 60 + 0.25) * dt);

  // Speed chases the throttle; climbing costs speed, diving gives it back.
  const targetSpeed = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  const climbCost = Math.max(0, Math.sin(state.pitch)) * PLANE.climbPenalty * state.speed;
  let speed = state.speed + (targetSpeed - state.speed) * PLANE.accel * 0.02 * dt * 60;
  speed -= climbCost * dt;
  if (input.brake) speed -= 26 * dt;
  state.speed = clamp(speed, 0, PLANE.maxSpeed + 12);

  // A slow wing stalls: the nose drops and the aircraft sinks.
  let sink = 0;
  if (state.speed < PLANE.stallSpeed && state.airborne) {
    state.pitch = Math.max(state.pitch - 0.5 * dt, -0.3);
    sink = (PLANE.stallSpeed - state.speed) * 0.35;
  }

  const forwardX = Math.sin(state.heading);
  const forwardZ = -Math.cos(state.heading);
  const verticalSpeed = Math.sin(state.pitch) * state.speed - sink;
  state.x += forwardX * Math.cos(state.pitch) * state.speed * dt;
  state.z += forwardZ * Math.cos(state.pitch) * state.speed * dt;
  state.y += verticalSpeed * dt;

  // Leaving the chart: the sea goes on, the mission does not — turn back.
  const range = Math.hypot(state.x, state.z);
  if (range > 3300) {
    state.heading = wrapAngle(state.heading + Math.PI * dt * 0.4);
    state.message = 'EDGE OF THE CHART — TURN BACK';
    state.messageTimer = 1.5;
  }

  const ground = heightAt(state.x, state.z);
  const strip = runwayAt(state.x, state.z);

  // Touching down: a gentle arrival on a strip is a landing, anything else is a crash.
  if (state.y <= ground + 0.4) {
    const hard = verticalSpeed < -9 || state.speed > 78;
    const aligned = strip !== null && Math.abs(wrapAngle(state.heading - (strip.heading * Math.PI) / 180)) < 0.5;
    if (state.airborne && strip !== null && !hard && Math.abs(state.roll) < 0.35 && aligned) {
      state.y = ground + 0.4;
      state.landed = true;
      state.airborne = false;
      state.speed = Math.max(0, state.speed - 30 * dt);
      state.pitch = 0;
      state.roll = 0;
      if (!state.justLanded) {
        state.justLanded = true;
        state.landings += 1;
        state.score += SCORE.landing;
        state.fuel = PLANE.fuelMax;
        events |= EVENT_LANDED | EVENT_REFUEL;
        state.message = `TOUCHDOWN — ${strip.island.toUpperCase()} +${SCORE.landing}`;
        state.messageTimer = 3;
        if (state.missionId === 'hop' && state.hopTargets[state.hopsDone.length] === strip.island) {
          state.hopsDone.push(strip.island);
          state.score += SCORE.hopBonus;
        }
        if (state.missionId === 'rings' && state.targetRing >= state.rings.length) {
          state.missionDone = true;
          state.score += SCORE.mission;
          events |= EVENT_MISSION;
        }
        if (state.missionId === 'hop' && state.hopsDone.length >= state.hopTargets.length) {
          state.missionDone = true;
          state.score += SCORE.mission;
          events |= EVENT_MISSION;
        }
        if (state.missionId === 'courier' && strip.island === state.courierTarget) {
          state.missionDone = true;
          state.score += SCORE.mission + Math.round(state.fuel) * 5;
          events |= EVENT_MISSION;
        }
      }
    } else if (state.airborne) {
      if (isWater(state.x, state.z) && verticalSpeed > -6 && state.speed < 45) {
        state.crashed = true;
        state.y = 0.5;
        events |= EVENT_DITCHED;
        state.message = 'DITCHED IN THE LAGOON';
        state.messageTimer = 4;
      } else {
        state.crashed = true;
        state.y = ground + 0.4;
        events |= EVENT_CRASHED;
        state.message = hard ? 'CRASHED — TOO HARD ON THE GROUND' : 'CRASHED INTO TERRAIN';
        state.messageTimer = 4;
      }
    } else {
      state.y = ground + 0.4;
    }
  } else {
    state.justLanded = false;
    if (state.speed > 12) {
      state.airborne = true;
      state.landed = false;
    }
  }

  // Rings: crossing the disc of the next ring scores and lights the next one.
  if (state.missionId === 'rings' && state.targetRing < state.rings.length) {
    const ring = state.rings[state.targetRing];
    const dx = state.x - ring.x;
    const dy = state.y - ring.y;
    const dz = state.z - ring.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < ring.r + 6) {
      state.targetRing += 1;
      state.ringsHit += 1;
      state.score += SCORE.ring;
      events |= EVENT_RING;
      state.message = state.targetRing >= state.rings.length
        ? `LAST RING! BRING HER HOME +${SCORE.ring}`
        : `RING ${state.ringsHit} OF ${state.rings.length} +${SCORE.ring}`;
      state.messageTimer = 2.5;
    }
  }

  // The courier's clock.
  if (state.missionId === 'courier' && !state.missionDone) {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.timer = 0;
      state.crashed = true;
      events |= EVENT_CRASHED;
      state.message = 'OUT OF TIME — THE PARCEL NEVER ARRIVED';
      state.messageTimer = 4;
    }
  }

  // Out of fuel over the sea: glide her down and hope for the beach.
  if (state.fuel <= 0 && state.airborne && state.speed < PLANE.stallSpeed * 0.7) {
    state.message = 'FUEL EMPTY — GLIDING';
    state.messageTimer = 1;
  }

  if (state.messageTimer > 0) state.messageTimer -= dt;
  else state.message = '';
  return events;
}

/** Knots from m/s, feet from metres — what the HUD prints. */
export function knots(speedMs) {
  return Math.round(speedMs * 1.944);
}

export function feet(altitudeM) {
  return Math.round(altitudeM * 3.281);
}

export function headingDegrees(heading) {
  return Math.round(((heading * 180) / Math.PI % 360 + 360) % 360);
}
