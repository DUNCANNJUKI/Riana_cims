import { apiRequest } from './apiRequest';

export async function downloadSignedCompletionReport(id: string, ticket: string) {
  const response = await apiRequest(`/api/crms/change_requests/${encodeURIComponent(id)}/completion.pdf`);
  if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('The signed completion report is unavailable. Please retry.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `${ticket.replace(/[^a-zA-Z0-9_-]/g, '_')}-signed-completion.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
