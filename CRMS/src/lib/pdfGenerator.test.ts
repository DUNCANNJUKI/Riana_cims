import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateChangeRequestPDF, generateCompletionReportPDF } from './pdfGenerator';

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
  client: { name: 'Sample Client', branch: 'Nairobi', contract_type: 'support', contact_person: 'Client Representative', contact_email: 'client@example.test', contact_phone: '+254700000000' },
  senior_developer: { name: 'Senior Developer' },
  assigned_developer: { name: 'Assigned Developer' },
} as any;

describe('professional PDF branding', () => {
  it('generates branded request and completion documents with footers', () => {
    const directory = resolve(__dirname, '../../../tmp/pdfs');
    mkdirSync(directory, { recursive: true });
    const documents = [
      ['change-request.pdf', generateChangeRequestPDF(sampleRequest)],
      ['completion-report.pdf', generateCompletionReportPDF(sampleRequest)],
    ] as const;

    for (const [filename, document] of documents) {
      const output = document.output('arraybuffer');
      expect(output.byteLength).toBeGreaterThan(5_000);
      writeFileSync(resolve(directory, filename), new DataView(output));
    }
  });
});
