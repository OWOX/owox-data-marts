import { PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';

/** Why OWOX refuses this JSON, or null: nesting is bounded before measuring, validating and storing walk it. */
export function findJsonShapeProblem(value: unknown): string | null {
  const maxDepth = PLUGIN_ACTION_LIMITS.maxJsonDepth;

  const visit = (node: unknown, depth: number): string | null => {
    if (typeof node !== 'object' || node === null) return null;
    if (depth > maxDepth) return `is nested deeper than ${maxDepth} levels`;
    for (const child of Object.values(node)) {
      const problem = visit(child, depth + 1);
      if (problem) return problem;
    }
    return null;
  };

  return visit(value, 1);
}
