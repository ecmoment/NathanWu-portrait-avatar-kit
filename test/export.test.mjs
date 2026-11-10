import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { unzipSync } from 'fflate';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = path.join(ROOT, 'code/export-round.mjs');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: os.tmpdir() });
const hash = (data) => createHash('sha256').update(data).digest('hex');
const dimensions = (data) => [data.readUInt32BE(16), data.readUInt32BE(20)];
function cornerAlpha(data) {
  assert.equal(data[25], 6, 'RGBA output');
  const chunks = [];
  for (let pos = 8; pos < data.length;) {
    const length = data.readUInt32BE(pos);
    if (data.toString('ascii', pos + 4, pos + 8) === 'IDAT') chunks.push(data.subarray(pos + 8, pos + 8 + length));
    pos += length + 12;
  }
  // For the first pixel every PNG filter has zero left/up predictors.
  return inflateSync(Buffer.concat(chunks))[4];
}

test('current 24 portraits export completely, leaving source and unrelated files intact', () => {
  const source = path.join(ROOT, 'outputs/portraits/full');
  const names = fs.readdirSync(source).filter((name) => name.endsWith('.png')).sort();
  assert.equal(names.length, 24);
  const before = names.map((name) => hash(fs.readFileSync(path.join(source, name))));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'portrait-export-test-'));
  try {
    fs.writeFileSync(path.join(output, 'keep.txt'), 'keep');
    const result = run('--source', source, '--output', output);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /24 avatars: 24 squares, 48 circles/);
    assert.deepEqual(fs.readdirSync(path.join(output, 'avatar-512')).sort(), names);
    assert.equal(fs.readdirSync(path.join(output, 'avatar-round')).length, 48);
    const archive = unzipSync(fs.readFileSync(path.join(output, 'avatars-512.zip')));
    assert.equal(Object.keys(archive).length, 73);
    assert.ok(!archive['keep.txt']);
    for (const name of names) {
      const square = `avatar-512/${name}`;
      assert.deepEqual(dimensions(fs.readFileSync(path.join(output, square))), [512, 512]);
      assert.deepEqual(Buffer.from(archive[square]), fs.readFileSync(path.join(output, square)));
      for (const size of [256, 64]) {
        const relative = `avatar-round/${name.slice(0, -4)}-${size}.png`;
        const data = fs.readFileSync(path.join(output, relative));
        assert.deepEqual(dimensions(data), [size, size]);
        assert.equal(cornerAlpha(data), 0);
        assert.deepEqual(Buffer.from(archive[relative]), data);
      }
    }
    const sheet = fs.readFileSync(path.join(output, 'contact-sheet-round.png'));
    assert.equal(dimensions(sheet)[0], 1400);
    assert.ok(dimensions(sheet)[1] > 2000, 'six rows rather than old two-row overview');
    assert.deepEqual(Buffer.from(archive['contact-sheet-round.png']), sheet);
    assert.equal(fs.readFileSync(path.join(output, 'keep.txt'), 'utf8'), 'keep');
    assert.deepEqual(names.map((name) => hash(fs.readFileSync(path.join(source, name)))), before);
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

test('CLI help, invalid arguments, empty input, and source collision', () => {
  assert.equal(run('--help').status, 0);
  assert.equal(run('--bogus').status, 1);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'portrait-cli-test-'));
  try {
    const output = path.join(temp, 'out');
    assert.equal(run('--source', temp, '--output', output).status, 1);
    assert.equal(fs.existsSync(output), false);
    assert.equal(run(temp, temp).status, 1);
    const source = path.join(ROOT, 'outputs/portraits/full');
    fs.mkdirSync(output);
    fs.symlinkSync(source, path.join(output, 'avatar-512'), 'dir');
    const collision = run('--source', source, '--output', output);
    assert.equal(collision.status, 1);
    assert.match(collision.stderr, /symbolic links/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
