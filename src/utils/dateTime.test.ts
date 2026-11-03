import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TIME_ZONE, getGreeting, getZonedHour } from './dateTime.ts';
import { calculateSynchronizedTime } from './serverClock.ts';

const nairobiTime = (hour: number) => new Date(Date.UTC(2026, 10, 1, hour - 3, 0, 0));

test('uses the configured IANA timezone instead of the browser timezone', () => {
  const instant = new Date('2026-11-01T03:00:00.000Z');
  assert.equal(getZonedHour(instant, 'Africa/Nairobi'), 6);
  assert.equal(getZonedHour(instant, 'America/New_York'), 23);
});

test('returns the correct greeting at every boundary', () => {
  assert.equal(getGreeting(nairobiTime(3)), 'Good night!');
  assert.equal(getGreeting(nairobiTime(4)), 'Good morning!');
  assert.equal(getGreeting(nairobiTime(11)), 'Good morning!');
  assert.equal(getGreeting(nairobiTime(12)), 'Good afternoon!');
  assert.equal(getGreeting(nairobiTime(16)), 'Good afternoon!');
  assert.equal(getGreeting(nairobiTime(17)), 'Good evening!');
  assert.equal(getGreeting(nairobiTime(20)), 'Good evening!');
  assert.equal(getGreeting(nairobiTime(21)), 'Good night!');
});

test('updates the greeting immediately when the configured timezone changes', () => {
  const instant = new Date('2026-11-01T01:10:00.000Z');
  assert.equal(getGreeting(instant, 'Africa/Nairobi'), 'Good morning!');
  assert.equal(getGreeting(instant, 'America/New_York'), 'Good night!');
});

test('uses elapsed monotonic time instead of an incorrect device clock', () => {
  const authoritativeServerTime = Date.parse('2026-11-01T01:10:00.000Z');
  const synchronized = calculateSynchronizedTime(authoritativeServerTime, 1_000, 6_000);
  assert.equal(new Date(synchronized).toISOString(), '2026-11-01T01:10:05.000Z');
  assert.equal(getGreeting(new Date(synchronized), 'Africa/Nairobi'), 'Good morning!');
});

test('falls back safely when a stored timezone is invalid', () => {
  const instant = nairobiTime(8);
  assert.equal(getZonedHour(instant, 'invalid/timezone'), getZonedHour(instant, DEFAULT_TIME_ZONE));
  assert.equal(getGreeting(instant, 'invalid/timezone'), 'Good morning!');
});
