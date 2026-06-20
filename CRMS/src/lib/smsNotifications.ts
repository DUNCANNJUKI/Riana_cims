const API_URL = '/api/crms';

interface SendSMSParams {
  phoneNumber: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export async function sendSMS(params: SendSMSParams) {
  try {
    const res = await fetch(`${API_URL}/notifications/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error('Error sending SMS:', error);
      return { success: false, error };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error invoking SMS function:', error);
    return { success: false, error };
  }
}

// Send SMS for critical status changes
export async function notifyStatusChangeSMS(
  ticketNumber: string,
  clientName: string,
  newStatus: string,
  recipientPhone: string,
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
) {
  // Only send SMS for critical priority or specific status changes
  const criticalStatuses = ['approved', 'rejected', 'completed'];
  const shouldSendSMS = priority === 'critical' || priority === 'high' || criticalStatuses.includes(newStatus);

  if (!shouldSendSMS) {
    console.log('SMS not sent - not a critical status change');
    return { success: false, reason: 'Not critical' };
  }

  const statusMessages: Record<string, string> = {
    pending_approval: `[CRMS] ${ticketNumber} from ${clientName} awaits your approval.`,
    approved: `[CRMS] ${ticketNumber} has been APPROVED. Work can commence.`,
    rejected: `[CRMS] ${ticketNumber} has been REJECTED. Review comments in system.`,
    waiting: `[CRMS] ${ticketNumber} is ON HOLD. Check system for details.`,
    assigned: `[CRMS] ${ticketNumber} has been assigned to you.`,
    in_progress: `[CRMS] Work has started on ${ticketNumber}.`,
    completed: `[CRMS] ${ticketNumber} has been COMPLETED. Please verify.`,
  };

  const message = statusMessages[newStatus] || `[CRMS] ${ticketNumber} status changed to ${newStatus.replace('_', ' ')}.`;

  return sendSMS({
    phoneNumber: recipientPhone,
    message,
    priority,
  });
}

// Validate Kenyan phone number format
export function validateKenyanPhone(phone: string): { valid: boolean; formatted: string; error?: string } {
  // Remove all spaces and special characters except +
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // Check different formats and standardize
  if (cleaned.startsWith('+254')) {
    // Already in international format
    const localPart = cleaned.substring(4);
    if (localPart.length === 9 && (localPart.startsWith('7') || localPart.startsWith('1'))) {
      return { valid: true, formatted: cleaned };
    }
  } else if (cleaned.startsWith('254')) {
    // International format without +
    const localPart = cleaned.substring(3);
    if (localPart.length === 9 && (localPart.startsWith('7') || localPart.startsWith('1'))) {
      return { valid: true, formatted: '+' + cleaned };
    }
  } else if (cleaned.startsWith('0')) {
    // Local format starting with 0
    const localPart = cleaned.substring(1);
    if (localPart.length === 9 && (localPart.startsWith('7') || localPart.startsWith('1'))) {
      return { valid: true, formatted: '+254' + localPart };
    }
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    // Local format without leading 0
    if (cleaned.length === 9) {
      return { valid: true, formatted: '+254' + cleaned };
    }
  }

  return {
    valid: false,
    formatted: cleaned,
    error: 'Invalid Kenyan phone number. Use format: 0712345678, +254712345678, or 712345678'
  };
}

// Format phone for display
export function formatKenyanPhoneDisplay(phone: string): string {
  const validation = validateKenyanPhone(phone);
  if (!validation.valid) return phone;

  const formatted = validation.formatted;
  // Format as +254 7XX XXX XXX
  if (formatted.startsWith('+254') && formatted.length === 13) {
    return `${formatted.substring(0, 4)} ${formatted.substring(4, 7)} ${formatted.substring(7, 10)} ${formatted.substring(10)}`;
  }
  return phone;
}
