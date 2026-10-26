/** Items become one Credential when project, definition, owner set and material are all equal. */
export function groupConversionItems<
  T extends {
    projectId: string;
    definitionId: string;
    ownerIds: readonly string[];
    materialKey: string;
  },
>(items: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = JSON.stringify([
      item.projectId,
      item.definitionId,
      [...item.ownerIds].sort(),
      item.materialKey,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}
