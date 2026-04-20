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
  const lastDataMartIdRef = useRef<string>('');

  useEffect(() => {
    const directRows: TransientRelationshipRow[] = directRelationships.map(rel => ({
      relationship: rel,
      depth: 1,
      parentDataMartTitle: dataMartTitle,
      sourceDmId: dataMartId,
      isBlocked: false,
      aliasPath: rel.targetAlias,
      rowKey: rel.id,
    }));

    if (!showTransient) {
      setRows(directRows);
      return;
    }

    const version = ++versionRef.current;
    // Skeleton flashes are jarring during incremental edits (create/delete/edit).
    // Only show the loader on the first load per data mart.
    const isInitialLoad = lastDataMartIdRef.current !== dataMartId;
    if (isInitialLoad) setIsLoading(true);
    lastDataMartIdRef.current = dataMartId;

    async function collectTransient(
      parentDmId: string,
      parentTitle: string,
      parentAliasPath: string,
      parentRowKey: string,
      rels: DataMartRelationship[],
      depth: number,
      ancestorDmIds: Set<string>,
      parentBlocked: boolean
    ): Promise<TransientRelationshipRow[]> {
      // Build a row plus recursively its subtree for every rel in parallel.
      const subtrees = await Promise.all(
        rels.map(async rel => {
          const dmId = rel.targetDataMart.id;
          const isDraft = rel.targetDataMart.status === 'DRAFT';
          const isJoinNotConfigured = rel.joinConditions.length === 0;
          const aliasPath = parentAliasPath
            ? `${parentAliasPath}.${rel.targetAlias}`
            : rel.targetAlias;
          const rowKey = parentRowKey ? `${parentRowKey}/${rel.id}` : rel.id;

          const row: TransientRelationshipRow = {
            relationship: rel,
            depth,
            parentDataMartTitle: parentTitle,
            sourceDmId: parentDmId,
            isBlocked: parentBlocked,
            aliasPath,
            rowKey,
          };

          if (depth >= MAX_DEPTH || ancestorDmIds.has(dmId)) {
            return [row];
          }

          try {
            const childRels = await dataMartRelationshipService.getRelationships(dmId);
            if (childRels.length === 0) return [row];

            const newAncestors = new Set(ancestorDmIds);
            newAncestors.add(dmId);
            const children = await collectTransient(
              dmId,
              rel.targetDataMart.title,
              aliasPath,
              rowKey,
              childRels,
              depth + 1,
              newAncestors,
              parentBlocked || isDraft || isJoinNotConfigured
            );
            return [row, ...children];
          } catch {
            return [row];
          }
        })
      );

      return subtrees.flat();
    }

    const rootIsDraft = dataMartStatus === 'DRAFT';

    void collectTransient(
      dataMartId,
      dataMartTitle,
      '',
      '',
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
