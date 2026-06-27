import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateChangeRequestPDF, generateCompletionReportPDF } from './pdfGenerator';
import { resolveDocumentBrand } from '../../../src/utils/pdfWatermark';

const sampleRequest = {
  id: 'qa-request',
  ticket_number: 'CR-2026-0042',
  department: 'Technology',
  date_requested: '2026-06-18T08:00:00.000Z',
  estimated_completion_date: '2026-06-24T08:00:00.000Z',
  commencement_date: '2026-06-19T08:00:00.000Z',
  completion_date: '2026-06-20T08:00:00.000Z',
  priority: 'high',
  status: 'completed',
  source: 'client',
  change_description: 'Improve the client dashboard, validate the notification workflow, and document the production release.',
  modules_affected: ['Dashboard', 'Notifications', 'Reports'],
  client: { name: 'Sample Client', branch: 'Nairobi', contract_type: 'support', contact_person: 'Client Representative', contact_email: 'client@example.test', contact_phone: '+254700000000', subsidiary_name: 'MAREZI Kenya' },
  senior_developer: { name: 'Senior Developer' },
  assigned_developer: { name: 'Assigned Developer' },
} as any;

const fetchMock = vi.fn();

beforeAll(() => {
  const letterheadBytes = new Uint8Array(readFileSync(resolve(__dirname, '../../../public/marezi-letterhead.png')));
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    if (String(input).endsWith('/marezi-letterhead.png')) {
      return {
        ok: true,
        blob: async () => new Blob([letterheadBytes], { type: 'image/png' }),
      } as Response;
    }
    return { ok: false } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  localStorage.removeItem('riana_user');
  fetchMock.mockClear();
});

describe('professional PDF branding', () => {
  it('selects the official subsidiary identity without weakening the RIANA fallback', () => {
    expect(resolveDocumentBrand('MAREZI Kenya').id).toBe('marezi');
    expect(resolveDocumentBrand('QSYS').id).toBe('riana');
    expect(resolveDocumentBrand('QSYS', 'MAREZI Kenya').id).toBe('marezi');
  });

  it('generates branded request and completion documents with footers', async () => {
    const directory = resolve(__dirname, '../../../tmp/pdfs');
    mkdirSync(directory, { recursive: true });
    const documents = [
      ['change-request.pdf', await generateChangeRequestPDF(sampleRequest)],
      ['completion-report.pdf', await generateCompletionReportPDF(sampleRequest)],
    ] as const;

    for (const [filename, document] of documents) {
      const output = document.output('arraybuffer');
      expect(output.byteLength).toBeGreaterThan(5_000);
      writeFileSync(resolve(directory, filename), new DataView(output));
    }
  });

  it('preserves the RIANA fallback document path', async () => {
    const rianaRequest = {
      ...sampleRequest,
      client: { ...sampleRequest.client, subsidiary_name: 'QSYS' },
    };
    const document = await generateChangeRequestPDF(rianaRequest);
    expect(document.output('arraybuffer').byteLength).toBeGreaterThan(5_000);
  });

  it('uses MAREZI letterhead when the generating user belongs to MAREZI', async () => {
    localStorage.setItem('riana_user', JSON.stringify({
      id: 'marezi-user',
      subsidiary_name: 'MAREZI Kenya',
    }));
    const nonMareziClientRequest = {
      ...sampleRequest,
      client: { ...sampleRequest.client, subsidiary_name: 'QSYS' },
    };

    const document = await generateChangeRequestPDF(nonMareziClientRequest);

    expect(document.output('arraybuffer').byteLength).toBeGreaterThan(5_000);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/marezi-letterhead.png'));
  });
});
