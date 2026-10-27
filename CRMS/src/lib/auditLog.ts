const API_URL = '/api/crms';

type AuditAction = 
  | 'created' 
  | 'updated' 
  | 'status_changed' 
  | 'approved' 
  | 'rejected' 
  | 'assigned' 
  | 'started' 
  | 'completed' 
  | 'document_uploaded' 
  | 'comment_added';

interface CreateAuditLogParams {
  requestId: string;
  userId: string;
  action: AuditAction;
  actionLabel: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
  metadata?: Record<string, any>;
}

export async function createAuditLog(params: CreateAuditLogParams) {
  try {
    const response = await fetch(`${API_URL}/audit_logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: params.requestId,
        user_id: params.userId,
        action: params.action,
        action_label: params.actionLabel,
        details: params.details,
        previous_value: params.previousValue,
        new_value: params.newValue,
        metadata: params.metadata,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error creating audit log:', error);
    return { success: false, error };
  }
}

export async function getAuditLogsForRequest(requestId: string) {
  try {
    const response = await fetch(`${API_URL}/audit_logs?request_id=${encodeURIComponent(requestId)}`);
    if (!response.ok) throw new Error(await response.text());
    return { success: true, data: await response.json() };
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return { success: false, error, data: [] };
  }
}

export async function getAllAuditLogs(limit = 100) {
  try {
    const response = await fetch(`${API_URL}/audit_logs`);
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return { success: true, data: data.slice(0, limit) };
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return { success: false, error, data: [] };
  }
}
