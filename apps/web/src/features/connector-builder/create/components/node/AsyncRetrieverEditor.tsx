import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useBuilder } from '../../../shared/model/hooks/useBuilder';
import { InfoLabel } from '../fields';
import { JsonBodyEditor } from '../JsonBodyEditor';
import { QueryParametersEditor } from './QueryParametersEditor';

type Path = (string | number)[];
type Method = 'GET' | 'POST';

function toDotArray(v: string): string[] {
  const t = v.trim();
  return t === '' ? [] : t.split('.').filter(Boolean);
}

function useRetriever(nodeName: string) {
  const { manifest, setPath } = useBuilder();
  const retriever = manifest.nodes[nodeName].retriever;
  if (!retriever) throw new Error(`Node "${nodeName}" has no async retriever`);
  return { retriever, setPath };
}

function MethodSelect({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <Select
      value={value}
      onValueChange={v => {
        onChange(v as Method);
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
  );
}

function DotPath({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string[];
  onChange: (arr: string[]) => void;
}) {
  return (
    <label className='flex flex-col'>
      <InfoLabel hint={hint}>{label}</InfoLabel>
      {/* UNCONTROLLED on purpose. The manifest stores a path as segments, so a controlled
          input has to round-trip through split/join on every keystroke — and the moment the
          user types the dot in `data.status`, the empty trailing segment is dropped and the
          dot is deleted from under the cursor. A nested path then cannot be typed at all.
          Every other dot-path field in the builder is uncontrolled for the same reason. */}
      <Input
        defaultValue={value.join('.')}
        onChange={e => {
          onChange(toDotArray(e.target.value));
        }}
        placeholder={placeholder}
        className='h-[34px] font-mono'
      />
    </label>
  );
}

function SubmitGroup({ nodeName }: { nodeName: string }) {
  const { retriever, setPath } = useRetriever(nodeName);
  const submit = retriever.submit;
  const base: Path = ['nodes', nodeName, 'retriever', 'submit'];
  return (
    <section className='flex flex-col gap-3.5'>
      <h4 className='text-foreground text-[13px] font-semibold'>Submit</h4>
      <div className='grid grid-cols-[160px_1fr] gap-3.5'>
        <label className='flex flex-col'>
          <InfoLabel hint='HTTP method that starts the job.'>Method</InfoLabel>
          <MethodSelect
            value={submit.method}
            onChange={m => {
              setPath([...base, 'method'], m);
            }}
          />
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='Endpoint that starts the async job.'>Path</InfoLabel>
          <Input
            value={submit.path}
            onChange={e => {
              setPath([...base, 'path'], e.target.value);
            }}
            placeholder='/jobs'
            className='h-[34px] font-mono'
          />
        </label>
      </div>
      <QueryParametersEditor query={submit.queryParameters ?? {}} basePath={base} scope='submit' />
      {submit.method === 'POST' && (
        <JsonBodyEditor
          label='Body (JSON)'
          hint='JSON body sent with the submit POST.'
          initial={submit.body}
          onChange={text => {
            if (text.trim() === '') {
              setPath([...base, 'body'], undefined);
              return;
            }
            try {
              setPath([...base, 'body'], JSON.parse(text) as Record<string, unknown>);
            } catch {
              /* keep last valid */
            }
          }}
        />
      )}
      <DotPath
        label='Job ID path'
        hint='Dot-path in the submit response to the job id.'
        placeholder='data.id'
        value={submit.jobIdPath}
        onChange={arr => {
          setPath([...base, 'jobIdPath'], arr);
        }}
      />
    </section>
  );
}

function PollGroup({ nodeName }: { nodeName: string }) {
  const { retriever, setPath } = useRetriever(nodeName);
  const poll = retriever.poll;
  const base: Path = ['nodes', nodeName, 'retriever', 'poll'];
  const setNum = (key: string, raw: string) => {
    setPath([...base, 'backoff', key], raw.trim() === '' ? undefined : Number(raw));
  };
  return (
    <section className='flex flex-col gap-3.5'>
      <h4 className='text-foreground text-[13px] font-semibold'>Poll</h4>
      <div className='grid grid-cols-[160px_1fr] gap-3.5'>
        <label className='flex flex-col'>
          <InfoLabel hint='HTTP method used to poll job status.'>Method</InfoLabel>
          <MethodSelect
            value={poll.method}
            onChange={m => {
              setPath([...base, 'method'], m);
            }}
          />
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='Status endpoint. {{ job.id }} is available here.'>Path</InfoLabel>
          <Input
            value={poll.path}
            onChange={e => {
              setPath([...base, 'path'], e.target.value);
            }}
            placeholder='/jobs/{{ job.id }}'
            className='h-[34px] font-mono'
          />
        </label>
      </div>
      <QueryParametersEditor query={poll.queryParameters ?? {}} basePath={base} scope='poll' />
      <DotPath
        label='Status path'
        hint='Dot-path in the poll response to the status value.'
        placeholder='data.status'
        value={poll.statusPath}
        onChange={arr => {
          setPath([...base, 'statusPath'], arr);
        }}
      />
      <div className='grid grid-cols-2 gap-3.5'>
        <label className='flex flex-col'>
          <InfoLabel hint='Status value that means the job is ready.'>Ready value</InfoLabel>
          <Input
            value={poll.readyValue}
            onChange={e => {
              setPath([...base, 'readyValue'], e.target.value);
            }}
            placeholder='COMPLETE'
            className='h-[34px]'
          />
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='Optional status value that means the job failed.'>
            Failed value (optional)
          </InfoLabel>
          <Input
            value={poll.failedValue ?? ''}
            onChange={e => {
              setPath(
                [...base, 'failedValue'],
                e.target.value.trim() === '' ? undefined : e.target.value
              );
            }}
            placeholder='FAILED'
            className='h-[34px]'
          />
        </label>
      </div>
      <DotPath
        label='Result URL path'
        hint='Dot-path in the poll response to the result download URL.'
        placeholder='data.result_url'
        value={poll.resultUrlPath}
        onChange={arr => {
          setPath([...base, 'resultUrlPath'], arr);
        }}
      />
      <div className='grid grid-cols-3 gap-3.5'>
        <label className='flex flex-col'>
          <InfoLabel hint='Maximum poll attempts before giving up.'>Max attempts</InfoLabel>
          <Input
            type='number'
            min={1}
            aria-label='Poll max attempts'
            value={poll.backoff?.maxAttempts ?? ''}
            onChange={e => {
              setNum('maxAttempts', e.target.value);
            }}
            className='h-[34px]'
          />
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='Initial delay between polls (ms).'>Initial ms</InfoLabel>
          <Input
            type='number'
            min={0}
            aria-label='Poll initial ms'
            value={poll.backoff?.initialMs ?? ''}
            onChange={e => {
              setNum('initialMs', e.target.value);
            }}
            className='h-[34px]'
          />
        </label>
        <label className='flex flex-col'>
          <InfoLabel hint='Maximum delay between polls (ms).'>Max ms</InfoLabel>
          <Input
            type='number'
            min={0}
            aria-label='Poll max ms'
            value={poll.backoff?.maxMs ?? ''}
            onChange={e => {
              setNum('maxMs', e.target.value);
            }}
            className='h-[34px]'
          />
        </label>
      </div>
    </section>
  );
}

function DownloadGroup({ nodeName }: { nodeName: string }) {
  const { retriever, setPath } = useRetriever(nodeName);
  const base: Path = ['nodes', nodeName, 'retriever', 'download'];
  return (
    <section className='flex flex-col gap-3.5'>
      <h4 className='text-foreground text-[13px] font-semibold'>Download</h4>
      <DotPath
        label='Record path'
        hint='Dot-path in the downloaded JSON to the records array (empty = top-level array).'
        placeholder='rows'
        value={retriever.download.recordPath}
        onChange={arr => {
          setPath([...base, 'recordPath'], arr);
        }}
      />
    </section>
  );
}

export function AsyncRetrieverEditor({ nodeName }: { nodeName: string }) {
  return (
    <div className='flex flex-col gap-6' data-testid='async-retriever-editor'>
      <SubmitGroup nodeName={nodeName} />
      <PollGroup nodeName={nodeName} />
      <DownloadGroup nodeName={nodeName} />
    </div>
  );
}
