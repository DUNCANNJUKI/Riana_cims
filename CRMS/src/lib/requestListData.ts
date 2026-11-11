import type { ChangeRequestWithRelations } from '@crms/hooks/useSupabaseData';

export type TicketSort = 'asc' | 'desc' | null;

export function filterRequests(
  requests: ChangeRequestWithRelations[],
  search: string,
  status: string,
  priority: string,
  sort: TicketSort,
): ChangeRequestWithRelations[] {
  const query = search.trim().toLowerCase();
  const matches = requests.filter((request) => (
    [request.ticket_number, request.client?.name, request.change_description]
      .some((value) => value?.toLowerCase().includes(query))
    && (status === 'all' || request.status === status)
    && (priority === 'all' || request.priority === priority)
  ));
  return sort ? matches.sort((a, b) => (
    a.ticket_number.localeCompare(b.ticket_number, undefined, { numeric: true }) * (sort === 'asc' ? 1 : -1)
  )) : matches;
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function buildRequestCsv(requests: ChangeRequestWithRelations[]): string {
  const rows = [
    ['Ticket', 'Client', 'Description', 'Priority', 'Status', 'Assigned To', 'Requested', 'Due Date'],
    ...requests.map((request) => [
      request.ticket_number, request.client?.name, request.change_description,
      request.priority, request.status, request.assigned_developer?.name,
      request.date_requested, request.estimated_completion_date,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadRequestsCsv(requests: ChangeRequestWithRelations[], filename: string): void {
  const url = URL.createObjectURL(new Blob(['\ufeff', buildRequestCsv(requests)], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to consume the download URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
