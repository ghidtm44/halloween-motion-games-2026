import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, lstatSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../build-app.sh', import.meta.url));
const buildRoot = fileURLToPath(new URL('../build/', import.meta.url));
const buildEntries = () => { try { return readdirSync(buildRoot).sort(); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } };
const run = (args, env = {}) => spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 5000 });

test('help and dry-run describe a pinned native build without changing build output or exposing credentials', () => {
  const before = buildEntries();
  const credential = 'packaging-test-sentinel-never-copy';
  for (const args of [['--help'], ['--dry-run'], ['--motion-games','--dry-run']]) {
    const result = run(args, { OPENAI_API_KEY: credential, SPOOKY_HOST_API_KEY: credential, VITE_API_KEY: credential });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Node\.js 24|node-v24\./);
    assert.match(result.stdout, /13\.5/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(credential));
  }
  assert.deepEqual(buildEntries(), before);
});

test('unknown arguments fail before creating build output', () => {
  const before = buildEntries();
  const result = run(['--overwrite']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown argument/);
  assert.deepEqual(buildEntries(), before);
});

test('Desktop copy refuses an existing app without changing its contents', t => {
  const temporaryHome = mkdtempSync(join(tmpdir(), 'playground-packaging-'));
  t.after(() => rmSync(temporaryHome, { recursive: true, force: true }));
  const destination = join(temporaryHome, 'Desktop', 'Simple Playground Spooky Host.app');
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(destination, 'keep.txt'), 'existing app');
  const result = run(['--desktop-copy', '--dry-run'], { HOME: temporaryHome });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /destination already exists/);
  assert.equal(readFileSync(join(destination, 'keep.txt'), 'utf8'), 'existing app');
  assert.deepEqual(readdirSync(destination), ['keep.txt']);
});

test('Desktop copy also refuses dangling symlinks', t => {
  const temporaryHome = mkdtempSync(join(tmpdir(), 'playground-packaging-'));
  t.after(() => rmSync(temporaryHome, { recursive: true, force: true }));
  mkdirSync(join(temporaryHome, 'Desktop'));
  const destination = join(temporaryHome, 'Desktop', 'Simple Playground Spooky Host.app');
  symlinkSync(join(temporaryHome, 'absent'), destination);
  const result = run(['--desktop-copy', '--dry-run'], { HOME: temporaryHome });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /destination already exists/);
  assert.ok(lstatSync(destination).isSymbolicLink());
});

test('a Linux build stops before downloads or staging', { skip: process.platform !== 'linux' }, () => {
  const before = buildEntries();
  const result = run([]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Native compilation requires macOS/);
  assert.deepEqual(buildEntries(), before);
});
