const stages = [
  ['submitted', 'Request submitted'], ['review', 'Technical and commercial review'],
  ['approved', 'Approved and assigned'], ['implementation', 'Development in progress'],
  ['verification', 'Implementation complete; Account Manager verification'],
  ['client_review', 'Client confirmation requested'], ['client_accepted', 'Client implementation confirmed'],
  ['closed', 'Request closed'],
];
const statusSteps = {
  pending_approval: 1, sales_review: 1, senior_dev_review: 1, waiting: 1, waiting_clarification: 1,
  approved: 2, assigned: 2, in_progress: 3, client_requested_corrections: 3, client_disputed: 3,
  completed: 4, ready_for_completion_report: 4, awaiting_client_acceptance: 5, client_accepted: 6, closed_client_accepted: 7,
};

function clientRequestProgress(row) {
  const legacyClosed = row.status === 'completed' && !row.is_client_request;
  const step = legacyClosed ? 7 : (statusSteps[row.status] ?? 1);
  const closed = row.status === 'closed_client_accepted' || legacyClosed;
  const reviewAvailable = ['sent', 'accepted', 'rejected', 'disputed'].includes(row.report_status)
    && new Date(row.token_expires_at).getTime() > Date.now();
  return {
    ticket_number: row.ticket_number, title: row.request_title, category: row.request_category,
    client: { name: row.client_name, branch: row.branch_name }, date_requested: row.date_requested,
    created_at: row.created_at, updated_at: row.updated_at,
    status: row.status, current_status: row.status === 'rejected' ? 'Request declined' : stages[step][1],
    current_step: step, status_description: row.status === 'client_requested_corrections' ? 'Your requested corrections are being addressed.' : row.status === 'client_disputed' ? 'Your dispute is under review.' : stages[step][1],
    is_closed: closed, acceptance_status: row.acceptance_status,
    signed_report_available: Boolean(row.signed_report_available),
    stages: stages.map(([key, label], index) => ({ key, label, description: label, completed: index < step || closed, current: index === step && !closed && row.status !== 'rejected' })),
    latest_completion_report: reviewAvailable ? { id: row.report_id, version_number: row.version_number, status: row.report_status, sent_at: row.sent_at, acceptance_token: row.acceptance_token } : null,
    feedback: row.feedback_submitted_at ? { rating: row.feedback_rating, comment: row.feedback_comment, submitted_at: row.feedback_submitted_at } : null,
  };
}
module.exports = { clientRequestProgress };
