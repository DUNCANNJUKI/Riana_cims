import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClientRequests } from './ClientRequests';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@crms/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@crms/components/ClientRequestInitiationDialog', () => ({ ClientRequestInitiationDialog: () => null }));
vi.mock('@crms/components/PrepareCompletionReportDialog', () => ({ PrepareCompletionReportDialog: () => null }));
vi.mock('@crms/components/CloseChangeRequestDialog', () => ({ CloseChangeRequestDialog: () => null }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); toast.mockClear(); });

test('missing portal route shows a persistent error, retries successfully and retains data on a later failure', async () => {
  let failure = 404;
  const record = { id: 'request-one', ticket_number: 'CR-101', title: 'Printer routing', client_name: 'Example Client', status: 'in_progress', is_client_request: true, updated_at: '2026-11-12T12:00:00Z' };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/invitations') && failure) return new Response(JSON.stringify({ error: failure === 404 ? 'Not found' : 'private backend detail' }), { status: failure });
    return new Response(JSON.stringify(url.endsWith('/change_requests') ? [record] : url.endsWith('/invitations') ? [] : { stats: {} }));
  }));
  render(<MemoryRouter><ClientRequests /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('complete the application update');
  expect(screen.queryByText('Total Invitations')).not.toBeInTheDocument();
  expect(screen.queryByText('No change requests match your criteria.')).not.toBeInTheDocument();
  failure = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('CR-101')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Total Invitations')).toBeInTheDocument();
  failure = 503;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Previously loaded records'));
  expect(screen.getByText('CR-101')).toBeInTheDocument();
  expect(screen.getByRole('alert')).not.toHaveTextContent('private backend detail');
});

test('invalid list payload does not appear as a successful empty result', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ unexpected: true }))));
  render(<MemoryRouter><ClientRequests /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('unexpected response');
  expect(screen.queryByText('No change requests match your criteria.')).not.toBeInTheDocument();
});
