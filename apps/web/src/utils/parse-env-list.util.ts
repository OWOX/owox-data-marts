export const parseEnvList = (input: string): string[] => {
  if (!input) return [];
  return input
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
};
