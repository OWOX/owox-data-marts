export function wrapWarningBlock(text: string) {
  return `> [!WARNING] \n> ${text}  \n`;
}

export function wrapCautionBlock(text: string) {
  return `> [!CAUTION] \n> ${text}  \n`;
}

export function wrapCodeBlock(text: string) {
  return `\`\`\`${text}\`\`\``;
}
