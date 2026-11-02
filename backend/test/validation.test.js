const { test } = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/utils/validation');

test('parsePositiveInt accepts positive integers only', () => {
  assert.equal(v.parsePositiveInt(5), 5);
  assert.equal(v.parsePositiveInt('42'), 42);
  assert.equal(v.parsePositiveInt(' 7 '), 7);
  assert.equal(v.parsePositiveInt(0), null);
  assert.equal(v.parsePositiveInt(-1), null);
  assert.equal(v.parsePositiveInt('abc'), null);
  assert.equal(v.parsePositiveInt('1.5'), null);
  assert.equal(v.parsePositiveInt(NaN), null);
  assert.equal(v.parsePositiveInt(null), null);
  assert.equal(v.parsePositiveInt(1e20), null);
});

test('parseNonNegativeInt allows zero', () => {
  assert.equal(v.parseNonNegativeInt(0), 0);
  assert.equal(v.parseNonNegativeInt('0'), 0);
  assert.equal(v.parseNonNegativeInt(3), 3);
  assert.equal(v.parseNonNegativeInt(-3), null);
});

test('parseText trims and bounds length', () => {
  assert.equal(v.parseText('  Karp  ', 10), 'Karp');
  assert.equal(v.parseText('   ', 10), null);
  assert.equal(v.parseText('x'.repeat(11), 10), null);
  assert.equal(v.parseText(123, 10), null);
});

test('parseDate accepts only real ISO dates', () => {
  assert.equal(v.parseDate('2026-06-15'), '2026-06-15');
  assert.equal(v.parseDate('2026-02-30'), null);
  assert.equal(v.parseDate('2026-13-01'), null);
  assert.equal(v.parseDate('15.06.2026'), null);
});

test('parseEmail lowercases and validates', () => {
  assert.equal(v.parseEmail('Jan.Kowalski@Example.PL'), 'jan.kowalski@example.pl');
  assert.equal(v.parseEmail('not-an-email'), null);
  assert.equal(v.parseEmail('a@b'), null);
  assert.equal(v.parseEmail(''), null);
});

test('isValidPassword enforces 12..72 bytes', () => {
  assert.equal(v.isValidPassword('short'), false);
  assert.equal(v.isValidPassword('a'.repeat(12)), true);
  assert.equal(v.isValidPassword('a'.repeat(72)), true);
  assert.equal(v.isValidPassword('a'.repeat(73)), false);
  // 12 znaków, ale > 72 bajtów w UTF-8 – bcrypt by je obciął
  assert.equal(v.isValidPassword('🐟'.repeat(20)), false);
  assert.equal(v.isValidPassword(12345678901234), false);
});

test('handleError hides internal error details', () => {
  const res = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const origError = console.error;
  console.error = () => {};
  try {
    v.handleError(res, new Error('password authentication failed for user x'), 'Błąd');
  } finally {
    console.error = origError;
  }
  assert.equal(res.code, 500);
  assert.deepEqual(res.body, { message: 'Błąd' });

  v.handleError(res, new v.HttpError(409, 'Konflikt'), 'Błąd');
  assert.equal(res.code, 409);
  assert.deepEqual(res.body, { message: 'Konflikt' });
});
