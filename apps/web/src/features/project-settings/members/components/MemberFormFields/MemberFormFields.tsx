import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import {
  PROJECT_ROLE_VALUES,
  ROLE_SCOPE_VALUES,
  type Role,
  type RoleScope,
} from '../../../../../features/project-members/types';
import { getRoleDisplayName } from '../../../../../features/idp/utils/role-display-name';
import { ContextsCheckboxList } from '../../../../../features/contexts/components/ContextsCheckboxList';
import { useIsAdmin } from '../../../../../features/idp/hooks/useRole';
import type { ContextDto } from '../../../../../features/contexts/types/context.types';

export interface MemberFormFieldsProps {
  contexts: ContextDto[];
  selectedContextIds: string[];
  onToggleContext: (contextId: string, checked: boolean) => void;
  disabled?: boolean;
  onRequestCreateContext?: () => void;
  contextIdPrefix: string;
}

/** Minimum shape any parent form must satisfy to use this primitive. */
interface FormShape {
  role: Role;
  roleScope: RoleScope;
}

const ROLE_SCOPE_LABELS: Record<RoleScope, string> = {
  entire_project: 'Entire project',
  selected_contexts: 'Selected contexts only',
};

export function MemberFormFields({
  contexts,
  selectedContextIds,
  onToggleContext,
  disabled = false,
  onRequestCreateContext,
  contextIdPrefix,
}: MemberFormFieldsProps) {
  const { control, watch } = useFormContext<FormShape>();
  const role = watch('role');
  const roleScope = watch('roleScope');
  const isAdminRole = role === 'admin';
  const showContexts = !isAdminRole && roleScope === 'selected_contexts';
  const isAdmin = useIsAdmin();

  return (
    <>
      <FormSection title='Role' name='member-role'>
        <FormField
          control={control}
          name='role'
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip='Project role granted to this member'>Role</FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_ROLE_VALUES.map(r => (
                      <SelectItem key={r} value={r}>
                        {getRoleDisplayName(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
              <FormDescription>
                <Accordion variant='common' type='single' collapsible>
                  <AccordionItem value='member-role-help'>
                    <AccordionTrigger>Which role should I pick?</AccordionTrigger>
                    <AccordionContent>
                      <p className='mb-2'>
                        <strong>Business User</strong> — sees accessible Data Marts and Reports,
                        creates Reports for Data Marts shared for reporting, manages Reports they
                        own (edit, delete, change owners), manages Report Triggers under their
                        Reports, and uses Destinations shared for use. Cannot create, edit, or
                        delete Data Marts, Data Mart Triggers, or Storages.
                      </p>
                      <p className='mb-2'>
                        <strong>Technical User</strong> — everything a Business User may do, plus:
                        creates, edits, and deletes Data Marts, Data Mart Triggers, and Storages;
                        edits and deletes Reports project-wide; changes Report owners; manages
                        Report Triggers project-wide.
                      </p>
                      <p className='mb-2'>
                        <strong>Project Admin</strong> — everything a Technical User may do, plus:
                        manages Project Members, manages billing, and manages general Project
                        settings such as the Project title.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </FormDescription>
            </FormItem>
          )}
        />
      </FormSection>

      {isAdminRole ? (
        <FormSection title='Access' collapsible={false} name='member-admin-access'>
          <FormItem>
            <p className='text-muted-foreground text-sm'>
              Project Admin has project-wide access. Scope and context assignments do not apply.
            </p>
          </FormItem>
        </FormSection>
      ) : (
        <FormSection title='Scope' name='member-scope'>
          <FormField
            control={control}
            name='roleScope'
            render={({ field }) => (
              <FormItem>
                <FormLabel tooltip='Controls what resources this member can see by default'>
                  Role scope
                </FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_SCOPE_VALUES.map(s => (
                        <SelectItem key={s} value={s}>
                          {ROLE_SCOPE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
                <FormDescription>
                  <Accordion variant='common' type='single' collapsible>
                    <AccordionItem value='member-scope-help'>
                      <AccordionTrigger>What do the scopes mean?</AccordionTrigger>
                      <AccordionContent>
                        <p className='mb-2'>
                          <strong>Entire project</strong> — the member sees every shared resource in
                          the project (subject to role and ownership rules).
                        </p>
                        <p className='mb-2'>
                          <strong>Selected contexts only</strong> — the member sees resources only
                          if they share at least one assigned context, or if the member is an owner.
                          Picking this with no contexts below is a valid "no shared access" state.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </FormDescription>
              </FormItem>
            )}
          />
        </FormSection>
      )}

      {showContexts && (
        <FormSection title='Contexts' name='member-contexts'>
          <FormItem>
            <FormLabel tooltip='Contexts this member can see'>
              Assign to contexts (optional)
            </FormLabel>
            <ContextsCheckboxList
              idPrefix={contextIdPrefix}
              contexts={contexts}
              selectedIds={selectedContextIds}
              onToggle={onToggleContext}
              disabled={disabled}
              onRequestCreate={isAdmin ? onRequestCreateContext : undefined}
            />
          </FormItem>
        </FormSection>
      )}
    </>
  );
}
