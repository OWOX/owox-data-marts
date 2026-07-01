import { useEffect, useMemo, useState } from 'react';
import { Button } from '@owox/ui/components/button';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Badge } from '@owox/ui/components/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { AlertCircle, CheckCircle2, Plus, Send } from 'lucide-react';
import { FullScreenLoader } from '@owox/ui/components/common/loading-spinner';
import { useAuth } from '../../features/idp';
import { AuthStatus, type Role } from '../../features/idp/types';
import { signIn } from '../../features/idp/services';
import { useRequestAccessContext } from '../../features/user-provisioning/hooks/useRequestAccessContext';
import {
  type RequestAccessResult,
  userProvisioningService,
} from '../../features/user-provisioning/services/user-provisioning.service';
import { buildProjectPath } from '../../utils/path';

const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Business User',
  editor: 'Technical User',
  admin: 'Project Admin',
};

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-xs font-medium uppercase'>{label}</dt>
      <dd className='mt-1 truncate text-sm font-medium'>{value}</dd>
    </div>
  );
}

export function RequestAccessPage() {
  const { status, user } = useAuth();
  const { context, loading, error, refresh } = useRequestAccessContext();
  const [selectedRole, setSelectedRole] = useState<Role>('viewer');
  const [submitted, setSubmitted] = useState<RequestAccessResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (context) {
      setSelectedRole(context.existingRequest?.role ?? context.defaultRole);
      if (context.existingRequest) {
        setSubmitted({
          userId: context.user.userId,
          projectId: context.project.projectId,
          projectTitle: context.project.projectTitle,
          request: context.existingRequest,
        });
      }
    }
  }, [context]);

  const roleOptions = useMemo(() => context?.availableRoles ?? [], [context?.availableRoles]);

  if (status === AuthStatus.LOADING || loading) {
    return <FullScreenLoader />;
  }

  if (status !== AuthStatus.AUTHENTICATED || !user) {
    return <FullScreenLoader />;
  }

  const handleRequestAccess = async () => {
    setSubmitting(true);
    setActionError(null);
    try {
      setSubmitted(await userProvisioningService.requestAccess(selectedRole));
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to request access');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProject = async () => {
    setCreatingProject(true);
    setActionError(null);
    try {
      const project = await userProvisioningService.createNewProject();
      const redirect = buildProjectPath(project.projectId, '/data-marts');
      signIn({ projectId: project.projectId, redirect });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create project');
      setCreatingProject(false);
    }
  };

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Request project access</h1>
        {context && (
          <p className='text-muted-foreground mt-2 text-sm'>
            {[context.organization?.name, context.project.projectTitle].filter(Boolean).join(' · ')}
          </p>
        )}
      </header>

      <div className='dm-page-content'>
        <div className='w-full max-w-3xl'>
          {error && (
            <Alert variant='destructive' className='mb-4'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>Could not load access request</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {actionError && (
            <Alert variant='destructive' className='mb-4'>
              <AlertCircle className='h-4 w-4' />
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {context && (
            <div className='dm-card flex flex-col gap-3'>
              <section className='dm-card-block'>
                <dl className='grid gap-4 sm:grid-cols-3'>
                  <SummaryItem label='Account' value={context.user.email} />
                  <SummaryItem label='Project' value={context.project.projectTitle} />
                  {context.organization?.name && (
                    <SummaryItem label='Organization' value={context.organization.name} />
                  )}
                </dl>
              </section>

              <section className='dm-card-block'>
                {submitted ? (
                  <div className='flex min-w-0 items-start gap-3'>
                    <span className='bg-primary/10 text-primary mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md'>
                      <CheckCircle2 className='h-4 w-4' />
                    </span>
                    <div className='min-w-0 space-y-2'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <h2 className='text-sm font-medium'>Access request submitted</h2>
                        <Badge variant='secondary' className='capitalize'>
                          {submitted.request.status}
                        </Badge>
                      </div>
                      <p className='text-muted-foreground text-sm'>
                        Requested role: {ROLE_LABELS[submitted.request.role]}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className='space-y-2'>
                    <label className='text-sm font-medium' htmlFor='request-access-role'>
                      Requested role
                    </label>
                    <Select
                      value={selectedRole}
                      onValueChange={value => {
                        setSelectedRole(value as Role);
                      }}
                    >
                      <SelectTrigger
                        id='request-access-role'
                        className='dm-card-formcontrol w-full'
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map(role => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </section>

              <section className='dm-card-block !gap-3'>
                <div className='flex flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
                  <Button
                    variant='outline'
                    onClick={() => {
                      void handleCreateProject();
                    }}
                    disabled={creatingProject}
                  >
                    <Plus className='mr-2 h-4 w-4' />
                    {creatingProject ? 'Creating...' : 'Create new project'}
                  </Button>
                  {!submitted && (
                    <Button
                      onClick={() => {
                        void handleRequestAccess();
                      }}
                      disabled={submitting}
                    >
                      <Send className='mr-2 h-4 w-4' />
                      {submitting ? 'Submitting...' : 'Request access'}
                    </Button>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
