export type ChatMessageVisibilityInput = {
  message_kind?: string | null;
  call_status?: string | null;
  reply_to_message_id?: string | null;
  attachment_file_path?: string | null;
  content?: string | null;
};

const HOSTED_PLACEHOLDER_LINE_RE = /^[\s\u00a0]*(?:[oO0]|\u039f|\u03bf|\uff2f|\uff4f|\uff10|\u25cb|\u25ef)[\s\u00a0]*$/u;

export const stripHostedPlaceholderLines = (value?: string | null) => String(value || "")
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .filter((line) => !HOSTED_PLACEHOLDER_LINE_RE.test(line))
  .join("\n")
  .trim();

export const isHostedPlaceholderMessage = (message: ChatMessageVisibilityInput) => {
  if (message.message_kind === "call") return false;
  const content = stripHostedPlaceholderLines(message.content);
  return !message.reply_to_message_id
    && !message.attachment_file_path
    && !content;
};
