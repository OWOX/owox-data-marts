import type { ReactNode } from 'react';
import {
  Calendar,
  Clock,
  GitBranch,
  Rows3,
  ShieldAlert,
  Table,
  Terminal,
  Wand2,
} from 'lucide-react';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import {
  createDefaultAsyncRetriever,
  type ManifestNode,
  type NodeErrorHandler,
  type ResponseFormat,
} from '../../../shared/model/manifest.types';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardHeaderActions,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../../shared/components/CollapsibleCard';
import type { AppIcon } from '../../../../../shared/icons';
import { InfoLabel, Segmented } from '../fields';
import { NodeGeneralEditor } from './NodeGeneralEditor';
import { RequestEditor } from './RequestEditor';
import { RecordSelectorEditor } from './RecordSelectorEditor';
import { FieldsEditor } from './FieldsEditor';
import { PaginationEditor } from './PaginationEditor';
import { IncrementalEditor } from './IncrementalEditor';
import { TransformationsEditor } from './TransformationsEditor';
import { ErrorHandlerEditor } from './ErrorHandlerEditor';
import { PartitionRouterEditor } from './PartitionRouterEditor';
import { RecordFilterEditor } from './RecordFilterEditor';
import { AsyncRetrieverEditor } from './AsyncRetrieverEditor';

const RESPONSE_FORMATS: { key: ResponseFormat; label: string }[] = [
  { key: 'json', label: 'JSON' },
  { key: 'csv', label: 'CSV' },
  { key: 'jsonl', label: 'JSONL' },
];
const PAGINATION_LABEL: Record<string, string> = {
  none: 'None',
  offset: 'Offset',
  page: 'Page',
  cursor: 'Cursor',
};
const INCREMENTAL_LABEL: Record<string, string> = {
  none: 'None',
  'day-by-day': 'Day-by-day',
  range: 'Range',
};
const RETRIEVER_OPTIONS: { key: 'sync' | 'async'; label: string }[] = [
  { key: 'sync', label: 'Sync' },
  { key: 'async', label: 'Async' },
];

/** A node section as a standard CollapsibleCard. `badge` (counts / "on") sits in the always-visible
 * header actions; `subtitle` (labels like the record path) shows when the card is collapsed. */
function NodeBlock({
  name,
  icon,
  title,
  tooltip,
  subtitle,
  badge,
  defaultCollapsed,
  children,
}: {
  name: string;
  icon: AppIcon;
  title: string;
  tooltip?: string;
  subtitle?: string;
  badge?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  return (
    <CollapsibleCard collapsible defaultCollapsed={defaultCollapsed} name={name}>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle icon={icon} tooltip={tooltip} subtitle={subtitle}>
          {title}
        </CollapsibleCardHeaderTitle>
        {badge != null && (
          <CollapsibleCardHeaderActions>
            <span className='bg-accent text-muted-foreground rounded-full px-[7px] py-px text-[11px]'>
              {badge}
            </span>
          </CollapsibleCardHeaderActions>
        )}
      </CollapsibleCardHeader>
      <CollapsibleCardContent>{children}</CollapsibleCardContent>
      <CollapsibleCardFooter />
    </CollapsibleCard>
  );
}

/** `T` with the keys in `K` admitted as possibly-absent. */
type Loosen<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * A node as it actually arrives here, before anything has validated it. Code mode is a
 * first-class authoring surface (and the shape an MCP-authored manifest can arrive in),
 * and `parseManifestJson` normalizes only the top level — so a node body reaches this pane
 * verbatim and may be missing `request`, `recordSelector`, `fields`, or an `errorHandler`'s
 * `responseFilters`. The engine tolerates all four: `ManifestParser` demands a
 * `recordSelector` only for sync retrievers, and validates `errorHandler.responseFilters`
 * only when it is present. `ManifestNode` declares them as required, so read the node
 * through a shape that admits their absence instead of trusting the declared type.
 */
type UnvalidatedNode = Loosen<
  Omit<ManifestNode, 'errorHandler'>,
  'request' | 'recordSelector' | 'fields'
> & { errorHandler?: Loosen<NodeErrorHandler, 'responseFilters'> };

export function NodeSections({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const nodes: Record<string, UnvalidatedNode> = manifest.nodes;
  const node = nodes[nodeName];

  const isAsync = node.retriever?.type === 'async';
  // No `fields` yet reads as no fields, which is what an empty `fields` object already shows.
  const fieldCount = Object.keys(node.fields ?? {}).length;
  const paginationType = node.pagination?.type ?? 'none';
  const incrementalStrategy = node.incremental?.strategy ?? 'none';
  const transformCount = node.transformations?.length ?? 0;
  // An errorHandler with no responseFilters reads as no filters, like having none at all.
  const errorFilterCount = node.errorHandler?.responseFilters?.length ?? 0;
  const isPartitioned = Boolean(node.partitionRouter);
  const hasRecordFilter = Boolean(node.recordFilter);

  const setRetriever = (mode: 'sync' | 'async') => {
    if (mode === 'async') {
      setPath(['nodes', nodeName, 'partitionRouter'], undefined); // engine rejects partitionRouter + async
      setPath(['nodes', nodeName, 'retriever'], createDefaultAsyncRetriever());
    } else {
      setPath(['nodes', nodeName, 'retriever'], undefined);
    }
  };

  return (
    <div className='flex flex-col gap-4' data-testid='node-sections'>
      <NodeGeneralEditor nodeName={nodeName} />

      {/* Retriever block — Request (sync) or Async job (async); the mode toggle lives inside it */}
      <CollapsibleCard collapsible name='connector-node-retriever'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={isAsync ? Clock : Terminal}
            subtitle={
              // No `request` leaves the subtitle off, exactly as an empty path already does.
              !isAsync && node.request?.path
                ? `${node.request.method} ${node.request.path}`
                : undefined
            }
            tooltip={
              isAsync
                ? 'Long-running job: submit the request, poll for completion, then download the result.'
                : 'The HTTP request this node performs to fetch records.'
            }
          >
            {isAsync ? 'Async job' : 'Request'}
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex flex-col gap-4'>
            <div className='flex items-center gap-2.5'>
              <span className='text-muted-foreground text-xs font-medium'>Retriever</span>
              <Segmented
                options={RETRIEVER_OPTIONS}
                value={isAsync ? 'async' : 'sync'}
                onChange={setRetriever}
                ariaLabel='Retriever'
              />
            </div>
            {isAsync ? (
              <AsyncRetrieverEditor nodeName={nodeName} />
            ) : (
              <RequestEditor nodeName={nodeName} />
            )}

            {/* Record path is the sync counterpart of the async Download record path */}
            {!isAsync && <RecordSelectorEditor nodeName={nodeName} />}

            <div>
              <InfoLabel hint='How the response body is decoded. CSV/JSONL yield an array, so leave the record path empty.'>
                Response format
              </InfoLabel>
              <Segmented
                options={RESPONSE_FORMATS}
                // No `recordSelector` decodes as JSON, the same default a recordSelector
                // that declares no format already gets.
                value={node.recordSelector?.responseFormat ?? 'json'}
                onChange={(f: ResponseFormat) => {
                  setPath(
                    ['nodes', nodeName, 'recordSelector', 'responseFormat'],
                    f === 'json' ? undefined : f
                  );
                }}
                ariaLabel='Response format'
              />
            </div>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>

      <NodeBlock
        name='connector-node-fields'
        icon={Table}
        title='Fields'
        tooltip='Output columns and their types.'
        badge={fieldCount > 0 ? fieldCount : undefined}
      >
        <FieldsEditor nodeName={nodeName} />
      </NodeBlock>

      <NodeBlock
        name='connector-node-incremental'
        icon={Calendar}
        title='Incremental'
        tooltip='Fetch only new data on each run, by date.'
        subtitle={INCREMENTAL_LABEL[incrementalStrategy]}
        defaultCollapsed
      >
        <IncrementalEditor nodeName={nodeName} />
      </NodeBlock>

      {!isAsync && (
        <NodeBlock
          name='connector-node-pagination'
          icon={Rows3}
          title='Pagination'
          tooltip='How to walk through multiple pages of results.'
          subtitle={PAGINATION_LABEL[paginationType]}
          defaultCollapsed
        >
          <PaginationEditor basePath={['nodes', nodeName, 'pagination']} />
        </NodeBlock>
      )}

      <NodeBlock
        name='connector-node-transformations'
        icon={Wand2}
        title='Transformations'
        tooltip='Add, remove or reshape fields before they are written.'
        badge={transformCount > 0 ? transformCount : undefined}
        defaultCollapsed
      >
        <TransformationsEditor nodeName={nodeName} />
      </NodeBlock>

      {!isAsync && (
        <NodeBlock
          name='connector-node-partition'
          icon={GitBranch}
          title='Partition'
          tooltip='Run this node once per parent record (substream).'
          badge={isPartitioned ? 'on' : undefined}
          defaultCollapsed
        >
          <PartitionRouterEditor nodeName={nodeName} />
        </NodeBlock>
      )}

      <NodeBlock
        name='connector-node-recordfilter'
        icon={Rows3}
        title='Record filter'
        tooltip='Drop records that do not match a condition.'
        badge={hasRecordFilter ? 'on' : undefined}
        defaultCollapsed
      >
        <RecordFilterEditor nodeName={nodeName} />
      </NodeBlock>

      {!isAsync && (
        <NodeBlock
          name='connector-node-errorhandler'
          icon={ShieldAlert}
          title='Error handling'
          tooltip='Retry or fail on specific HTTP responses.'
          badge={errorFilterCount > 0 ? errorFilterCount : undefined}
          defaultCollapsed
        >
          <ErrorHandlerEditor nodeName={nodeName} />
        </NodeBlock>
      )}
    </div>
  );
}
