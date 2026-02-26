export function generateAiAssistantSessionTitleFromMessage(message: string): string {
  const normalized = message
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return '';
  }

  const words = normalized.split(' ').slice(0, 6).join(' ');
  return words.slice(0, 60).trim();
}
