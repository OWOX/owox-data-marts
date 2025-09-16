'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, Loader2, Database } from 'lucide-react';
import { formatBytes } from '../../../../../utils';
import { useDebounce } from '../../../../../hooks/useDebounce.ts';
import { dataMartService } from '../../../shared';
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
  const [validationState, setValidationState] = useState<SqlValidationState>({
    isLoading: false,
    isValid: null,
    error: null,
    bytes: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const debouncedSql = useDebounce(sql.trim(), debounceDelay);

  useEffect(() => {
    // Don't validate empty SQL
    if (!debouncedSql) {
      const newState = {
        isLoading: false,
        isValid: null,
        error: null,
        bytes: null,
      };
      setValidationState(newState);
      onValidationStateChange?.(newState);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const currentController = abortControllerRef.current;

    const validateQuery = async () => {
      const loadingState = {
        isLoading: true,
        isValid: null,
        error: null,
        bytes: null,
      };
      setValidationState(loadingState);
      onValidationStateChange?.(loadingState);

      try {
        const result = await dataMartService.validateSql(
          dataMartId,
          debouncedSql,
          currentController
        );

        if (!currentController.signal.aborted) {
          const newState = {
            isLoading: false,
            isValid: result.isValid,
            error: result.error,
            bytes: result.bytes ?? null,
          };
          setValidationState(newState);
          onValidationStateChange?.(newState);
        }
      } catch (error) {
        // Don't update state if request was cancelled
        if (!currentController.signal.aborted) {
          const newState = {
            isLoading: false,
            isValid: false,
            error: error instanceof Error ? error.message : 'Validation error',
            bytes: null,
          };
          setValidationState(newState);
          onValidationStateChange?.(newState);
        }
      }
    };

    void validateQuery();

    return () => {
      currentController.abort();
    };
  }, [debouncedSql, dataMartId, onValidationStateChange]);

  const renderValidationStatus = () => {
    if (validationState.isLoading) {
      return (
        <div className='flex h-5 items-center gap-2'>
          <Loader2 className='h-4 w-4 animate-spin' />
          <span className='text-sm'>Validating...</span>
        </div>
      );
    }

    if (validationState.isValid === null) {
      return (
        <div className='flex h-5 items-center gap-2 text-gray-500'>
          <Database className='h-4 w-4' />
          <span className='text-sm'>Type a query to get started</span>
        </div>
      );
    }

    if (validationState.isValid) {
      return (
        <div className='flex h-5 items-center gap-2'>
          <CheckCircle className='h-4 w-4 text-green-600' />
          <span className='text-sm font-medium text-green-600'>Valid SQL code</span>
          {validationState.bytes !== null && (
            <>
              <span className='mx-1 text-gray-400'>•</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='flex items-center gap-1'>
                    <Database className='h-3 w-3 text-gray-600' />
                    <span className='text-xs text-gray-600'>
                      {formatBytes(validationState.bytes)}
                    </span>
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
        {validationState.error && (
          <span className='text-xs text-red-500'>{validationState.error}</span>
        )}
      </div>
    );
  };

  return (
    <div className={`inline-flex h-9 items-center px-3 py-2 ${className}`}>
      {renderValidationStatus()}
    </div>
  );
}
