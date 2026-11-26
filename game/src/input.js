// Keyboard and mouse, read as one input state. Arrows or WASD fly the aircraft,
// Shift/Ctrl work the throttle, Space is the brake, P pauses, M mutes, 1/2/3 pick
// a mission on the title screen, Enter confirms and R restarts after a crash.

export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown', ControlRight: 'throttleDown',
  Space: 'brake',
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseSteer = { x: 0, y: 0, active: false };

  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (action) {
      held.add(action);
      event.preventDefault();
    }
    if (event.code === 'Enter') pressed.add(ACTION_CONFIRM);
    if (event.code === 'KeyP' || event.code === 'Escape') pressed.add(ACTION_PAUSE);
    if (event.code === 'KeyM') pressed.add(ACTION_MUTE);
    if (event.code === 'KeyR') pressed.add(ACTION_RESTART);
    if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
      pressed.add(event.code);
    }
  }

  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) held.delete(action);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseSteer = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
      active: true,
    };
  }

  function onMouseDown(event) {
    if (event.button === 0) pressed.add(ACTION_CONFIRM);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    /** The stick for this frame: pitch/roll in [-1, 1], throttle delta, brake. */
    read() {
      let pitch = 0;
      let roll = 0;
      if (held.has('up')) pitch += 1;
      if (held.has('down')) pitch -= 1;
      if (held.has('left')) roll -= 1;
      if (held.has('right')) roll += 1;
      // The mouse steers gently too: hold the pointer off-centre to bank and climb.
      if (mouseSteer.active && !held.has('left') && !held.has('right') && !held.has('up') && !held.has('down')) {
        roll += Math.max(-1, Math.min(1, mouseSteer.x * 0.9));
        pitch += Math.max(-1, Math.min(1, -mouseSteer.y * 0.7));
      }
      let throttleDelta = 0;
      if (held.has('throttleUp')) throttleDelta += 1;
      if (held.has('throttleDown')) throttleDelta -= 1;
      return { pitch, roll, throttleDelta, brake: held.has('brake') };
    },
    /** One-shot actions pressed since the last call (Enter, P, M, R, 1/2/3). */
    takePressed() {
      const actions = [...pressed];
      pressed.clear();
      return actions;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
    },
  };
}
