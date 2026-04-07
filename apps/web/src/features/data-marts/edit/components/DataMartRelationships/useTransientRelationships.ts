import { useEffect, useRef, useState } from 'react';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type {
  DataMartRelationship,
  TransientRelationshipRow,
} from '../../../shared/types/relationship.types';

const MAX_DEPTH = 5;

export function useTransientRelationships(
  dataMartId: string,
  dataMartTitle: string,
  dataMartStatus: string,
  directRelationships: DataMartRelationship[],
  showTransient: boolean
): { rows: TransientRelationshipRow[]; isLoading: boolean } {
  const [rows, setRows] = useState<TransientRelationshipRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const versionRef = useRef(0);

  useEffect(() => {
    const directRows: TransientRelationshipRow[] = directRelationships.map(rel => ({
      relationship: rel,
      depth: 1,
      parentDataMartTitle: dataMartTitle,
      sourceDmId: dataMartId,
      isBlocked: false,
    }));

    if (!showTransient) {
      setRows(directRows);
      return;
    }

    const version = ++versionRef.current;
    setIsLoading(true);

    async function collectTransient(
      parentDmId: string,
      parentTitle: string,
      rels: DataMartRelationship[],
      depth: number,
      ancestorDmIds: Set<string>,
      parentBlocked: boolean
    ): Promise<TransientRelationshipRow[]> {
      const result: TransientRelationshipRow[] = [];

      for (const rel of rels) {
        const dmId = rel.targetDataMart.id;
        const isDraft = rel.targetDataMart.status === 'DRAFT';
        const blocked = parentBlocked;

        result.push({
          relationship: rel,
          depth,
          parentDataMartTitle: parentTitle,
          sourceDmId: parentDmId,
          isBlocked: blocked,
        });

        if (depth < MAX_DEPTH && !ancestorDmIds.has(dmId)) {
          try {
            const childRels = await dataMartRelationshipService.getRelationships(dmId);
            if (childRels.length > 0) {
              const newAncestors = new Set(ancestorDmIds);
              newAncestors.add(dmId);
              const children = await collectTransient(
                dmId,
                rel.targetDataMart.title,
                childRels,
                depth + 1,
                newAncestors,
                blocked || isDraft
              );
              result.push(...children);
            }
          } catch {
            // skip unreachable data marts
          }
        }
      }

      return result;
    }

    const rootIsDraft = dataMartStatus === 'DRAFT';

    void collectTransient(
      dataMartId,
      dataMartTitle,
      directRelationships,
      1,
      new Set([dataMartId]),
      rootIsDraft
    ).then(collected => {
      if (versionRef.current === version) {
        setRows(collected);
        setIsLoading(false);
      }
    });
  }, [dataMartId, dataMartTitle, dataMartStatus, directRelationships, showTransient]);

  return { rows, isLoading };
}
