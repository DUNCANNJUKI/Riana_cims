import assert from 'node:assert/strict';
import test from 'node:test';
import { CallBackgroundError, callBackgroundErrorMessage } from './callBackgroundError.ts';

test('WebAssembly preflight failure gives support and site-policy checks without blaming browser settings', () => {
  const message = callBackgroundErrorMessage(new CallBackgroundError('WASM_UNAVAILABLE'));
  assert.match(message, /site security policy/);
  assert.doesNotMatch(message, /browser security settings/);
});

test('unclassified WebAssembly errors remain load failures and do not expose raw diagnostics', () => {
  const message = callBackgroundErrorMessage(new Error('WebAssembly compile error at /private/runtime.js'));
  assert.match(message, /could not load/);
  assert.doesNotMatch(message, /blocked|private|runtime\.js/);
});
