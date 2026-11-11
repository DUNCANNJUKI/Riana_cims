import { expect, test } from 'vitest';
import { buildRequestCsv, filterRequests } from './requestListData';
import type { ChangeRequestWithRelations } from '@crms/hooks/useSupabaseData';

const requests = [
  { ticket_number: 'CR-10', change_description: '=HYPERLINK("bad")', status: 'in_progress', priority: 'high', client: { name: 'Client, Ten' } },
  { ticket_number: 'CR-2', change_description: 'Second request', status: 'completed', priority: 'low', client: { name: 'Client Two' } },
] as ChangeRequestWithRelations[];

test('request filtering and natural ticket sorting preserve input order', () => {
  expect(filterRequests(requests, '', 'all', 'all', 'asc').map(r => r.ticket_number)).toEqual(['CR-2', 'CR-10']);
  expect(requests[0].ticket_number).toBe('CR-10');
  expect(filterRequests(requests, 'ten', 'in_progress', 'high', null)).toEqual([requests[0]]);
});

test('CSV export quotes cells and neutralizes spreadsheet formulas', () => {
  const csv = buildRequestCsv(requests);
  expect(csv).toContain('"Client, Ten"');
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv.split('\r\n')).toHaveLength(3);
});
