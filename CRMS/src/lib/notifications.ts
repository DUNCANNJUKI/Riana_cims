const API_URL = '/api/crms';

type NotificationType =
  | 'request_created'
  | 'approval_needed'
  | 'approved'
  | 'rejected'
  | 'assigned'
  | 'commenced'
  | 'completed'
  | 'waiting_clarification';

interface SendNotificationParams {
  recipientEmail: string;
  recipientName: string;
  notificationType: NotificationType;
  ticketNumber: string;
  clientName: string;
  requestDescription: string;
  actionUrl?: string;
  approverName?: string;
  developerName?: string;
  comment?: string;
}

export async function sendNotificationEmail(params: SendNotificationParams) {
  try {
    const res = await fetch(`${API_URL}/notifications/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('Error sending notification:', error);
      return { success: false, error };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error invoking notification function:', error);
    return { success: false, error };
  }
}

// Helper to create in-app notification
export async function createInAppNotification(
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  actionUrl?: string,
  requestId?: string
) {
  try {
    const res = await fetch(`${API_URL}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        title,
        message,
        type,
        action_url: actionUrl,
        request_id: requestId,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('Error creating notification:', error);
      return { success: false, error };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { success: false, error };
  }
}

// Notify relevant parties based on status change
export async function notifyStatusChange(
  ticketNumber: string,
  clientName: string,
  requestDescription: string,
  newStatus: string,
  recipientEmails: { email: string; name: string }[],
  requestId: string,
  comment?: string,
  approverName?: string,
  developerName?: string
) {
  const statusToNotificationType: Record<string, NotificationType> = {
    pending_approval: 'approval_needed',
    approved: 'approved',
    rejected: 'rejected',
    assigned: 'assigned',
    in_progress: 'commenced',
    completed: 'completed',
    waiting: 'waiting_clarification',
  };

  const notificationType = statusToNotificationType[newStatus] || 'request_created';
  const actionUrl = `${window.location.origin}/developers/requests/${requestId}`;

  const results = await Promise.all(
    recipientEmails.map((recipient) =>
      sendNotificationEmail({
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        notificationType,
        ticketNumber,
        clientName,
        requestDescription,
        actionUrl,
        comment,
        approverName,
        developerName,
      })
    )
  );

  return results;
}
