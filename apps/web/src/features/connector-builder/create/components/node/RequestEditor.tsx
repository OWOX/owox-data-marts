import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import type { ManifestNode, ManifestNodeRequest } from '../../../shared/model/manifest.types';
import { InfoLabel } from '../fields';
import { JsonBodyEditor } from '../JsonBodyEditor';
import { QueryParametersEditor } from './QueryParametersEditor';

/** `T` with the keys in `K` admitted as possibly-absent. */
type Loosen<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * A node as it actually arrives here, before anything has validated it. Code mode is a
 * first-class authoring surface (and the shape an MCP-authored manifest can arrive in),
 * and `parseManifestJson` normalizes only the top level — so a node body reaches this
 * editor verbatim and may carry no `request` at all, or a `request` that declares neither
 * `method` nor `path`. The engine's `ManifestParser` only checks that a sync node has a
 * `request` object; it never looks at `method` or `path`, and `Requester` reads a missing
 * method as `GET`. `ManifestNode` declares all three as required, so read the node through
 * a shape that admits their absence instead of trusting the declared type.
 */
interface UnvalidatedNode {
  request?: Loosen<ManifestNodeRequest, 'method' | 'path'>;
}

export function RequestEditor({ nodeName }: { nodeName: string }) {
  const { manifest, setPath } = useBuilder();
  const nodes: Record<string, UnvalidatedNode> = manifest.nodes;
  const request = nodes[nodeName].request;
  // Same fallback the engine applies: no method means GET.
  const method = request?.method ?? 'GET';

  const base = ['nodes', nodeName, 'request'] as (string | number)[];

  const setMethod = (method: ManifestNode['request']['method']) => {
    setPath([...base, 'method'], method);
  };
  const setBody = (text: string) => {
    if (text.trim() === '') {
      setPath([...base, 'body'], undefined);
      return;
    }
    try {
      setPath([...base, 'body'], JSON.parse(text) as Record<string, unknown>);
    } catch {
      /* keep last valid */
    }
  };

  return (
    <div className='flex flex-col gap-4' data-testid='request-editor'>
      <div className='grid grid-cols-[160px_1fr] gap-3.5'>
        <label className='flex flex-col'>
          <InfoLabel hint='HTTP method for this stream request.'>HTTP Method</InfoLabel>
          <Select
            value={method}
            onValueChange={v => {
              setMethod(v as ManifestNode['request']['method']);
            }}
          >
            <SelectTrigger className='h-[34px] w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='GET'>GET</SelectItem>
              <SelectItem value='POST'>POST</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='Path appended to the base URL for this node.'>Path</InfoLabel>
          <Input
            // No path yet reads as an empty path, which is what a request declaring
            // `"path": ""` already shows.
            value={request?.path ?? ''}
            onChange={e => {
              setPath([...base, 'path'], e.target.value);
            }}
            placeholder='/v1/items'
            className='h-[34px] font-mono'
          />
        </label>
      </div>

      <QueryParametersEditor query={request?.queryParameters ?? {}} basePath={base} />

      {method === 'POST' && (
        <JsonBodyEditor
          label='Body (JSON)'
          hint='Request body sent with the POST.'
          initial={request?.body}
          onChange={setBody}
          testId='request-body'
        />
      )}
    </div>
  );
}
