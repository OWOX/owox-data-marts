import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dataMartRelationshipService } from '../../../shared/services/data-mart-relationship.service';
import type { BlendableSchema, BlendedField } from '../../../shared/types/relationship.types';
import { Skeleton } from '@owox/ui/components/skeleton';

interface BlendedFieldsSectionProps {
  dataMartId: string;
}

/**
 * Read-only section showing blended fields from related data marts.
 * Renders nothing if there are no blended fields.
 */
export function BlendedFieldsSection({ dataMartId }: BlendedFieldsSectionProps) {
  const [schema, setSchema] = useState<BlendableSchema | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!dataMartId) return;

    setIsLoading(true);
    dataMartRelationshipService
      .getBlendableSchema(dataMartId)
      .then(result => {
        setSchema(result);
      })
      .catch(() => {
        setSchema(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [dataMartId]);

  if (isLoading) {
    return (
      <div className='mt-8 space-y-3'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-5 w-40' />
          <Skeleton className='h-4 w-36' />
        </div>
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-8 w-full' />
      </div>
    );
  }

  if (!schema || schema.blendedFields.length === 0) {
    return null;
  }

  return (
    <div className='mt-8 space-y-3'>
      <div className='flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>Blended Fields</h3>
        <Link
          to='../relationships'
          className='text-muted-foreground hover:text-foreground text-sm transition-colors'
        >
          Go to Relationships
        </Link>
      </div>

      <div className='rounded-md border'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b'>
              <th className='text-muted-foreground px-4 py-2 text-left font-medium'>Source DM</th>
              <th className='text-muted-foreground px-4 py-2 text-left font-medium'>Field</th>
              <th className='text-muted-foreground px-4 py-2 text-left font-medium'>Output Name</th>
              <th className='text-muted-foreground px-4 py-2 text-left font-medium'>Type</th>
              <th className='text-muted-foreground px-4 py-2 text-left font-medium'>Hidden</th>
            </tr>
          </thead>
          <tbody>
            {schema.blendedFields.map((field: BlendedField) => (
              <tr key={field.name} className='hover:bg-muted/50 border-b last:border-0'>
                <td className='px-4 py-2'>{field.sourceDataMartTitle}</td>
                <td className='px-4 py-2 font-mono text-xs'>{field.originalFieldName}</td>
                <td className='px-4 py-2 font-mono text-xs'>{field.name}</td>
                <td className='text-muted-foreground px-4 py-2'>{field.type}</td>
                <td className='px-4 py-2'>
                  {field.isHidden ? (
                    <span className='text-muted-foreground text-xs'>Yes</span>
                  ) : (
                    <span className='text-xs'>No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
