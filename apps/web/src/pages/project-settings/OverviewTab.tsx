import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { toast } from 'sonner';
import {
  BookOpenIcon,
  ChartNoAxesColumn,
  ExternalLink,
  FileText,
  Plug,
  Settings,
} from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { LoadingSpinner } from '@owox/ui/components/common/loading-spinner';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../shared/components/CollapsibleCard';
import { useUser } from '../../features/idp/hooks/useAuthState';
import {
  MY_ACCOUNT_PATH,
  MY_ACCOUNT_PROJECTS_PATH,
} from '../../features/idp/utils/my-account-path';
import { getAccountApiOrigin } from '../../features/my-account/use-account-api-origin';
import { getCloudBillingOrigin } from '../../features/cloud-billing/cloud-billing';
import { useFlags } from '../../app/store/hooks';
import { useProjectRoute } from '../../shared/hooks';
import { checkVisible } from '../../utils/check-visible';
import { useMembersSettings } from '../../features/project-settings/members/model/members-settings.context';
import { dataMartService } from '../../features/data-marts/shared/services/data-mart.service';
import { dataStorageApiService } from '../../features/data-storage/shared/api/data-storage-api.service';
import { dataDestinationService } from '../../features/data-destination/shared/services/data-destination.service';
import { contextService } from '../../features/contexts/services/context.service';
import { Box, Database, ArchiveRestore, Tags, Users as UsersIcon } from 'lucide-react';
import { CopyButton, CopyButtonVariant } from '@owox/ui/components/common/copy-button';
import { useClipboard } from '../../hooks/useClipboard';
import { useProjects } from '../../features/idp/hooks/useProjects';
import { RequestStatus } from '../../shared/types/request-status';
import { useIsAdmin } from '../../features/idp/hooks/useRole';
import { useProjectSettings } from '../../features/project-settings/overview';
import { InlineEditDescription } from '../../shared/components/InlineEditDescription';
import { Skeleton } from '@owox/ui/components/skeleton';
import { ProjectNameEditor } from '../../features/project-settings/management/ProjectNameEditor';
import {
  ProjectDeletionCard,
  type ProjectDeletionOutcome,
} from '../../features/project-settings/management/ProjectDeletionCard';
import {
  getProjectStatus,
  projectStatusLabels,
} from '../../features/project-settings/management/project-status';
import { getCloudProjectApiOrigin } from '../../features/project-settings/management/project-management.service';
import { StatusLabel, StatusTypeEnum } from '../../shared/components/StatusLabel';
import { appHelpLinks } from '../../shared/constants/app-help-links';

interface Stats {
  dataMarts: number | null;
  storages: { count: number; types: string[] } | null;
  destinations: { count: number; types: string[] } | null;
  contexts: { count: number; names: string[] } | null;
}

function formatTypesList(types: string[], max = 3): string {
  if (types.length === 0) return '';
  const unique = Array.from(new Set(types));
  const shown = unique.slice(0, max).join(' · ');
  return unique.length > max ? `${shown} +${String(unique.length - max)}` : shown;
}

function humaniseStorageType(type: string): string {
  const map: Record<string, string> = {
    GOOGLE_BIGQUERY: 'BigQuery',
    LEGACY_GOOGLE_BIGQUERY: 'BigQuery',
    AWS_ATHENA: 'Athena',
    SNOWFLAKE: 'Snowflake',
    DATABRICKS: 'Databricks',
    REDSHIFT: 'Redshift',
    DUCKDB: 'DuckDB',
  };
  return map[type] ?? type;
}

function humaniseDestinationType(type: string): string {
  const map: Record<string, string> = {
    GOOGLE_SHEETS: 'Sheets',
    LOOKER_STUDIO: 'Looker',
    SLACK: 'Slack',
    MS_TEAMS: 'Teams',
    GOOGLE_CHAT: 'Chat',
    EMAIL: 'Email',
  };
  return map[type] ?? type;
}

export function OverviewTab() {
  const user = useUser();
  const { projects, callState, loadProjects } = useProjects();
  const { flags } = useFlags();
  const isOwoxIdpProvider = checkVisible('IDP_PROVIDER', ['owox-better-auth'], flags);
  const { scope } = useProjectRoute();
  const { members } = useMembersSettings();
  const { copiedSection, handleCopy } = useClipboard();
  const [stats, setStats] = useState<Stats>({
    dataMarts: null,
    storages: null,
    destinations: null,
    contexts: null,
  });

  useEffect(() => {
    if (callState === RequestStatus.IDLE) {
      void loadProjects();
    }
  }, [callState, loadProjects]);

  useEffect(() => {
    // Mutable flag wrapped in an object so TS/ESLint cannot narrow it to the
    // literal `false` type; without the wrap, `if (state.cancelled)` below
    // gets flagged as always-falsy, even though the cleanup mutates it.
    const state = { cancelled: false };
    void (async () => {
      try {
        const [dmList, storageList, destList, contextList] = await Promise.all([
          dataMartService.getDataMarts().catch(() => null),
          dataStorageApiService.getDataStorages().catch(() => null),
          dataDestinationService.getDataDestinations().catch(() => null),
          contextService.getContexts().catch(() => null),
        ]);
        if (state.cancelled) return;
        setStats({
          dataMarts: dmList ? dmList.length : null,
          storages: storageList
            ? {
                count: storageList.length,
                types: storageList.map(s => humaniseStorageType(s.type)),
              }
            : null,
          destinations: destList
            ? {
                count: destList.length,
                types: destList.map(d => humaniseDestinationType(d.type)),
              }
            : null,
          contexts: contextList
            ? {
                count: contextList.length,
                names: contextList.map(c => c.name),
              }
            : null,
        });
      } catch {
        // All three calls already swallow individually; this outer catch is a
        // belt-and-braces guard so the overview never crashes because of stats.
      }
    })();
    return () => {
      state.cancelled = true;
    };
  }, []);

  const projectId = user?.projectId ?? '';
  const isAdmin = useIsAdmin();
  const {
    settings: projectSettings,
    isLoading: isProjectSettingsLoading,
    error: projectSettingsError,
    updateDescription,
  } = useProjectSettings(projectId);
  const currentProject = projects.find(project => project.id === projectId);
  const projectTitle = currentProject?.title ?? user?.projectTitle ?? '—';
  const origin = getCloudProjectApiOrigin(flags);
  const projectSession = user?.id && projectId ? { userId: user.id, projectId } : null;
  const sessionKey = projectSession ? `${projectSession.userId}:${projectSession.projectId}` : '';
  const [deletion, setDeletion] = useState<{
    sessionKey: string;
    status: ProjectDeletionOutcome;
  }>();
  const deletionStatus = deletion?.sessionKey === sessionKey ? deletion.status : undefined;
  const listedStatus = getProjectStatus(currentProject);
  const projectStatus =
    listedStatus === 'removed'
      ? 'removed'
      : ((deletionStatus === 'unknown' ? undefined : deletionStatus) ?? listedStatus);
  const canManage = Boolean(origin && projectSession && isAdmin && !user?.viewOnly);
  const canUseProjectActions =
    Boolean(currentProject) &&
    callState !== RequestStatus.ERROR &&
    !(deletionStatus === 'unknown' && callState === RequestStatus.LOADING);
  const projectUnavailable =
    deletionStatus === 'unknown' && callState === RequestStatus.LOADED && !currentProject;
  const statusLabel = projectStatus ? projectStatusLabels[projectStatus] : undefined;

  useEffect(() => {
    if (origin && projectUnavailable) toast.info('This project is no longer available.');
  }, [origin, projectUnavailable]);

  function onProjectDeletion(status: ProjectDeletionOutcome) {
    void loadProjects({ force: true });
    setDeletion({ sessionKey, status });
    if (status === 'removed') toast.success('Project deleted');
  }

  const adminCount = members.filter(m => m.role === 'admin').length;
  const editorCount = members.filter(m => m.role === 'editor').length;
  const viewerCount = members.filter(m => m.role === 'viewer').length;
  const memberRoleBreakdown = [
    adminCount > 0 ? `${String(adminCount)} Project Admin${adminCount === 1 ? '' : 's'}` : null,
    editorCount > 0 ? `${String(editorCount)} Data Owner${editorCount === 1 ? '' : 's'}` : null,
    viewerCount > 0 ? `${String(viewerCount)} Business User${viewerCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const mcpServerUrl = user?.mcpServerUrl ?? '';

  if (origin && (projectStatus === 'removed' || projectUnavailable)) {
    if (callState === RequestStatus.LOADING || callState === RequestStatus.IDLE) {
      return <LoadingSpinner message='Loading projects…' />;
    }
    const hasRemainingProjects = projects.some(
      project => project.id !== projectId && project.status !== 'removed'
    );
    const openProfile =
      callState === RequestStatus.LOADED &&
      !hasRemainingProjects &&
      getAccountApiOrigin(flags) !== null;
    return (
      <Navigate
        to={openProfile ? MY_ACCOUNT_PATH : MY_ACCOUNT_PROJECTS_PATH}
        replace
        state={{ unavailableProjectId: projectId }}
      />
    );
  }

  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard collapsible name='project-overview'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={BookOpenIcon} tooltip='About this project'>
            Overview
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <DescriptionCard
              label='Project name'
              value={
                canManage && origin && projectSession ? (
                  <ProjectNameEditor
                    key={sessionKey}
                    origin={origin}
                    session={projectSession}
                    title={projectTitle}
                    readOnly={!canUseProjectActions || projectStatus === 'removing'}
                  />
                ) : (
                  projectTitle
                )
              }
            />
            <DescriptionCard
              label='Project ID'
              value={
                <div className='flex items-center gap-2'>
                  <span className='font-mono text-xs break-all'>{projectId || '—'}</span>
                  {projectId && (
                    <CopyButton
                      text={projectId}
                      section='project-id'
                      variant={CopyButtonVariant.DEFAULT}
                      copiedSection={copiedSection}
                      onCopy={handleCopy}
                      iconOnly={true}
                    />
                  )}
                </div>
              }
            />
            <DescriptionCard
              label='Status'
              value={
                statusLabel ? (
                  <StatusLabel type={statusLabel.type}>{statusLabel.label}</StatusLabel>
                ) : callState === RequestStatus.LOADED ? (
                  <StatusLabel type={StatusTypeEnum.NEUTRAL}>Unknown</StatusLabel>
                ) : (
                  '—'
                )
              }
            />
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter
          left={
            <a
              href={appHelpLinks.projectSettings}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary text-sm hover:underline'
            >
              Learn more about project settings
            </a>
          }
        />
      </CollapsibleCard>

      <CollapsibleCard collapsible name='project-at-a-glance'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={ChartNoAxesColumn}
            tooltip='Quick snapshot of what lives inside this project'
          >
            At a glance
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {/* Default grid stretch keeps all cards the same height. Uniform
              height is enforced by the StatCard rendering a placeholder hint
              slot when no hint is provided — so Data Marts sits next to
              Members without visual jitter. */}
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5'>
            <StatCard
              icon={Box}
              label='Data Marts'
              value={stats.dataMarts}
              to={scope('/data-marts')}
            />
            <StatCard
              icon={Database}
              label='Storages'
              value={stats.storages?.count ?? null}
              hint={stats.storages ? formatTypesList(stats.storages.types) : undefined}
              to={scope('/data-storages')}
            />
            <StatCard
              icon={ArchiveRestore}
              label='Destinations'
              value={stats.destinations?.count ?? null}
              hint={stats.destinations ? formatTypesList(stats.destinations.types) : undefined}
              to={scope('/data-destinations')}
            />
            <StatCard
              icon={Tags}
              label='Contexts'
              value={stats.contexts?.count ?? null}
              hint={stats.contexts ? formatTypesList(stats.contexts.names) : undefined}
              to={scope('/project-settings/contexts')}
            />
            <StatCard
              icon={UsersIcon}
              label='Members'
              value={members.length}
              hint={memberRoleBreakdown || undefined}
              to={scope('/project-settings/members')}
            />
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      <CollapsibleCard collapsible name='project-business-context'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle
            icon={FileText}
            tooltip='Business context that helps your AI assistants give meaningful answers'
          >
            Description
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          <div className='flex flex-col gap-2'>
            <p className='text-muted-foreground text-xs'>
              Describe your business goals, terminology, and conventions to help your AI assistants
              give meaningful answers. This project description is shared with connected AI
              assistants through MCP. Do not include secrets.
            </p>
            {isProjectSettingsLoading ? (
              <Skeleton className='h-64 w-full' />
            ) : (
              <InlineEditDescription
                projectId={projectId}
                description={projectSettings.description}
                onUpdate={updateDescription}
                placeholder='Add a description for this project...'
                readOnly={!isAdmin || projectSettingsError !== null}
              />
            )}
            {projectSettingsError && (
              <p className='text-destructive text-xs' role='alert'>
                {projectSettingsError}
              </p>
            )}
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
      </CollapsibleCard>

      {mcpServerUrl && (
        <CollapsibleCard collapsible name='project-mcp-server'>
          <CollapsibleCardHeader>
            <CollapsibleCardHeaderTitle icon={Plug} tooltip='Project-specific MCP server URL'>
              MCP server
            </CollapsibleCardHeaderTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <div className='group flex w-full flex-col gap-3 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
              <p className='text-muted-foreground text-sm'>
                For a single-project setup, use the published OWOX MCP server in Claude, Codex,
                ChatGPT, and similar tools. For multi-project workflows, use this project-specific
                URL as a custom MCP server. See the{' '}
                <a
                  href='https://docs.owox.com/docs/getting-started/setup-guide/mcp/'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-primary hover:underline'
                >
                  MCP setup guide
                </a>
                .
              </p>
              <div className='flex items-center gap-2'>
                <span className='font-mono text-xs break-all'>{mcpServerUrl}</span>
                <CopyButton
                  text={mcpServerUrl}
                  section='project-mcp-url'
                  variant={CopyButtonVariant.DEFAULT}
                  copiedSection={copiedSection}
                  onCopy={handleCopy}
                  iconOnly={true}
                />
              </div>
            </div>
          </CollapsibleCardContent>
          <CollapsibleCardFooter></CollapsibleCardFooter>
        </CollapsibleCard>
      )}

      {canManage && origin && projectSession && (
        <ProjectDeletionCard
          key={sessionKey}
          origin={origin}
          session={projectSession}
          title={projectTitle}
          removing={projectStatus === 'removing'}
          disabled={!canUseProjectActions}
          onResult={onProjectDeletion}
        />
      )}

      {isOwoxIdpProvider && (!origin || !getCloudBillingOrigin(flags)) && (
        <CollapsibleCard collapsible name='project-legacy-platform'>
          <CollapsibleCardHeader>
            <CollapsibleCardHeaderTitle
              icon={Settings}
              tooltip='Open the full project settings on platform.owox.com'
            >
              Legacy platform settings
            </CollapsibleCardHeaderTitle>
          </CollapsibleCardHeader>
          <CollapsibleCardContent>
            <div className='group flex w-full flex-col gap-3 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
              <p className='text-muted-foreground text-sm'>
                Some project-level settings still live on platform.owox.com. Open the legacy
                settings page in a new tab to manage them.
              </p>
              <Button asChild variant='outline' size='sm' className='w-fit' disabled={!projectId}>
                <a
                  href={`https://platform.owox.com/ui/p/${projectId}/settings/general`}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <ExternalLink className='mr-2 h-4 w-4' />
                  Open legacy settings
                </a>
              </Button>
            </div>
          </CollapsibleCardContent>
          <CollapsibleCardFooter></CollapsibleCardFooter>
        </CollapsibleCard>
      )}
    </div>
  );
}

function DescriptionCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='flex w-full flex-col gap-2 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2'>
      <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
        {label}
      </span>
      <div className='text-foreground text-sm font-medium'>{value}</div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  hint?: string;
  to?: string;
}

function StatCard({ icon: Icon, label, value, hint, to }: StatCardProps) {
  const baseClasses =
    'group flex w-full flex-col gap-3 rounded-md border-b border-gray-200 bg-white p-4 transition-shadow duration-200 hover:shadow-xs dark:border-0 dark:bg-white/2';
  const content = (
    <>
      <div className='text-foreground flex items-center gap-2 text-sm font-medium'>
        <Icon className='h-4 w-4' />
        <span>{label}</span>
      </div>
      <div className='text-2xl font-medium'>{value ?? '—'}</div>
      <div className='text-muted-foreground text-xs'>{hint ?? '\u00A0'}</div>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={`${baseClasses} cursor-pointer hover:border-gray-300`}>
        {content}
      </Link>
    );
  }
  return <div className={baseClasses}>{content}</div>;
}
