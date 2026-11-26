// The picture: a software 3D renderer on one 2D canvas. The camera chases the
// aircraft, the terrain is a projected grid of height samples, rings and runways
// are projected shapes, and the HUD is drawn on top — altitude, speed, heading,
// attitude, throttle, fuel, the mission objective and a compass.
//
// Screens: title, play, paused, over (crash / ditched / out of time) and done
// (mission complete). Every screen is drawn over the live 3D view.

import { FIELD, PALETTE, FONT, CAMERA, ISLANDS, MISSIONS } from './config.js';
import { heightAt } from './terrain.js';
import { valueNoise } from './random.js';
import { knots, feet, headingDegrees, currentTarget } from './flight.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_DONE = 'done';

const W = FIELD.width;
const H = FIELD.height;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const out = pa.map((v, i) => Math.round(lerp(v, pb[i], t)));
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}

function shadeRgb(rgb, factor) {
  const parts = rgb.replace(/[^\d,]/g, '').split(',').map(Number);
  return `rgb(${parts.map((v) => Math.min(255, Math.round(v * factor))).join(',')})`;
}
function terrainColor(height, slope, wx, wz) {
  let base;
  if (height <= 1.5) base = PALETTE.oceanDeep;
  else if (height <= 3.2) base = PALETTE.oceanShallow;
  else if (height <= 6) base = PALETTE.sand;
  else if (height <= 34) base = PALETTE.grass;
  else if (height <= 62) base = PALETTE.forest;
  else if (height <= 96) base = PALETTE.rock;
  else base = PALETTE.peak;
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  let shade = clamp(0.92 + slope * 0.12, 0.85, 1.05);
  if (height <= 3.2) {
    // The sea is never one flat colour: swell and shallows shift it in patches.
    shade *= 0.82 + valueNoise(wx, wz, 320) * 0.3 + valueNoise(wx + 500, wz - 300, 90) * 0.1;
  }
  return `rgb(${Math.min(255, Math.round(r * shade))},${Math.min(255, Math.round(g * shade))},${Math.min(255, Math.round(b * shade))})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const focal = (H / 2) / Math.tan(((CAMERA.fov / 2) * Math.PI) / 180);

  function project(camera, wx, wy, wz) {
    const dx = wx - camera.x;
    const dy = wy - camera.y;
    const dz = wz - camera.z;
    const zc = dx * camera.fwdX + dy * camera.fwdY + dz * camera.fwdZ;
    if (zc < 2) return null;
    const xc = dx * camera.rightX + dy * camera.rightY + dz * camera.rightZ;
    const yc = dx * camera.upX + dy * camera.upY + dz * camera.upZ;
    return { x: W / 2 + (xc * focal) / zc, y: H / 2 - (yc * focal) / zc, depth: zc };
  }

  function cameraFor(state) {
    // The camera looks down a little further than the nose, so the ground fills
    // the lower frame instead of a flat band of sea — but parked on the strip
    // it pulls back and up, so the runway runs away ahead of the aircraft.
    const parked = !state.airborne && state.speed < 1;
    const behind = parked ? 45 : CAMERA.behind;
    const above = parked ? 30 : CAMERA.above;
    const lookDown = parked ? 0.28 : 0.07 + 0.09 * clamp(state.y / 120, 0, 1);
    const pitch = state.pitch * 0.55 - lookDown;
    const fwdX = Math.sin(state.heading) * Math.cos(pitch);
    const fwdY = Math.sin(pitch);
    const fwdZ = -Math.cos(state.heading) * Math.cos(pitch);
    // Right = forward x world-up, up = right x forward.
    let rightX = -fwdZ;
    let rightY = 0;
    let rightZ = fwdX;
    const rightLen = Math.hypot(rightX, rightY, rightZ) || 1;
    rightX /= rightLen;
    rightY /= rightLen;
    rightZ /= rightLen;
    const upX = rightY * fwdZ - rightZ * fwdY;
    const upY = rightZ * fwdX - rightX * fwdZ;
    const upZ = rightX * fwdY - rightY * fwdX;
    const camX = state.x - fwdX * behind + upX * above;
    const camY = state.y - fwdY * behind + upY * above;
    const camZ = state.z - fwdZ * behind + upZ * above;
    return { x: camX, y: camY, z: camZ, fwdX, fwdY, fwdZ, rightX, rightY, rightZ, upX, upY, upZ, pitch };
  }

  function drawSky(camera) {
    // The horizon sits above the centre when the camera looks down, below it
    // when it looks up: screenY = centre + tan(pitch) * focal.
    const horizonY = H / 2 + Math.tan(camera.pitch) * focal;
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
    // The sun, fixed in the west sky.
    const sunDir = { x: -0.55, y: 0.5, z: 0.45 };
    const sun = project(camera, camera.x + sunDir.x * 4000, camera.y + sunDir.y * 4000, camera.z + sunDir.z * 4000);
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      glow.addColorStop(0, 'rgba(255, 243, 196, 0.95)');
      glow.addColorStop(0.25, 'rgba(255, 230, 150, 0.55)');
      glow.addColorStop(1, 'rgba(255, 230, 150, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 140, sun.y - 140, 280, 280);
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // The sea meets the sky at the horizon.
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(0, Math.max(0, horizonY), W, H - Math.max(0, horizonY));
    return horizonY;
  }

  const GRID_ROWS = [12, 22, 36, 55, 80, 115, 160, 215, 280, 355, 445, 550, 670, 810, 970, 1150, 1360];

  function drawTerrain(camera, horizonY) {
    for (let row = GRID_ROWS.length - 1; row >= 0; row -= 1) {
      const zc = GRID_ROWS[row];
      const halfSpan = 55 + zc * 0.62;
      const steps = 26;
      const points = [];
      for (let col = 0; col <= steps; col += 1) {
        const xc = -halfSpan + (2 * halfSpan * col) / steps;
        const wx = camera.x + camera.fwdX * zc + camera.rightX * xc;
        const wz = camera.z + camera.fwdZ * zc + camera.rightZ * xc;
        const wy = heightAt(wx, wz);
        points.push({ p: project(camera, wx, wy, wz), height: wy, wx, wz });
      }
      const nextRow = row + 1 < GRID_ROWS.length ? GRID_ROWS[row + 1] : null;
      for (let col = 0; col < steps; col += 1) {
        const a = points[col];
        const b = points[col + 1];
        if (!a.p || !b.p) continue;
        let c = null;
        let d = null;
        if (nextRow !== null) {
          const halfNext = 55 + nextRow * 0.62;
          const xcA = -halfNext + (2 * halfNext * col) / steps;
          const xcB = -halfNext + (2 * halfNext * (col + 1)) / steps;
          const wxA = camera.x + camera.fwdX * nextRow + camera.rightX * xcA;
          const wzA = camera.z + camera.fwdZ * nextRow + camera.rightZ * xcA;
          const wxB = camera.x + camera.fwdX * nextRow + camera.rightX * xcB;
          const wzB = camera.z + camera.fwdZ * nextRow + camera.rightZ * xcB;
          c = { p: project(camera, wxB, heightAt(wxB, wzB), wzB), height: heightAt(wxB, wzB) };
          d = { p: project(camera, wxA, heightAt(wxA, wzA), wzA), height: heightAt(wxA, wzA) };
        }
        const avgHeight = (a.height + b.height) / 2;
        const slope = clamp(Math.abs(heightAt(a.wx + 30, a.wz) - a.height) / 30, 0, 1);
        let color = terrainColor(avgHeight, slope, a.wx, a.wz);
        if (avgHeight <= 3.2) {
          // Shallow water over sand near the shore, then swell patches on top.
          color = mixColor(PALETTE.oceanShallow, PALETTE.ocean, clamp((3.2 - avgHeight) / 4.5, 0, 1));
          color = shadeRgb(color, 0.84 + valueNoise(a.wx, a.wz, 320) * 0.28 + valueNoise(a.wx + 500, a.wz - 300, 90) * 0.08);
        }
        const haze = clamp((zc - 500) / 900, 0, 0.55);
        if (haze > 0) color = mixColor(color, PALETTE.skyLow, haze);
        ctx.fillStyle = color;
        // Each quad is drawn a fraction of a pixel past its corners, so the
        // anti-aliased edges of neighbours overlap instead of leaving seams.
        const expand = (p, q) => {
          const cx = (a.p.x + b.p.x) / 2;
          const cy = (a.p.y + b.p.y) / 2;
          return { x: p.x + (p.x - cx) * 0.004, y: p.y + (p.y - cy) * 0.004 };
        };
        const pa = expand(a.p);
        const pb = expand(b.p);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        if (c && c.p && d && d.p) {
          const pc = expand(c.p);
          const pd = expand(d.p);
          ctx.lineTo(pc.x, pc.y);
          ctx.lineTo(pd.x, pd.y);
        } else {
          ctx.lineTo(pb.x, horizonY + 40);
          ctx.lineTo(pa.x, horizonY + 40);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /**
   * A runway as a chain of short quads along its centreline, each drawn on its
   * own: the strip runs past the camera on takeoff and on final, and a quad
   * with a corner behind the camera is skipped instead of hiding the strip.
   */
  function drawRunway(camera, runway) {
    const heading = (runway.heading * Math.PI) / 180;
    const dirX = Math.sin(heading);
    const dirZ = -Math.cos(heading);
    const perpX = Math.cos(heading);
    const perpZ = Math.sin(heading);
    const halfLen = runway.length / 2;
    const halfWid = runway.width / 2;
    const step = 30;
    ctx.fillStyle = PALETTE.runway;
    for (let s = -halfLen; s < halfLen; s += step) {
      const a = s;
      const b = Math.min(s + step, halfLen);
      const corners = [
        [runway.x + dirX * a - perpX * halfWid, runway.z + dirZ * a - perpZ * halfWid],
        [runway.x + dirX * b - perpX * halfWid, runway.z + dirZ * b - perpZ * halfWid],
        [runway.x + dirX * b + perpX * halfWid, runway.z + dirZ * b + perpZ * halfWid],
        [runway.x + dirX * a + perpX * halfWid, runway.z + dirZ * a + perpZ * halfWid],
      ].map(([x, z]) => project(camera, x, 2.6, z));
      if (corners.some((p) => p === null)) continue;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (const p of corners.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fill();
    }
    // Centreline dashes.
    ctx.strokeStyle = PALETTE.runwayMark;
    ctx.lineWidth = 2;
    for (let d = -halfLen + 20; d < halfLen - 10; d += 40) {
      const p1 = project(camera, runway.x + dirX * d, 2.7, runway.z + dirZ * d);
      const p2 = project(camera, runway.x + dirX * (d + 18), 2.7, runway.z + dirZ * (d + 18));
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  function drawRing(camera, ring, isNext) {
    const points = [];
    for (let i = 0; i <= 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      // Rings stand vertical, facing along the course (roughly east-west here).
      const px = ring.x + Math.cos(angle) * ring.r * 0.35;
      const py = ring.y + Math.sin(angle) * ring.r;
      const pz = ring.z + Math.cos(angle) * ring.r * 0.9;
      const p = project(camera, px, py, pz);
      if (p) points.push(p);
    }
    if (points.length < 3) return;
    ctx.save();
    ctx.globalAlpha = isNext ? 0.95 : 0.45;
    ctx.strokeStyle = isNext ? PALETTE.ring : PALETTE.ringDone;
    ctx.lineWidth = isNext ? 6 : 3;
    ctx.shadowColor = isNext ? PALETTE.ring : 'transparent';
    ctx.shadowBlur = isNext ? 18 : 0;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawClouds(camera, clouds) {
    const projected = clouds
      .map((cloud) => ({ cloud, p: project(camera, cloud.x, cloud.y, cloud.z) }))
      .filter((item) => item.p && item.p.depth > 30)
      .sort((a, b) => b.p.depth - a.p.depth);
    for (const { cloud, p } of projected) {
      // A cloud's width on screen, in pixels, from its real size and distance.
      const pxSize = (cloud.size * focal) / p.depth;
      if (pxSize < 6) continue;
      ctx.fillStyle = `rgba(255,255,255,${clamp(0.85 - p.depth / 2600, 0.25, 0.85)})`;
      for (let i = 0; i < cloud.puffs; i += 1) {
        const ox = (i - cloud.puffs / 2) * pxSize * 0.24;
        const oy = Math.sin(i * 2.3) * pxSize * 0.05;
        ctx.beginPath();
        ctx.ellipse(p.x + ox, p.y + oy, pxSize * 0.3, pxSize * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawAircraftShadow(camera, state) {
    const ground = heightAt(state.x, state.z);
    const p = project(camera, state.x, ground + 1, state.z);
    if (!p) return;
    const alt = Math.max(1, state.y - ground);
    const size = clamp(70 - alt * 0.1, 10, 70);
    ctx.fillStyle = `rgba(6, 20, 30, ${clamp(0.22 - alt * 0.0005, 0.04, 0.22)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The aircraft itself, rear chase view, banking with the roll. */
  function drawAircraft(state, yOffset = 0) {
    const cx = W / 2;
    const cy = H * 0.58 + yOffset;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.roll * 0.85);
    ctx.scale(1.05, 1.05);
    // Wings, with white tips and navigation lights.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-14, 6);
    ctx.lineTo(-148, 26);
    ctx.lineTo(-152, 38);
    ctx.lineTo(-12, 30);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 6);
    ctx.lineTo(148, 26);
    ctx.lineTo(152, 38);
    ctx.lineTo(12, 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.fillRect(-152, 26, 22, 12);
    ctx.fillRect(130, 26, 22, 12);
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-152, 32, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#39d353';
    ctx.beginPath();
    ctx.arc(152, 32, 4, 0, Math.PI * 2);
    ctx.fill();
    // Fuselage, narrowing away from the camera.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(0, -96);
    ctx.quadraticCurveTo(20, -60, 24, -8);
    ctx.lineTo(26, 42);
    ctx.quadraticCurveTo(0, 54, -26, 42);
    ctx.lineTo(-24, -8);
    ctx.quadraticCurveTo(-20, -60, 0, -96);
    ctx.fill();
    // White cheatline down the fuselage.
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.beginPath();
    ctx.moveTo(-4, -88);
    ctx.lineTo(4, -88);
    ctx.lineTo(7, 44);
    ctx.lineTo(-7, 44);
    ctx.closePath();
    ctx.fill();
    // Canopy glass.
    ctx.fillStyle = PALETTE.planeGlass;
    ctx.beginPath();
    ctx.ellipse(0, -58, 11, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tailplane and fin, closest to the camera.
    ctx.fillStyle = PALETTE.planeBody;
    ctx.beginPath();
    ctx.moveTo(-10, 40);
    ctx.lineTo(-72, 56);
    ctx.lineTo(-70, 66);
    ctx.lineTo(-8, 56);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, 40);
    ctx.lineTo(72, 56);
    ctx.lineTo(70, 66);
    ctx.lineTo(8, 56);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-8, 44);
    ctx.lineTo(0, 84);
    ctx.lineTo(8, 44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.planeTrim;
    ctx.fillRect(-3, 44, 6, 34);
    ctx.restore();
  }

  // ---- HUD ----

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
  }

  function drawCompass(state) {
    const heading = headingDegrees(state.heading);
    const labels = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    panel(W / 2 - 190, 14, 380, 44);
    ctx.save();
    ctx.beginPath();
    ctx.rect(W / 2 - 190, 14, 380, 44);
    ctx.clip();
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '600 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let offset = -180; offset <= 180; offset += 15) {
      const deg = ((heading + offset) % 360 + 360) % 360;
      const x = W / 2 + offset * 2.1;
      const label = labels.find(([d]) => d === deg);
      ctx.fillStyle = label ? PALETTE.hudAmber : PALETTE.hud;
      ctx.font = label ? '700 16px ' + FONT : '500 12px ' + FONT;
      ctx.fillText(label ? label[1] : String(deg), x, 36);
      ctx.fillRect(x - 1, 18, 2, label ? 8 : 5);
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 7, 14);
    ctx.lineTo(W / 2 + 7, 14);
    ctx.lineTo(W / 2, 24);
    ctx.closePath();
    ctx.fill();
  }

  function drawTapes(state) {
    // Speed, left: knots. Altitude, right: feet, with vertical speed.
    const speed = knots(state.speed);
    panel(18, 84, 96, 150);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('SPEED', 28, 100);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '700 30px ' + FONT;
    ctx.fillText(String(speed), 28, 132);
    ctx.font = '600 12px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('KNOTS', 28, 152);
    ctx.fillStyle = state.speed < 30 && state.airborne ? PALETTE.hudRed : PALETTE.hudGreen;
    ctx.font = '700 13px ' + FONT;
    ctx.fillText(state.speed < 30 && state.airborne ? 'STALL' : 'FLYING', 28, 176);
    ctx.fillText('THR ' + Math.round(state.throttle * 100) + '%', 28, 196);
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(28, 208, 76, 8);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fillRect(28, 208, 76 * state.throttle, 8);

    const alt = feet(state.y);
    panel(W - 114, 84, 96, 150);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 11px ' + FONT;
    ctx.fillText('ALTITUDE', W - 104, 100);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '700 30px ' + FONT;
    ctx.fillText(String(alt), W - 104, 132);
    ctx.font = '600 12px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('FEET', W - 104, 152);
    const vspeed = Math.round(Math.sin(state.pitch) * state.speed * 196.85);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '700 13px ' + FONT;
    ctx.fillText('V/S ' + (vspeed >= 0 ? '+' : '') + vspeed + ' FPM', W - 104, 176);
    ctx.fillText('HDG ' + String(headingDegrees(state.heading)).padStart(3, '0') + '°', W - 104, 196);
    const agl = feet(Math.max(0, state.y - heightAt(state.x, state.z)));
    ctx.fillStyle = agl < 500 && state.airborne ? PALETTE.hudRed : PALETTE.hudGreen;
    ctx.fillText('AGL ' + agl + ' FT', W - 104, 216);
  }

  function drawAttitude(state) {
    const cx = 92;
    const cy = H - 108;
    const radius = 62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.roll);
    const pitchOffset = state.pitch * radius * 1.4;
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-radius, -radius + pitchOffset, radius * 2, radius - pitchOffset);
    ctx.fillStyle = '#8a6b46';
    ctx.fillRect(-radius, pitchOffset, radius * 2, radius - pitchOffset + radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i += 1) {
      const y = pitchOffset + i * 18;
      ctx.beginPath();
      ctx.moveTo(-22, y);
      ctx.lineTo(22, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = PALETTE.hud;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings marker.
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.lineTo(cx - 10, cy + 4);
    ctx.lineTo(cx - 34, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 34, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx + 10, cy + 4);
    ctx.lineTo(cx + 34, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', cx, cy + radius + 16);
  }

  function drawGauges(state) {
    const x = W - 214;
    const y = H - 118;
    panel(x, y, 196, 100);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 11px ' + FONT;
    ctx.fillText('FUEL', x + 12, y + 20);
    ctx.fillStyle = state.fuel < 25 ? PALETTE.hudRed : PALETTE.hudGreen;
    ctx.font = '700 20px ' + FONT;
    ctx.fillText(Math.round(state.fuel) + '%', x + 12, y + 44);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 76, y + 30, 108, 10);
    ctx.fillStyle = state.fuel < 25 ? PALETTE.hudRed : PALETTE.hudGreen;
    ctx.fillRect(x + 76, y + 30, 108 * (state.fuel / 100), 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 11px ' + FONT;
    ctx.fillText('SCORE', x + 12, y + 68);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '700 20px ' + FONT;
    ctx.fillText(String(state.score), x + 76, y + 68);
    if (state.missionId === 'courier') {
      ctx.fillStyle = state.timer < 60 ? PALETTE.hudRed : PALETTE.hud;
      ctx.font = '700 16px ' + FONT;
      ctx.fillText('TIME ' + Math.floor(state.timer / 60) + ':' + String(Math.floor(state.timer % 60)).padStart(2, '0'), x + 12, y + 92);
    } else {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '600 11px ' + FONT;
      ctx.fillText(state.missionId === 'rings' ? `RINGS ${state.ringsHit}/8` : `HOPS ${state.hopsDone.length}/3`, x + 12, y + 92);
    }
  }

  function drawObjective(state) {
    const target = currentTarget(state);
    const dx = target.x - state.x;
    const dz = target.z - state.z;
    const distance = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, -dz);
    const relative = ((bearing - state.heading) * 180) / Math.PI;
    const wrapped = ((relative + 540) % 360) - 180;
    const mission = MISSIONS.find((m) => m.id === state.missionId);
    panel(18, 14, 300, 58);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = '700 14px ' + FONT;
    ctx.fillText(mission.name + '  ·  ' + target.name.toUpperCase(), 30, 34);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '500 13px ' + FONT;
    const what = target.kind === 'ring'
      ? `Ring ${state.targetRing + 1} of 8 — ${Math.round(distance)} m`
      : `Land on ${target.name} — ${Math.round(distance)} m`;
    ctx.fillText(what, 30, 56);
    // Steering chevron toward the target.
    ctx.save();
    ctx.translate(W / 2, 92);
    ctx.rotate(clamp(wrapped, -60, 60) * (Math.PI / 180));
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 6);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(wrapped > 10 ? 'TURN RIGHT' : wrapped < -10 ? 'TURN LEFT' : 'ON COURSE', W / 2, 116);
  }

  function drawMessage(state) {
    if (!state.message) return;
    ctx.font = '700 22px ' + FONT;
    ctx.textAlign = 'center';
    const width = ctx.measureText(state.message).width + 36;
    panel(W / 2 - width / 2, H - 190, width, 40);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fillText(state.message, W / 2, H - 163);
  }

  function drawReticle() {
    ctx.strokeStyle = 'rgba(234, 246, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.42, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 - 20, H * 0.42);
    ctx.lineTo(W / 2 - 12, H * 0.42);
    ctx.moveTo(W / 2 + 12, H * 0.42);
    ctx.lineTo(W / 2 + 20, H * 0.42);
    ctx.moveTo(W / 2, H * 0.42 - 20);
    ctx.lineTo(W / 2, H * 0.42 - 12);
    ctx.moveTo(W / 2, H * 0.42 + 12);
    ctx.lineTo(W / 2, H * 0.42 + 20);
    ctx.stroke();
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(6, 18, 30, 0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '800 64px ' + FONT;
    ctx.fillText('ISLAND HOPPER', W / 2, 150);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = '600 20px ' + FONT;
    ctx.fillText('A tiny airline over a big blue sea — fly rings, hop islands, mind the fuel', W / 2, 188);
    const boxY = 240;
    panel(W / 2 - 330, boxY, 660, 250);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '700 16px ' + FONT;
    ctx.fillText('PICK A SORTIE — PRESS 1, 2 OR 3', W / 2, boxY + 34);
    MISSIONS.forEach((mission, index) => {
      const y = boxY + 74 + index * 58;
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = '700 22px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText(mission.key, W / 2 - 300, y);
      ctx.fillStyle = PALETTE.hud;
      ctx.font = '700 19px ' + FONT;
      ctx.fillText(mission.name, W / 2 - 268, y);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '500 15px ' + FONT;
      ctx.fillText(mission.tag, W / 2 - 268, y + 22);
    });
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('Arrows / WASD — pitch & bank   ·   Shift / Ctrl — throttle   ·   Space — brake', W / 2, 528);
    ctx.fillText('Mouse steers too   ·   P — pause   ·   M — sound   ·   Best score: ' + best, W / 2, 554);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '700 18px ' + FONT;
    ctx.fillText('Press ENTER to fly the Ring Run', W / 2, 596);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(6, 18, 30, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '800 52px ' + FONT;
    ctx.fillText('PAUSED', W / 2, H / 2 - 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 18px ' + FONT;
    ctx.fillText('Press P to keep flying — R restarts the sortie', W / 2, H / 2 + 30);
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(20, 6, 6, 0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudRed;
    ctx.font = '800 52px ' + FONT;
    ctx.fillText(state.message || 'CRASHED', W / 2, H / 2 - 60);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '600 22px ' + FONT;
    ctx.fillText('Score ' + state.score + '   ·   Best ' + Math.max(best, state.score), W / 2, H / 2 - 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 18px ' + FONT;
    ctx.fillText('Press R to fly again — Enter for the title screen', W / 2, H / 2 + 30);
  }

  function drawDone(state, best) {
    ctx.fillStyle = 'rgba(6, 26, 14, 0.5)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudGreen;
    ctx.font = '800 52px ' + FONT;
    ctx.fillText('MISSION COMPLETE', W / 2, H / 2 - 60);
    ctx.fillStyle = PALETTE.hud;
    ctx.font = '600 22px ' + FONT;
    const mission = MISSIONS.find((m) => m.id === state.missionId);
    ctx.fillText(mission.name + ' — score ' + state.score + '   ·   Best ' + Math.max(best, state.score), W / 2, H / 2 - 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '500 18px ' + FONT;
    ctx.fillText('Press R to fly it again — Enter for the title screen', W / 2, H / 2 + 30);
  }

  /** Paint one frame: the 3D world, then the HUD, then the screen overlay. */
  function draw(state, screen, extras) {
    const camera = cameraFor(state);
    const horizonY = drawSky(camera);
    drawTerrain(camera, horizonY);
    // Runways near the camera, nearest last so near strips draw over far ones.
    const runways = ISLANDS.filter((i) => i.runway)
      .map((i) => i.runway)
      .filter((r) => Math.hypot(r.x - state.x, r.z - state.z) < 2200)
      .sort((a, b) => Math.hypot(b.x - state.x, b.z - state.z) - Math.hypot(a.x - state.x, a.z - state.z));
    for (const runway of runways) drawRunway(camera, runway);
    if (state.missionId === 'rings') {
      for (const ring of state.rings) {
        if (ring.index < state.targetRing) continue;
        if (Math.hypot(ring.x - state.x, ring.z - state.z) > 2400) continue;
        drawRing(camera, ring, ring.index === state.targetRing);
      }
    }
    drawClouds(camera, extras.clouds);
    drawAircraftShadow(camera, state);
    drawAircraft(state, extras.planeY || 0);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      drawCompass(state);
      drawTapes(state);
      drawAttitude(state);
      drawGauges(state);
      drawObjective(state);
      drawReticle();
      drawMessage(state);
      if (extras.hint) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = '500 14px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText(extras.hint, W / 2, H - 24);
      }
    }
    if (screen === SCREEN_TITLE) drawTitle(state, extras.best);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawOver(state, extras.best);
    if (screen === SCREEN_DONE) drawDone(state, extras.best);
  }

  return { draw };
}
