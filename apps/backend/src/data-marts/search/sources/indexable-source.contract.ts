import { SearchableEntityType } from '../../../common/search/search.facade';
import type { IndexableSource } from './indexable-source.port';

const MISSING_ID = '00000000-0000-0000-0000-000000000000';

export interface LoadSearchableOneSeed {
  liveId: string;
  deletedId: string;
}

export function describeLoadSearchableOneContract(
  getSource: () => IndexableSource,
  seed: () => Promise<LoadSearchableOneSeed>,
  entityType: SearchableEntityType
): void {
  describe('loadSearchableOne contract', () => {
    it('returns a descriptor for a live entity', async () => {
      const { liveId } = await seed();
      const descriptor = await getSource().loadSearchableOne(liveId);
      expect(descriptor).not.toBeNull();
      expect(descriptor?.entityId).toBe(liveId);
      expect(descriptor?.entityType).toBe(entityType);
    });

    it('returns null for a missing id', async () => {
      await seed();
      expect(await getSource().loadSearchableOne(MISSING_ID)).toBeNull();
    });

    it('returns null for a soft-deleted entity', async () => {
      const { deletedId } = await seed();
      expect(await getSource().loadSearchableOne(deletedId)).toBeNull();
    });
  });
}
