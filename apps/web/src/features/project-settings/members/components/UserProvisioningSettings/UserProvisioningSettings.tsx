import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Settings2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Button } from '@owox/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Switch } from '@owox/ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { ContextsCheckboxList } from '../../../../contexts/components/ContextsCheckboxList';
import { getRoleDisplayName } from '../../../../idp/utils/role-display-name';
import {
  PROJECT_ROLE_VALUES,
  type Role,
  type RoleScope,
  type UserProvisioningMode,
  type UserProvisioningSettingsValue,
} from '../../../../project-members/types';
import type { ContextDto } from '../../../../contexts/types/context.types';
import { useUserProvisioningSettings } from '../../hooks/useUserProvisioningSettings';
import { ADMIN_ONLY_MEMBERS_HINT } from '../../constants';

interface UserProvisioningSettingsProps {
  contexts: ContextDto[];
  isAdmin: boolean;
}

const ROLE_SCOPE_OPTIONS: { value: RoleScope; label: string }[] = [
  { value: 'entire_project', label: 'Entire Project' },
  { value: 'selected_contexts', label: 'Selected Contexts' },
];

const DEFAULT_DRAFT: UserProvisioningSettingsValue = {
  mode: 'automatic',
  defaultRole: 'viewer',
  roleScope: 'entire_project',
  contextIds: [],
};

function normalizeDraft(draft: UserProvisioningSettingsValue): UserProvisioningSettingsValue {
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

function areSettingsEqual(a: UserProvisioningSettingsValue, b: UserProvisioningSettingsValue) {
  if (a.mode !== b.mode || a.defaultRole !== b.defaultRole || a.roleScope !== b.roleScope) {
    return false;
  }

  const aIds = [...a.contextIds].sort();
  const bIds = [...b.contextIds].sort();
  return aIds.length === bIds.length && aIds.every((id, index) => id === bIds[index]);
}

function AdminOnlyTooltip({
  enabled,
  children,
  className = 'block',
}: {
  enabled: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{ADMIN_ONLY_MEMBERS_HINT}</TooltipContent>
    </Tooltip>
  );
}

export function UserProvisioningSettings({ contexts, isAdmin }: UserProvisioningSettingsProps) {
  const { settings, isLoading, isSaving, save } = useUserProvisioningSettings();
  const [draft, setDraft] = useState<UserProvisioningSettingsValue>(DEFAULT_DRAFT);

  const contextIdsSet = useMemo(() => new Set(contexts.map(context => context.id)), [contexts]);

  const currentSettings = settings?.settings ?? null;
  const organization = settings?.organization ?? null;

  useEffect(() => {
    if (currentSettings) {
      setDraft(normalizeDraft(currentSettings));
    }
  }, [currentSettings]);

  if (isLoading) {
    return null;
  }

  if (!settings?.isApplicable || !currentSettings) {
    return null;
  }

  const knownContextIds = draft.contextIds.filter(id => contextIdsSet.has(id));
  const staleContextCount = draft.contextIds.length - knownContextIds.length;
  const normalizedDraft = normalizeDraft({
    ...draft,
    contextIds: knownContextIds,
  });
  const normalizedCurrent = normalizeDraft({
    ...currentSettings,
    contextIds: currentSettings.contextIds.filter(id => contextIdsSet.has(id)),
  });
  const isAdminRole = draft.defaultRole === 'admin';
  const showAdminOnlyHint = !isAdmin;
  const selectedContextsMissing =
    !isAdminRole && draft.roleScope === 'selected_contexts' && knownContextIds.length === 0;
  const isDirty = !areSettingsEqual(normalizedDraft, normalizedCurrent);
  const readOnly = !isAdmin || isSaving;
  const canSave = isAdmin && isDirty && !selectedContextsMissing && !isSaving;

  const setMode = (mode: UserProvisioningMode) => {
    setDraft(prev => normalizeDraft({ ...prev, mode }));
  };

  const setDefaultRole = (role: Role) => {
    setDraft(prev => normalizeDraft({ ...prev, defaultRole: role }));
  };

  const setRoleScope = (roleScope: RoleScope) => {
    setDraft(prev => normalizeDraft({ ...prev, roleScope }));
  };

  const toggleContext = (contextId: string, checked: boolean) => {
    setDraft(prev => {
      const contextIds = checked
        ? [...prev.contextIds, contextId]
        : prev.contextIds.filter(id => id !== contextId);
      return normalizeDraft({ ...prev, contextIds });
    });
  };

  const handleSave = async () => {
    if (!canSave) return;

    try {
      await save(normalizedDraft);
      toast.success('User provisioning settings updated');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update user provisioning settings'
      );
    }
  };

  return (
    <section className='dm-card mb-4 p-4' aria-labelledby='user-provisioning-title'>
      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex min-w-0 items-start gap-3'>
            <span className='bg-primary/10 text-primary mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md'>
              <Settings2 className='h-4 w-4' />
            </span>
            <div className='min-w-0'>
              <h2 id='user-provisioning-title' className='text-base font-medium'>
                User Provisioning
              </h2>
              <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
                <span>{organization?.name}</span>
                {organization?.mainProjectTitle && (
                  <>
                    <span aria-hidden='true'>·</span>
                    <span>Main project: {organization.mainProjectTitle}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {isAdmin && (
            <Button type='button' size='sm' onClick={() => void handleSave()} disabled={!canSave}>
              {isSaving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Save changes
            </Button>
          )}
        </div>

        <div className='grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)]'>
          <div className='space-y-2'>
            <label
              htmlFor='user-provisioning-automatic'
              className='flex items-center gap-3 text-sm font-medium'
            >
              <AdminOnlyTooltip enabled={showAdminOnlyHint} className='inline-flex'>
                <Switch
                  id='user-provisioning-automatic'
                  checked={draft.mode === 'automatic'}
                  onCheckedChange={checked => {
                    setMode(checked ? 'automatic' : 'manual');
                  }}
                  disabled={readOnly}
                />
              </AdminOnlyTooltip>
              <span>Automatic user provisioning</span>
            </label>
            <p className='text-muted-foreground text-xs'>
              Manual mode keeps same-domain sign-ups out of automatic project assignment.
            </p>
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium'>Default role</label>
            <AdminOnlyTooltip enabled={showAdminOnlyHint}>
              <Select value={draft.defaultRole} onValueChange={setDefaultRole} disabled={readOnly}>
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
            </AdminOnlyTooltip>
          </div>

          <div className='space-y-2'>
            <label className='text-sm font-medium'>Role scope</label>
            <AdminOnlyTooltip enabled={showAdminOnlyHint}>
              <Select
                value={isAdminRole ? 'entire_project' : draft.roleScope}
                onValueChange={value => {
                  setRoleScope(value as RoleScope);
                }}
                disabled={readOnly || isAdminRole}
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
            </AdminOnlyTooltip>
          </div>
        </div>

        {isAdminRole ? (
          <p className='text-muted-foreground text-sm'>
            Project Admin defaults always use Entire Project access.
          </p>
        ) : (
          draft.roleScope === 'selected_contexts' && (
            <div className='space-y-2'>
              <div className='flex flex-col gap-1'>
                <span className='text-sm font-medium'>Selected contexts</span>
                <span className='text-muted-foreground text-xs'>
                  New users receive access only through these ODM contexts.
                </span>
              </div>
              <AdminOnlyTooltip enabled={showAdminOnlyHint}>
                <ContextsCheckboxList
                  idPrefix='user-provisioning-context'
                  contexts={contexts}
                  selectedIds={knownContextIds}
                  onToggle={toggleContext}
                  disabled={readOnly}
                />
              </AdminOnlyTooltip>
              {selectedContextsMissing && (
                <p className='text-destructive text-sm'>
                  Select at least one context before saving Selected Contexts.
                </p>
              )}
              {staleContextCount > 0 && (
                <p className='text-muted-foreground text-sm'>
                  {staleContextCount} saved context is no longer available and will be removed on
                  save.
                </p>
              )}
            </div>
          )
        )}

        <Accordion variant='common' type='single' collapsible>
          <AccordionItem value='user-provisioning-help'>
            <AccordionTrigger>How it works?</AccordionTrigger>
            <AccordionContent>
              <p className='mb-2'>
                Automatic mode adds new users from the same corporate domain to this BI project
                using the default role. Manual mode keeps the project assignment under admin
                control.
              </p>
              <p>
                Role scope is applied by OWOX Data Marts. Entire Project keeps the usual
                project-wide access, while Selected Contexts limits newly provisioned users to the
                chosen contexts.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}
