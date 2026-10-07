import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { CanvasNodeRelationship } from '../model/types';

function RelationshipSummary({ relationship }: { relationship: CanvasNodeRelationship }) {
  const outgoing = relationship.direction === 'outgoing';
  const Arrow = outgoing ? ArrowRight : ArrowLeft;
  const directionLabel = outgoing ? 'Joins' : 'Joined by';
  return (
    <>
      <div
        className='flex items-center gap-2'
        title={`${directionLabel} ${relationship.otherTitle}`}
      >
        <Arrow className='text-muted-foreground h-3 w-3 shrink-0' aria-label={directionLabel} />
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
    </>
  );
}

/**
 * The card's relationships list, opened from its relationships badge: every
 * Data Mart this one joins, in which direction, and on which fields. Like an
 * expanded field list, it grows the card past its layout height. With
 * `onOpenRelationship`, each row opens that relationship's details.
 */
export function CardRelationshipsSection({
  dataMartTitle,
  relationships,
  onOpenRelationship,
}: {
  dataMartTitle: string;
  relationships: CanvasNodeRelationship[];
  onOpenRelationship?: (relationshipId: string, options?: { viaKeyboard?: boolean }) => void;
}) {
  return (
    <ul className='border-t' aria-label={`Relationships of ${dataMartTitle}`}>
      {relationships.map(relationship => (
        <li
          key={`${relationship.id}:${relationship.direction}`}
          className='border-border/50 border-b text-[11.5px] last:border-b-0'
        >
          {onOpenRelationship ? (
            <button
              type='button'
              className='nodrag hover:bg-muted/60 block w-full cursor-pointer px-3.5 py-1.5 text-left transition-colors'
              aria-label={`Open the relationship with ${relationship.otherTitle}`}
              onPointerDown={e => {
                e.stopPropagation();
              }}
              onClick={e => {
                // The card itself toggles its edge highlight on click — keep the two apart.
                e.stopPropagation();
                // Enter or Space on the button: a click with no pointer behind it.
                onOpenRelationship(relationship.id, { viaKeyboard: e.detail === 0 });
              }}
            >
              <RelationshipSummary relationship={relationship} />
            </button>
          ) : (
            <div className='px-3.5 py-1.5'>
              <RelationshipSummary relationship={relationship} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
