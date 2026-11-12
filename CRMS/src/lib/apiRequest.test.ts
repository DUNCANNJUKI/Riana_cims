import { afterEach, expect, test, vi } from 'vitest';
import { ApiRequestError, apiRequest } from './apiRequest';

afterEach(() => vi.unstubAllGlobals());

test('request errors preserve HTTP status without exposing server diagnostics', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'private SQL details' }), { status: 500 })));
  await expect(apiRequest('/api/crms/invitations')).rejects.toMatchObject({ status: 500, name: 'ApiRequestError' });
  await expect(apiRequest('/api/crms/invitations')).rejects.not.toThrow(/private SQL/);
});

test('missing routes remain distinguishable from missing records in the caller', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })));
  await expect(apiRequest('/api/crms/invitations')).rejects.toBeInstanceOf(ApiRequestError);
  await expect(apiRequest('/api/crms/invitations')).rejects.toMatchObject({ status: 404 });
});
