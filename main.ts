// Island Hopper — the hand-in program for best-flight-game-20261126-0057.
//
// The game itself is plain static files under game/ (game/index.html plus its ES
// modules, no library, no network request) and plays offline in a desktop browser.
// This program copies game/ and screenshots/ from beside this file into /output
// and writes /output/dossier.json, the summary the judge reads, using the vendored
// make.fun library. Node 22, standard library only.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game locally while developing with `node serve.ts`, then open
// http://localhost:8080 in desktop Chrome.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps: only text_max_bytes shapes the bytes; the rest refuse an
// entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more
// than 993 files in game/ or 48 MiB of game files in all, or a path under game/
// over 1000 bytes; game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1;
  }
  return total;
}

function handIn() {
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }
  const dossier = buildDossier(out, DOSSIER_OPTIONS);
  // The grader runs this program twice and demands byte-identical output, so
  // prove the build reproduces itself: build it a second time from the same
  // inputs, before anything is written, and refuse to hand in a mismatch.
  // (The second build must run before dossier.json exists in the output,
  // because the library reads the output directory when it builds. The
  // library returns a Buffer, so compare bytes, not object identity.)
  const again = buildDossier(out, DOSSIER_OPTIONS);
  if (!Buffer.from(again).equals(Buffer.from(dossier))) {
    throw new Error('dossier.json is not deterministic: the second build differs from the first');
  }
  writeFileSync(join(out, 'dossier.json'), dossier);
  const shots = existsSync(join(out, 'screenshots')) ? readdirSync(join(out, 'screenshots')) : [];
  console.log(`handed in ${countFiles(join(out, 'game'))} game file(s) and ${shots.length} screenshot(s) to ${out}`);
}

handIn();
