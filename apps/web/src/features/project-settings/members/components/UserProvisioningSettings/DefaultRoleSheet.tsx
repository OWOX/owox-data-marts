import { useEffect, useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@owox/ui/components/sheet';
import { Button } from '@owox/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { FormActions, FormItem, FormLayout, FormSection } from '@owox/ui/components/form';
import { Label } from '@owox/ui/components/label';
import { ContextsCheckboxList } from '../../../../contexts/components/ContextsCheckboxList';
import { getRoleDisplayName } from '../../../../idp/utils/role-display-name';
import {
  PROJECT_ROLE_VALUES,
  ROLE_SCOPE_VALUES,
  type Role,
  type RoleScope,
} from '../../../../project-members/types';
import type { ContextDto } from '../../../../contexts/types/context.types';
import { RoleHelpAccordion, ScopeHelpAccordion } from '../MemberFormFields/MemberRoleHelp';

const ROLE_SCOPE_LABELS: Record<RoleScope, string> = {
  entire_project: 'Entire Project',
  selected_contexts: 'Selected Contexts',
};

interface DefaultRoleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (role: Role, roleScope: RoleScope, contextIds: string[]) => void;
  contexts: ContextDto[];
  defaultRole: Role;
  roleScope: RoleScope;
  contextIds: string[];
  disabled?: boolean;
}

export function DefaultRoleSheet({
  isOpen,
  onClose,
  onApply,
  contexts,
  defaultRole,
  roleScope,
  contextIds,
  disabled = false,
}: DefaultRoleSheetProps) {
  const [localRole, setLocalRole] = useState<Role>(defaultRole);
  const [localRoleScope, setLocalRoleScope] = useState<RoleScope>(roleScope);
  const [localContextIds, setLocalContextIds] = useState<string[]>(contextIds);
  const initialStateRef = useRef({ role: defaultRole, roleScope, contextIds });

  useEffect(() => {
    if (isOpen) {
      setLocalRole(defaultRole);
      setLocalRoleScope(roleScope);
      setLocalContextIds(contextIds);
      initialStateRef.current = { role: defaultRole, roleScope, contextIds };
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdminRole = localRole === 'admin';
  const showContexts = !isAdminRole && localRoleScope === 'selected_contexts';

  const contextIdsSet = new Set(contexts.map(c => c.id));
  const knownLocalContextIds = localContextIds.filter(id => contextIdsSet.has(id));
  const staleContextCount = localContextIds.length - knownLocalContextIds.length;

  const initial = initialStateRef.current;
  const hasChanges =
    localRole !== initial.role ||
    localRoleScope !== initial.roleScope ||
    [...localContextIds].sort().join(',') !== [...initial.contextIds].sort().join(',');

  const isApplyDisabled =
    disabled ||
    !hasChanges ||
    (!isAdminRole && localRoleScope === 'selected_contexts' && knownLocalContextIds.length === 0);

  const handleRoleChange = (role: Role) => {
    setLocalRole(role);
    if (role === 'admin') {
      setLocalRoleScope('entire_project');
      setLocalContextIds([]);
    }
  };

  const handleRoleScopeChange = (scope: RoleScope) => {
    setLocalRoleScope(scope);
    if (scope === 'entire_project') {
      setLocalContextIds([]);
    }
  };

  const handleContextToggle = (contextId: string, checked: boolean) => {
    setLocalContextIds(prev =>
      checked ? [...prev, contextId] : prev.filter(id => id !== contextId)
    );
  };

  const handleApply = () => {
    onApply(localRole, localRoleScope, knownLocalContextIds);
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Default roles and scopes</SheetTitle>
          <SheetDescription>
            Configure the defaults for new members who automatically join this project
          </SheetDescription>
        </SheetHeader>

        <FormLayout>
          <FormSection title='Role' name='default-role-role'>
            <FormItem>
              <Label>Role</Label>
              <Select value={localRole} onValueChange={handleRoleChange} disabled={disabled}>
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
              <RoleHelpAccordion />
            </FormItem>
          </FormSection>

          {isAdminRole ? (
            <FormSection title='Access' name='default-role-admin-access'>
              <FormItem>
                <p className='text-muted-foreground text-sm'>
                  Project Admin has project-wide access. Scope and context assignments do not apply.
                </p>
              </FormItem>
            </FormSection>
          ) : (
            <FormSection title='Scope' name='default-role-scope'>
              <FormItem>
                <Label>Role scope</Label>
                <Select
                  value={localRoleScope}
                  onValueChange={value => {
                    handleRoleScopeChange(value as RoleScope);
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_SCOPE_VALUES.map(scope => (
                      <SelectItem key={scope} value={scope}>
                        {ROLE_SCOPE_LABELS[scope]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ScopeHelpAccordion />
              </FormItem>
            </FormSection>
          )}

          {showContexts && (
            <FormSection title='Contexts' name='default-role-contexts'>
              <FormItem>
                <Label>Assign to contexts (optional)</Label>
                <ContextsCheckboxList
                  idPrefix='default-role-ctx'
                  contexts={contexts}
                  selectedIds={knownLocalContextIds}
                  onToggle={handleContextToggle}
                  disabled={disabled}
                />
                {staleContextCount > 0 && (
                  <p className='text-muted-foreground text-sm'>
                    {staleContextCount} saved{' '}
                    {staleContextCount === 1 ? 'context is' : 'contexts are'} no longer available
                    and will be removed on save.
                  </p>
                )}
              </FormItem>
            </FormSection>
          )}
        </FormLayout>

        <FormActions>
          <Button className='w-full' disabled={isApplyDisabled} onClick={handleApply}>
            Apply
          </Button>
          <Button variant='outline' className='w-full' onClick={onClose}>
            Cancel
          </Button>
        </FormActions>
      </SheetContent>
    </Sheet>
  );
}
