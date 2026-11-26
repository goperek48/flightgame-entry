// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play, paused,
// over and done (mission complete).
//
// ?seed=N fixes the weather and the ring course. ?shot=title|cover|approach|rings
// (with &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.

import { BEST_KEY, FIELD, STEP, MISSIONS } from './config.js';
import { createRandom } from './random.js';
import { makeClouds } from './terrain.js';
import { createAircraft, stepFlight, EVENT_RING, EVENT_LANDED, EVENT_CRASHED, EVENT_MISSION, EVENT_DITCHED } from './flight.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART } from './input.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_DONE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
// The renderer draws in a fixed 1280x720 logical area; set the backing store
// here so both the game and the ?shot= scenes paint at full size.
canvas.width = FIELD.width;
canvas.height = FIELD.height;
const random = createRandom(seed);
const clouds = makeClouds(random);
const state = createAircraft('rings');
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, state);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, { clouds, best: readBest(), hint: '', planeY: scene.screen === SCREEN_TITLE ? 72 : 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let lastTime = performance.now();
  let selectedMission = 'rings';
  let hintUntil = 0;

  function startMission(missionId) {
    const fresh = createAircraft(missionId);
    Object.assign(state, fresh);
    selectedMission = missionId;
    screen = SCREEN_PLAY;
    hintUntil = state.time + 14;
    audio.unlock();
    audio.click();
    status.textContent = 'Flying ' + MISSIONS.find((m) => m.id === missionId).name;
  }

  function handleEvents(events) {
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_LANDED) audio.land();
    if (events & (EVENT_CRASHED | EVENT_DITCHED)) audio.crash();
    if (events & EVENT_MISSION) audio.mission();
    if (state.crashed) {
      screen = SCREEN_OVER;
      if (state.score > best) {
        best = state.score;
        saveBest(best);
      }
      status.textContent = 'Flight over. Score ' + state.score;
    } else if (state.missionDone) {
      screen = SCREEN_DONE;
      if (state.score > best) {
        best = state.score;
        saveBest(best);
      }
      status.textContent = 'Mission complete. Score ' + state.score;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = Math.min((now - lastTime) / 1000, MAX_FRAME);
    lastTime = now;
    const pressed = input.takePressed();
    if (pressed.includes(ACTION_MUTE)) {
      audio.unlock();
      audio.toggleMute();
    }
    if (screen === SCREEN_TITLE) {
      if (pressed.includes('Digit1')) startMission('rings');
      else if (pressed.includes('Digit2')) startMission('hop');
      else if (pressed.includes('Digit3')) startMission('courier');
      else if (pressed.includes(ACTION_CONFIRM)) startMission(selectedMission);
    } else if (screen === SCREEN_PLAY) {
      if (pressed.includes(ACTION_PAUSE)) {
        screen = SCREEN_PAUSED;
        audio.click();
      } else {
        accumulator += elapsed;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const events = stepFlight(state, input.read());
          if (events) handleEvents(events);
          if (screen !== SCREEN_PLAY) break;
        }
        audio.update(state.throttle, state.speed, state.airborne);
      }
    } else if (screen === SCREEN_PAUSED) {
      if (pressed.includes(ACTION_PAUSE) || pressed.includes(ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        audio.click();
      } else if (pressed.includes(ACTION_RESTART)) {
        startMission(selectedMission);
      }
    } else if (screen === SCREEN_OVER || screen === SCREEN_DONE) {
      if (pressed.includes(ACTION_RESTART)) startMission(selectedMission);
      else if (pressed.includes(ACTION_CONFIRM)) screen = SCREEN_TITLE;
    }
    const hint = screen === SCREEN_PLAY && state.time < hintUntil && !state.airborne
      ? 'Hold SHIFT to spool up — then pull UP to climb, steer with LEFT / RIGHT'
      : '';
    renderer.draw(state, screen, { clouds, best, hint, planeY: screen === SCREEN_TITLE ? 72 : 0 });
  }

  canvas.width = 1280;
  canvas.height = 720;
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
