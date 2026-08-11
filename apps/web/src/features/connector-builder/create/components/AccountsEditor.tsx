import { Input } from '@owox/ui/components/input';
import { Checkbox } from '@owox/ui/components/checkbox';
import { Users } from 'lucide-react';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../shared/components/CollapsibleCard';
import { useBuilder } from '../../shared/model/hooks/useBuilder';
import { createDefaultAccounts } from '../../shared/model/manifest.types';
import { InfoLabel } from './fields';
import { ParameterPicker } from './ParameterPicker';

export function AccountsEditor() {
  const { manifest, setPath } = useBuilder();
  const accounts = manifest.accounts;
  const enabled = Boolean(accounts);
  const parse = accounts?.parse ?? {};

  const toggle = (checked: boolean) => {
    setPath(['accounts'], checked ? createDefaultAccounts() : undefined);
  };
  const setParse = (key: 'split' | 'strip' | 'prefix', raw: string) => {
    setPath(['accounts', 'parse', key], raw === '' ? undefined : raw);
  };

  return (
    <div data-testid='accounts-editor'>
      <CollapsibleCard collapsible defaultCollapsed name='connector-accounts'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={Users}
            tooltip='Iterate the connector over multiple accounts'
          >
            Accounts
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <label className='flex items-center gap-2.5'>
            <Checkbox
              checked={enabled}
              onCheckedChange={c => {
                toggle(c === true);
              }}
              aria-label='Iterate over multiple accounts'
            />
            <span className='text-foreground text-[13.5px]'>Iterate over multiple accounts</span>
          </label>

          {enabled && accounts && (
            <div className='mt-4 flex flex-col gap-3.5'>
              <label className='flex flex-col'>
                <InfoLabel hint='Template that resolves to the account list. The result is split into account ids, and {{ account.id }} becomes available in node request templates.'>
                  From
                </InfoLabel>
                <div className='relative'>
                  <Input
                    value={accounts.from}
                    onChange={e => {
                      setPath(['accounts', 'from'], e.target.value);
                    }}
                    placeholder='{{ parameters.AccountIds }}'
                    className='h-[34px] pr-9 font-mono'
                  />
                  <ParameterPicker
                    onInsert={token => {
                      setPath(['accounts', 'from'], `${accounts.from}${token}`);
                    }}
                  />
                </div>
              </label>

              <div className='grid grid-cols-2 gap-3.5'>
                <label className='flex flex-col'>
                  <InfoLabel hint='Regular expression used to split the resolved value into individual account ids. Defaults to [,;] — i.e. commas or semicolons.'>
                    Split (regex)
                  </InfoLabel>
                  <Input
                    value={parse.split ?? ''}
                    onChange={e => {
                      setParse('split', e.target.value);
                    }}
                    placeholder='[,;]'
                    className='h-[34px] font-mono'
                  />
                </label>
                <label className='flex flex-col'>
                  <InfoLabel hint='Characters trimmed from the start and end of each id after splitting — handy for removing quotes or brackets.'>
                    Strip
                  </InfoLabel>
                  <Input
                    value={parse.strip ?? ''}
                    onChange={e => {
                      setParse('strip', e.target.value);
                    }}
                    placeholder='"'
                    className='h-[34px] font-mono'
                  />
                </label>
                <label className='flex flex-col'>
                  <InfoLabel hint='Text prepended to every account id after splitting — e.g. act_ turns 123 into act_123.'>
                    Prefix
                  </InfoLabel>
                  <Input
                    value={parse.prefix ?? ''}
                    onChange={e => {
                      setParse('prefix', e.target.value);
                    }}
                    placeholder='act_'
                    className='h-[34px] font-mono'
                  />
                </label>
                <label className='flex items-center gap-2.5 pt-6'>
                  <Checkbox
                    checked={parse.trim !== false}
                    onCheckedChange={c => {
                      setPath(['accounts', 'parse', 'trim'], c === true ? undefined : false);
                    }}
                    aria-label='Trim account ids'
                  />
                  <span className='text-foreground text-[13.5px]'>Trim each id</span>
                </label>
              </div>
            </div>
          )}
        </CollapsibleCardContent>
        <CollapsibleCardFooter />
      </CollapsibleCard>
    </div>
  );
}
