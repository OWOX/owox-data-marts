import { Fragment, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import { cn } from '@owox/ui/lib/utils';
import type { FlowParam } from '../connector-flow.utils';
import { CopyValueButton } from './DataFlowValueActions';

interface DataFlowParamsProps {
  /** Always visible params. */
  primary: FlowParam[];
  /** Params revealed by the "more" toggle. */
  secondary?: FlowParam[];
}

/**
 * Label/value list of a data flow node. Values are identifiers, so they use a monospace
 * face and wrap anywhere instead of overflowing the node; a param with `copyValue` gets
 * a copy button. Secondary params stay collapsed behind a "N more" toggle.
 */
export function DataFlowParams({ primary, secondary = [] }: DataFlowParamsProps) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const visible = expanded ? [...primary, ...secondary] : primary;

  return (
    <>
      <dl
        id={listId}
        className='mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-0.5'
      >
        {visible.map(param => (
          <Fragment key={param.label}>
            <dt className='text-muted-foreground text-sm leading-[22px]'>{param.label}</dt>
            {/* The copy button sits beside the value block, so it never wraps away from it. */}
            <dd className='flex min-w-0 items-start font-mono text-sm leading-[22px] font-medium'>
              <span className='min-w-0 [overflow-wrap:anywhere]'>
                {param.href ? (
                  <ExternalAnchor variant='inline' href={param.href}>
                    {param.value}
                  </ExternalAnchor>
                ) : (
                  param.value
                )}
              </span>
              {param.copyValue && (
                <CopyValueButton
                  value={param.copyValue}
                  label={`Copy ${param.label.toLowerCase()} name`}
                />
              )}
            </dd>
          </Fragment>
        ))}
      </dl>
      {secondary.length > 0 && (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => {
            setExpanded(value => !value);
          }}
          className='text-muted-foreground mt-1 -ml-2 h-7 gap-1 px-2 text-xs'
        >
          {expanded ? 'Show less' : `${String(secondary.length)} more`}
          <ChevronDown className={cn('size-3.5', expanded && 'rotate-180')} />
        </Button>
      )}
    </>
  );
}
