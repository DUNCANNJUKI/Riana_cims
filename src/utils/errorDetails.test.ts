import test from 'node:test';
import assert from 'node:assert/strict';
import { errorDetails } from './errorDetails.ts';

test('diagnostic reads preserve Error and legacy response messages without changing thrown values', () => {
  const failure = new TypeError('Connection failed');
  assert.equal(errorDetails(failure).message, 'Connection failed');
  assert.equal(errorDetails(failure).name, 'TypeError');
  assert.equal(errorDetails({ response: { data: { error: 'Budget is locked' } } }).response?.data?.error, 'Budget is locked');
});

test('null, primitive and malformed failure fields can be read safely', () => {
  for (const value of [null, undefined, 3, 'failed', { message: 3, response: 'invalid' }]) {
    assert.equal(errorDetails(value).message, undefined);
    assert.equal(errorDetails(value).response, undefined);
  }
});
