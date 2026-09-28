import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { CanvasNodeRelationship } from '../model/types';

/**
 * The card's relationships list, opened from its relationships badge: every
 * Data Mart this one joins, in which direction, and on which fields. Like an
 * expanded field list, it grows the card past its layout height.
 */
export function CardRelationshipsSection({
  dataMartTitle,
  relationships,
}: {
  dataMartTitle: string;
  relationships: CanvasNodeRelationship[];
}) {
  return (
    <ul className='border-t' aria-label={`Relationships of ${dataMartTitle}`}>
      {relationships.map(relationship => {
        const outgoing = relationship.direction === 'outgoing';
        const Arrow = outgoing ? ArrowRight : ArrowLeft;
        const directionLabel = outgoing ? 'Joins' : 'Joined by';
        return (
          <li
            key={`${relationship.id}:${relationship.direction}`}
            className='border-border/50 border-b px-3.5 py-1.5 text-[11.5px] last:border-b-0'
          >
            <div
              className='flex items-center gap-2'
              title={`${directionLabel} ${relationship.otherTitle}`}
            >
              <Arrow
                className='text-muted-foreground h-3 w-3 shrink-0'
                aria-label={directionLabel}
              />
              <span className='text-foreground flex-1 truncate'>{relationship.otherTitle}</span>
            </div>
            {relationship.joinFields.length > 0 ? (
              relationship.joinFields.map(({ field, otherField }) => (
                <div
                  key={`${field}=${otherField}`}
                  className='text-muted-foreground truncate pl-5 font-mono text-[10px] leading-[14px]'
                  title={`${field} = ${otherField}`}
                >
                  {field} = {otherField}
                </div>
              ))
            ) : (
              <div className='text-muted-foreground/80 pl-5 text-[10.5px] leading-[14px] italic'>
                Join fields not set
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
