import type { RelatedDataMartAccess } from '../../../shared/types/relationship.types';

export function deriveTransientInaccessible(
  parentInaccessible: boolean,
  access: RelatedDataMartAccess | undefined
): boolean {
  const ownInaccessible = access !== undefined ? !access.canSee : false;
  return parentInaccessible || ownInaccessible;
}
