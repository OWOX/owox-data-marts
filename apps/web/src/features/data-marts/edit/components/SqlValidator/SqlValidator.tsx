'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, Database } from 'lucide-react';
import { formatBytes } from '../../../../../utils';
import { useDebounce } from '../../../../../hooks/useDebounce.ts';
import { useSqlDryRunTrigger } from '../../../shared/hooks/useSqlDryRunTrigger';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';

interface SqlValidationState {
  isLoading: boolean;
  isValid: boolean | null;
  error: string | null;
  bytes: number | null;
}
interface SqlValidatorProps {
  sql: string;
  dataMartId: string;
  debounceDelay?: number;
  className?: string;
  onValidationStateChange?: (state: SqlValidationState) => void;
}

const DEFAULT_DEBOUNCE_DELAY = 300;

export default function SqlValidator({
  sql,
  dataMartId,
  debounceDelay = DEFAULT_DEBOUNCE_DELAY,
  className = '',
  onValidationStateChange,
}: SqlValidatorProps) {
  const debouncedSql = useDebounce(sql.trim(), debounceDelay);
  const { validateSql, isLoading, result, cancel } = useSqlDryRunTrigger(dataMartId);

  useEffect(() => {
    if (!debouncedSql) {
      void cancel();
      const newState = {
        isLoading: false,
        isValid: null,
        error: null,
        bytes: null,
      };
      onValidationStateChange?.(newState);
      return;
    }

    void validateSql(debouncedSql);
  }, [debouncedSql, validateSql, cancel, onValidationStateChange]);

  useEffect(() => {
    const newState = {
      isLoading,
      isValid: result?.isValid ?? null,
      error: result?.error ?? null,
      bytes: result?.bytes ?? null,
    };
    onValidationStateChange?.(newState);
  }, [isLoading, result, onValidationStateChange]);

  const renderValidationStatus = () => {
    if (isLoading) {
      return (
        <div className='flex h-5 items-center gap-2'>
          <Loader2 className='h-4 w-4 animate-spin' />
          <span className='text-sm'>Validating...</span>
        </div>
      );
    }

    if (!result) {
      return (
        <div className='flex h-5 items-center gap-2 text-gray-500'>
          <Database className='h-4 w-4' />
          <span className='text-sm'>Type a query to get started</span>
        </div>
      );
    }

    if (result.isValid) {
      return (
        <div className='flex h-5 items-center gap-2'>
          <CheckCircle className='h-4 w-4 text-green-600' />
          <span className='text-sm font-medium text-green-600'>Valid SQL code</span>
          {result.bytes !== undefined && (
            <>
              <span className='mx-1 text-gray-400'>•</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='flex items-center gap-1'>
                    <Database className='h-3 w-3 text-gray-600' />
                    <span className='text-xs text-gray-600'>{formatBytes(result.bytes)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className='text-xs'>
                    This is an estimated volume and may differ from the actual value
                  </p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      );
    }

    return (
      <div className='flex h-9 items-center gap-2'>
        <XCircle className='h-4 w-4 flex-shrink-0 text-red-600' />
        {result.error && <span className='text-xs text-red-500'>{result.error}</span>}
      </div>
    );
  };

  return (
    <div className={`inline-flex h-9 items-center px-3 py-2 ${className}`}>
      {renderValidationStatus()}
    </div>
  );
}
