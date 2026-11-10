import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../code/portrait-style.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: os.tmpdir() });

test('prompt CLI validates arguments and writes a deterministic batch to the requested directory', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'portrait-prompt-test-'));
  try {
    assert.equal(run('--help').status, 0);
    assert.equal(run('prompt').status, 1);
    assert.equal(run('prompt', 'X:unknown').status, 1);
    assert.equal(run('batch', output, '../outside:feminine').status, 1);
    assert.deepEqual(fs.readdirSync(output), []);
    const name = 'Example:feminine:young';
    const prompt = run('prompt', name);
    assert.equal(prompt.status, 0);
    assert.match(prompt.stdout, /no beard, no moustache, no stubble/);
    assert.match(prompt.stdout, /Target top headroom of 7%/);
    assert.equal(run('cards', name).status, 0);
    assert.equal(run('batch', output, name).status, 0);
    assert.equal(fs.readFileSync(path.join(output, 'Example.txt'), 'utf8') + '\n', prompt.stdout);
    const snapshot = JSON.parse(fs.readFileSync(path.join(output, '_signatures.json'), 'utf8'));
    assert.equal(snapshot.length, 1);
    assert.equal(snapshot[0].gender, 'feminine');
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
