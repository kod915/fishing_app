const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

// env.js czyta process.env przy załadowaniu, więc każdy przypadek uruchamiamy
// w osobnym procesie Node z kontrolowanym środowiskiem (bez .env z dysku).
const loadEnv = (vars) => {
  const script = `
    const e = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'config', 'env.js'))});
    console.log(JSON.stringify({ isProd: e.isProd, corsOrigins: e.corsOrigins, jwtLen: e.jwtSecret.length }));
  `;
  const cleanEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...vars };
  // cwd poza repo – dotenv nie znajdzie lokalnego backend/.env
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { env: cleanEnv, cwd: os.tmpdir(), encoding: 'utf8' }));
};

const expectThrow = (vars, re) => {
  assert.throws(() => loadEnv(vars), (err) => re.test(String(err.stderr || err.message)));
};

test('production refuses to start without JWT_SECRET', () => {
  expectThrow({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' }, /JWT_SECRET is missing or shorter than 32/);
});

test('production refuses a short JWT_SECRET', () => {
  expectThrow({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_SECRET: 'super_secret_key_change_me' }, /JWT_SECRET/);
});

test('production requires DATABASE_URL', () => {
  expectThrow({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }, /DATABASE_URL is required/);
});

test('production starts with proper secrets', () => {
  const e = loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', JWT_SECRET: 'x'.repeat(40) });
  assert.equal(e.isProd, true);
  assert.equal(e.jwtLen, 40);
});

test('development falls back to a dev secret', () => {
  const e = loadEnv({});
  assert.equal(e.isProd, false);
  assert.ok(e.jwtLen > 0);
});

test('CORS_ORIGIN never degrades to allow-all', () => {
  assert.deepEqual(loadEnv({}).corsOrigins, []);
  assert.deepEqual(loadEnv({ CORS_ORIGIN: ' ' }).corsOrigins, []);
  assert.deepEqual(loadEnv({ CORS_ORIGIN: ' , ' }).corsOrigins, []);
  assert.deepEqual(
    loadEnv({ CORS_ORIGIN: 'https://a.pl, http://localhost:5173' }).corsOrigins,
    ['https://a.pl', 'http://localhost:5173']
  );
});
