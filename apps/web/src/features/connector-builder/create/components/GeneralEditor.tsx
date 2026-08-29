import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import { GitCompare } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../shared/components/CollapsibleCard';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { InfoLabel } from './fields';
import { AdvancedSettingsEditor } from './AdvancedSettingsEditor';

export function GeneralEditor() {
  const { manifest, setPath, state } = useBuilder();
  // The name is written into the connector's definition row by create() and never again. It
  // is the key data marts resolve this connector by — `connector.source.name`, the same field
  // a bundled connector fills, which is why it is a name and not the row's id: bundled
  // connectors have no id. Renaming would strand every data mart pointing at the old name,
  // with no error at either end, so no endpoint offers it. Deleting the connector frees the
  // name, which is the supported way to change it.
  //
  // The fields beside it are display-only and DO save: saveDraft syncs them onto the row.
  const nameLocked = state.id !== null;
  return (
    <div className='flex flex-col gap-4 px-6 py-[18px]' data-testid='general-editor'>
      <CollapsibleCard collapsible name='connector-general'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={GitCompare} tooltip='Connector identity & endpoint'>
            General
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='grid grid-cols-1 gap-x-5 gap-y-3.5 sm:grid-cols-2'>
            <label className='flex flex-col'>
              <InfoLabel
                hint={
                  nameLocked
                    ? 'Internal identifier this connector is referenced by, in the manifest, in API calls and in every data mart using it. It cannot be changed — delete the connector and create it again to use a different name.'
                    : 'Internal identifier used in code, the manifest and API calls. Use letters and numbers without spaces, e.g. MyCustomApi. It cannot be changed once the connector is created.'
                }
              >
                Name
              </InfoLabel>
              <Input
                value={manifest.name}
                onChange={e => {
                  setPath(['name'], e.target.value);
                }}
                placeholder='MyCustomApi'
                readOnly={nameLocked}
                className={nameLocked ? 'text-muted-foreground' : undefined}
              />
            </label>
            <label className='flex flex-col'>
              <InfoLabel hint='Friendly display name shown across the product — in connector lists, pickers and data marts. Spaces and capitalization are fine, e.g. My Custom API.'>
                Title
              </InfoLabel>
              <Input
                value={manifest.title ?? ''}
                onChange={e => {
                  setPath(['title'], e.target.value);
                }}
                placeholder='My Custom API'
              />
            </label>
            <label className='flex flex-col'>
              <InfoLabel hint='Root address every request starts from. Each node’s path is appended to it, so omit the trailing slash, e.g. https://api.example.com.'>
                Base URL
              </InfoLabel>
              <Input
                value={manifest.baseUrl}
                onChange={e => {
                  setPath(['baseUrl'], e.target.value);
                }}
                placeholder='https://api.example.com'
                className='font-mono'
              />
            </label>
            <label className='flex flex-col'>
              <InfoLabel hint='Link to the source API’s official documentation. Shown only as a reference while editing — it does not affect how data is fetched.'>
                Docs URL
              </InfoLabel>
              <Input
                value={manifest.docUrl ?? ''}
                onChange={e => {
                  setPath(['docUrl'], e.target.value);
                }}
                placeholder='https://example.com/docs'
                className='font-mono'
              />
            </label>
            <label className='flex flex-col sm:col-span-2'>
              <InfoLabel hint='Optional summary of what this connector pulls and from which API. Shown to users when they pick the connector.'>
                Description
              </InfoLabel>
              <Textarea
                value={manifest.description ?? ''}
                onChange={e => {
                  setPath(['description'], e.target.value);
                }}
                rows={2}
              />
            </label>
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>

      <AdvancedSettingsEditor />
    </div>
  );
}
