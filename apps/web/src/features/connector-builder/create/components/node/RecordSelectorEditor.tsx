import { Input } from '@owox/ui/components/input';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import { InfoLabel } from '../fields';

/**
 * A node as it actually arrives here, before anything has validated it. Code mode is a
 * first-class authoring surface (and the shape an MCP-authored manifest can arrive in),
 * and `parseManifestJson` normalizes only the top level — so a node can reach this editor
 * with no `recordSelector` at all (the engine's `ManifestParser` demands one only for sync
 * retrievers) or with a `recordSelector` that carries no `recordPath` (the engine's
 * `RecordSelector` falls back to `[]`). `ManifestNode` promises that neither is possible,
 * so read the node through a shape that admits both instead of trusting the declared type.
 */
interface UnvalidatedNode {
  recordSelector?: { recordPath?: string[] };
}

export function RecordSelectorEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const nodes: Record<string, UnvalidatedNode | undefined> = manifest.nodes;
  const rawPath = nodes[nodeName]?.recordSelector?.recordPath;
  // Same tolerance as the engine: anything that is not an array of segments is an empty path.
  const recordPath = Array.isArray(rawPath) ? rawPath : [];

  return (
    <div className='flex flex-col gap-3.5' data-testid='record-selector-editor'>
      <label className='flex flex-col'>
        <InfoLabel hint='JSON path to the array of records in the response.'>Record path</InfoLabel>
        <Input
          value={recordPath.join('.')}
          onChange={e => {
            const v = e.target.value.trim();
            setPath(
              ['nodes', nodeName, 'recordSelector', 'recordPath'],
              v === '' ? [] : v.split('.')
            );
          }}
          placeholder='data.items (leave empty for the top-level array)'
          className='h-[34px] font-mono'
        />
        <span className='text-muted-foreground mt-1.5 text-xs'>
          Dot-path to the array of records in the response. Empty = the response is itself the
          array.
        </span>
      </label>
    </div>
  );
}
