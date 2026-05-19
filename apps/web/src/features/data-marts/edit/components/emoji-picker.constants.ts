export interface EmojiGroup {
  label: string;
  emojis: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    label: 'Status',
    emojis: ['🥇', '🥈', '🥉', '⭐', '🏆', '✅', '❌', '⚠️', '🔥', '💎', '🎯', '🚀'],
  },
  {
    label: 'Category',
    emojis: ['📊', '📈', '📉', '💰', '🛒', '👥', '🌍', '📦', '🔧', '📱', '🖥️', '🔍'],
  },
  {
    label: 'Priority',
    emojis: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '💜', '💚', '💙'],
  },
];

export function prependEmoji(emoji: string, title: string): string {
  return `${emoji} ${title}`;
}
