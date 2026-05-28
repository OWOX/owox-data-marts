import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserCog } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Switch } from '@owox/ui/components/switch';
import { ContextsCheckboxList } from '../../../../contexts/components/ContextsCheckboxList';
import { getRoleDisplayName } from '../../../../idp/utils/role-display-name';
import {
  PROJECT_ROLE_VALUES,
  type Role,
  type RoleScope,
  type UserProvisioningSettingsValue,
} from '../../../../project-members/types';
import type { ContextDto } from '../../../../contexts/types/context.types';
import { useUserProvisioningSettings } from '../../hooks/useUserProvisioningSettings';
import { userProvisioningFormSchema, type UserProvisioningFormData } from '../../schemas';
import {
  CollapsibleCard,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
  CollapsibleCardContent,
  CollapsibleCardFooter,
} from '../../../../../shared/components/CollapsibleCard';

interface UserProvisioningSettingsProps {
  contexts: ContextDto[];
  isAdmin: boolean;
}

const ROLE_SCOPE_OPTIONS: { value: RoleScope; label: string }[] = [
  { value: 'entire_project', label: 'Entire Project' },
  { value: 'selected_contexts', label: 'Selected Contexts' },
];

function normalizeDraft(draft: UserProvisioningSettingsValue): UserProvisioningFormData {
  if (draft.defaultRole === 'admin') {
    return {
      ...draft,
      roleScope: 'entire_project',
      contextIds: [],
    };
  }

  if (draft.roleScope === 'entire_project') {
    return {
      ...draft,
      contextIds: [],
    };
  }

  return draft;
}

export function UserProvisioningSettings({ contexts, isAdmin }: UserProvisioningSettingsProps) {
  const { settings, isLoading, isSaving, save } = useUserProvisioningSettings();

  const form = useForm<UserProvisioningFormData>({
    resolver: zodResolver(userProvisioningFormSchema),
    mode: 'onChange',
    defaultValues: {
      mode: 'automatic',
      defaultRole: 'viewer',
      roleScope: 'entire_project',
      contextIds: [],
    },
  });

  const { isDirty, isValid } = form.formState;
  const { defaultRole, roleScope, contextIds } = form.watch();

  const currentSettings = settings?.settings ?? null;
  const organization = settings?.organization ?? null;

  useEffect(() => {
    if (currentSettings) {
      form.reset(normalizeDraft(currentSettings));
    }
  }, [currentSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return null;
  }

  if (!settings?.isApplicable || !currentSettings) {
    return null;
  }

  if (!isAdmin) {
    return null;
  }

  const contextIdsSet = new Set(contexts.map(c => c.id));
  const knownContextIds = contextIds.filter(id => contextIdsSet.has(id));
  const staleContextCount = contextIds.length - knownContextIds.length;
  const isAdminRole = defaultRole === 'admin';

  const handleRoleChange = (role: Role) => {
    form.setValue('defaultRole', role, { shouldDirty: true, shouldValidate: true });
    if (role === 'admin') {
      form.setValue('roleScope', 'entire_project');
      form.setValue('contextIds', []);
    }
  };

  const handleRoleScopeChange = (scope: RoleScope) => {
    form.setValue('roleScope', scope, { shouldDirty: true, shouldValidate: true });
    if (scope === 'entire_project') {
      form.setValue('contextIds', []);
    }
  };

  const handleContextToggle = (contextId: string, checked: boolean) => {
    const current = form.getValues('contextIds');
    form.setValue(
      'contextIds',
      checked ? [...current, contextId] : current.filter(id => id !== contextId),
      { shouldDirty: true, shouldValidate: true }
    );
  };

  const onSubmit = async (data: UserProvisioningFormData) => {
    const normalized = normalizeDraft(data);
    try {
      await save(normalized);
      form.reset(normalized);
      toast.success('User provisioning settings updated');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update user provisioning settings'
      );
    }
  };

  const handleDiscard = () => {
    form.reset(normalizeDraft(currentSettings));
  };

  return (
    <CollapsibleCard collapsible name='user-provisioning-settings'>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle
          icon={UserCog}
          tooltip={`Control how new users from your organization domain '${organization?.name}' join to '${organization?.mainProjectTitle}' project`}
        >
          Organization-level access settings
        </CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>

      <CollapsibleCardContent>
        <FormProvider {...form}>
          <form onSubmit={event => void form.handleSubmit(onSubmit)(event)}>
            <div className='flex flex-col gap-4'>
              <div className='grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)]'>
                <div className='space-y-2'>
                  <label
                    htmlFor='user-provisioning-automatic'
                    className='flex items-center gap-3 text-sm font-medium'
                  >
                    <Switch
                      id='user-provisioning-automatic'
                      checked={form.watch('mode') === 'automatic'}
                      onCheckedChange={checked => {
                        form.setValue('mode', checked ? 'automatic' : 'manual', {
                          shouldDirty: true,
                        });
                      }}
                      disabled={isSaving}
                    />
                    <span>Automatic user provisioning</span>
                  </label>
                  <p className='text-muted-foreground text-xs'>
                    Manual mode keeps same-domain sign-ups out of automatic project assignment.
                  </p>
                </div>

                <div className='space-y-2'>
                  <label className='text-sm font-medium'>Default role</label>
                  <Select value={defaultRole} onValueChange={handleRoleChange} disabled={isSaving}>
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_ROLE_VALUES.map(role => (
                        <SelectItem key={role} value={role}>
                          {getRoleDisplayName(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-2'>
                  <label className='text-sm font-medium'>Role scope</label>
                  <Select
                    value={isAdminRole ? 'entire_project' : roleScope}
                    onValueChange={value => {
                      handleRoleScopeChange(value as RoleScope);
                    }}
                    disabled={isSaving || isAdminRole}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_SCOPE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isAdminRole ? (
                <p className='text-muted-foreground text-sm'>
                  Project Admin defaults always use Entire Project access.
                </p>
              ) : (
                roleScope === 'selected_contexts' && (
                  <div className='space-y-2'>
                    <div className='flex flex-col gap-1'>
                      <span className='text-sm font-medium'>Selected contexts</span>
                      <span className='text-muted-foreground text-xs'>
                        New users receive access only through these ODM contexts.
                      </span>
                    </div>
                    <ContextsCheckboxList
                      idPrefix='user-provisioning-context'
                      contexts={contexts}
                      selectedIds={knownContextIds}
                      onToggle={handleContextToggle}
                      disabled={isSaving}
                    />
                    {!isValid && knownContextIds.length === 0 && (
                      <p className='text-destructive text-sm'>
                        Select at least one context before saving Selected Contexts.
                      </p>
                    )}
                    {staleContextCount > 0 && (
                      <p className='text-muted-foreground text-sm'>
                        {staleContextCount} saved context is no longer available and will be removed
                        on save.
                      </p>
                    )}
                  </div>
                )
              )}

              <div className='flex items-center gap-4'>
                <Button type='submit' disabled={!isDirty || !isValid || isSaving}>
                  {isSaving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                  Save
                </Button>
                <Button type='button' variant='ghost' onClick={handleDiscard} disabled={!isDirty}>
                  Discard
                </Button>
              </div>
            </div>
          </form>
        </FormProvider>
      </CollapsibleCardContent>
      <CollapsibleCardFooter />
    </CollapsibleCard>
  );
}
