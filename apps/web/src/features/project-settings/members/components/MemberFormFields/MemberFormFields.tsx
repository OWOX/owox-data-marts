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
  PROJECT_ROLE_VALUES,
  ROLE_SCOPE_VALUES,
  type Role,
  type RoleScope,
} from '../../../../project-members/types';
import { getRoleDisplayName } from '../../../../idp/utils/role-display-name.ts';
import { ContextsCheckboxList } from '../../../../contexts/components/ContextsCheckboxList.tsx';
import { useIsAdmin } from '../../../../idp';
import type { ContextDto } from '../../../../contexts/types/context.types.ts';
import { RoleHelpAccordion, ScopeHelpAccordion } from './MemberRoleHelp';

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
                <RoleHelpAccordion />
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
                  <ScopeHelpAccordion />
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
