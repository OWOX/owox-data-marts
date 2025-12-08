export function wrapWarningBlock(text: string) {
  return `> [!WARNING] \n> ${text}  \n`;
}

export function wrapCodeBlock(text: string) {
  return `\`\`\`${text}\`\`\``;
}
