import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, Loader2, UserCog } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@owox/ui/components/button';
import { FormRadioCard, FormRadioCardGroup } from '@owox/ui/components/form';
import { getRoleDisplayName } from '../../../../idp/utils/role-display-name';
import { buildProjectPath } from '../../../../../utils/path';
import {
  type Role,
  type RoleScope,
  type UserProvisioningOrganization,
  type UserProvisioningMode,
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
import { DefaultRoleSheet } from './DefaultRoleSheet';

const ROLE_SCOPE_LABELS: Record<RoleScope, string> = {
  entire_project: 'Entire Project',
  selected_contexts: 'Selected Contexts',
};

interface UserProvisioningSettingsProps {
  contexts: ContextDto[];
  isAdmin: boolean;
}

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

function ProjectLevelAccessNotice({
  organization,
}: {
  organization: UserProvisioningOrganization | null;
}) {
  if (!organization) {
    return null;
  }

  const mainProjectLabel =
    organization.mainProjectTitle ?? organization.mainProjectId ?? 'the main project';
  const mainProjectHref = organization.mainProjectId
    ? buildProjectPath(organization.mainProjectId, '/project-settings/members')
    : null;

  return (
    <CollapsibleCard collapsible defaultCollapsed={false} name='user-provisioning-project-access'>
      <CollapsibleCardHeader>
        <CollapsibleCardHeaderTitle icon={UserCog}>Project-level access</CollapsibleCardHeaderTitle>
      </CollapsibleCardHeader>

      <CollapsibleCardContent>
        <div className='bg-background rounded-md border px-6 py-5 shadow-sm'>
          <h3 className='text-foreground text-sm font-semibold'>Manual access request</h3>
          <p className='text-muted-foreground mt-2 text-sm leading-6'>
            New members must request access before joining this project.
            <br />
            Automatically adding new members cannot be enabled here because this project belongs to
            the '{organization.name}' organization but is not the main project.
            <br />
            Organization-level provisioning is managed from the main project
            {mainProjectHref ? (
              <>
                :{' '}
                <a className='text-primary hover:underline' href={mainProjectHref}>
                  {mainProjectLabel}
                </a>
              </>
            ) : null}
          </p>
        </div>
      </CollapsibleCardContent>
      <CollapsibleCardFooter />
    </CollapsibleCard>
  );
}

export function UserProvisioningSettings({ contexts, isAdmin }: UserProvisioningSettingsProps) {
  const { settings, isLoading, isSaving, save } = useUserProvisioningSettings();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

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
  const { mode, defaultRole, roleScope, contextIds } = form.watch();

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

  if (!settings.isMainProject) {
    return <ProjectLevelAccessNotice organization={organization} />;
  }

  const isAdminRole = defaultRole === 'admin';
  const contextIdsSet = new Set(contexts.map(c => c.id));
  const knownContextIds = contextIds.filter(id => contextIdsSet.has(id));

  const handleApplyDefaultRoles = (role: Role, scope: RoleScope, ids: string[]) => {
    form.setValue('defaultRole', role, { shouldDirty: true, shouldValidate: true });
    form.setValue('roleScope', scope, { shouldDirty: true, shouldValidate: true });
    form.setValue('contextIds', ids, { shouldDirty: true, shouldValidate: true });
    setIsSheetOpen(false);
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
    <>
      <CollapsibleCard collapsible defaultCollapsed={true} name='user-provisioning-settings'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={UserCog}
            tooltip={`Control how new members from your organization domain '${organization?.name}' join the '${organization?.mainProjectTitle}' project`}
          >
            Organization-level access settings
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>

        <CollapsibleCardContent>
          <FormProvider {...form}>
            <form onSubmit={event => void form.handleSubmit(onSubmit)(event)}>
              <div className='flex flex-col gap-4'>
                <FormRadioCardGroup>
                  <FormRadioCard
                    data-testid='radio-auto-join'
                    value='automatic'
                    label={`Automatically join new members to the '${organization?.mainProjectTitle}' project`}
                    description={`New members with your '${organization?.name}' organization domain are automatically added to this project with default roles and scopes`}
                    checked={mode === 'automatic'}
                    onChange={v => {
                      form.setValue('mode', v as UserProvisioningMode, { shouldDirty: true });
                    }}
                    disabled={isSaving}
                  >
                    {mode === 'automatic' && (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='self-start'
                        data-testid='change-default-roles-btn'
                        onClick={e => {
                          e.stopPropagation();
                          setIsSheetOpen(true);
                        }}
                        disabled={isSaving}
                      >
                        {isAdminRole
                          ? getRoleDisplayName(defaultRole)
                          : `${getRoleDisplayName(defaultRole)} · ${ROLE_SCOPE_LABELS[roleScope]}`}
                        <ChevronRight className='h-4 w-4' />
                      </Button>
                    )}
                  </FormRadioCard>

                  <FormRadioCard
                    data-testid='radio-require-request'
                    value='manual'
                    label='Manual access request'
                    description='New members must request access before joining. Project Admins can approve or reject requests manually'
                    checked={mode === 'manual'}
                    onChange={v => {
                      form.setValue('mode', v as UserProvisioningMode, { shouldDirty: true });
                    }}
                    disabled={isSaving}
                  />
                </FormRadioCardGroup>

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

      <DefaultRoleSheet
        isOpen={isSheetOpen}
        onClose={() => {
          setIsSheetOpen(false);
        }}
        onApply={handleApplyDefaultRoles}
        contexts={contexts}
        defaultRole={defaultRole}
        roleScope={roleScope}
        contextIds={knownContextIds}
        disabled={isSaving}
      />
    </>
  );
}
