// The entrypoint: read the sealed snapshot, score the board, render the page, write the dossier.
//
// The grader runs this on Node 22 with standard library only, a read-only /bot and a writable /output,
// twice, and both runs must write the same bytes. Outside the grader, --input and --output (or
// MAKEFUN_OUTPUT_DIR) point it at a working copy:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Nothing here reaches the network, and nothing is read from anywhere but the snapshot and this
// repository, so two runs over the same commit write the same files.

import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** This file's directory: the repository root, wherever the clone sits. */
const ROOT = dirname(fileURLToPath(import.meta.url));

/** The scorer's caps: the text cap shapes the dossier, the rest refuse a file past them. */
const CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
} as const;

const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--name value` or `--name=value` out of argv, falling back when it is absent. */
function option(name: string, fallback: string): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i]!;
    if (current === `--${name}`) return argv[i + 1] ?? fallback;
    const eq = current.indexOf('=');
    if (eq > 2 && current.startsWith('--') && current.slice(2, eq) === name) return current.slice(eq + 1);
  }
  return fallback;
}

/** Fail loudly and in one line: the grader keeps stderr. */
function die(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

/** The snapshot path: --input may name the file itself or the directory that holds it. */
function snapshotPath(): string {
  const given = option('input', '/input');
  return given.endsWith('.json') ? given : join(given, 'snapshot.json');
}

/** Copy the regular files of one directory into another, leaving dotfiles alone. */
function copyDirectory(from: string, to: string): string[] {
  let names: string[];
  try {
    names = readdirSync(from);
  } catch {
    return [];
  }
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    copied.push(name);
  }
  return copied;
}

function main(): void {
  const input = snapshotPath();
  let text: string;
  try {
    text = readFileSync(input, 'utf8');
  } catch {
    die(`no snapshot at ${input}: pass --input <snapshot.json|directory> or mount the sealed /input`);
  }

  const snapshot = parseSnapshot(text);
  const { board, radar } = buildRadar(snapshot);
  const refusal = boardIssue(board, snapshot);
  if (refusal !== null) die(`the model wrote a board the gate refuses: ${refusal}`);

  const out = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  copyDirectory(join(ROOT, 'dashboard'), join(out, 'dashboard'));
  const shots = copyDirectory(join(ROOT, 'screenshots'), join(out, 'screenshots'));
  if (shots.length < 3) die(`screenshots/ holds ${shots.length}: the gate wants 3 or 4 (the board, a detail view, a filtered view)`);
  for (const name of shots) if (!IMAGE_NAME.test(name)) die(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);

  // Last, because the scorer rebuilds this file from the same /output and compares the bytes.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

  const rows = board.length;
  const watch = snapshot.watchlist.length;
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols in the snapshot, ${watch} on the watchlist, ` +
      `${rows} ranked rows (${radar.early_size} below the floor), fit n=${radar.fit.n} slope=${radar.fit.slope}\n` +
      `token radar: wrote board.json, data.js, dashboard/, screenshots/ (${shots.length}) and dossier.json to ${out}\n`,
  );
}

main();
