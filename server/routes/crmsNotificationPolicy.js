const DELIVERY_BY_EVENT = Object.freeze({
  approval_needed: Object.freeze({ email: true, sms: true }),
  assigned: Object.freeze({ email: true, sms: true }),
  completed: Object.freeze({ email: true, sms: true }),
});

const deliveryForCrmsEvent = (eventName) => DELIVERY_BY_EVENT[eventName] || Object.freeze({
  email: true,
  sms: false,
});

const resolveCompletionRecipientId = ({
  assignedByUserId,
  seniorDeveloperId,
  completedByUserId,
}) => {
  const recipientId = assignedByUserId || seniorDeveloperId || null;
  return recipientId && recipientId !== completedByUserId ? recipientId : null;
};

module.exports = {
  deliveryForCrmsEvent,
  resolveCompletionRecipientId,
};
