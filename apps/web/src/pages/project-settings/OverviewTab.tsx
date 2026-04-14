import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenIcon, Check, ChartNoAxesColumn, ExternalLink, Settings } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import {
  CollapsibleCard,
  CollapsibleCardContent,
  CollapsibleCardFooter,
  CollapsibleCardHeader,
  CollapsibleCardHeaderTitle,
} from '../../shared/components/CollapsibleCard';
import { useUser } from '../../features/idp/hooks/useAuthState';
import { useFlags } from '../../app/store/hooks';
import { useProjectRoute } from '../../shared/hooks';
import { checkVisible } from '../../utils/check-visible';
import { useMembersSettings } from '../../features/project-settings/members/model/members-settings.context';
import { dataMartService } from '../../features/data-marts/shared/services/data-mart.service';
import { dataStorageApiService } from '../../features/data-storage/shared/api/data-storage-api.service';
import { dataDestinationService } from '../../features/data-destination/shared/services/data-destination.service';
import { Box, Database, ArchiveRestore, Users as UsersIcon } from 'lucide-react';
import { CopyButton, CopyButtonVariant } from '@owox/ui/components/common/copy-button';
import { useClipboard } from '../../hooks/useClipboard';

interface Stats {
  dataMarts: number | null;
  storages: { count: number; types: string[] } | null;
  destinations: { count: number; types: string[] } | null;
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
  const { flags } = useFlags();
  const isOwoxIdpProvider = checkVisible('IDP_PROVIDER', ['owox-better-auth'], flags);
  const { scope } = useProjectRoute();
  const { members } = useMembersSettings();
  const { copiedSection, handleCopy } = useClipboard();
  const [stats, setStats] = useState<Stats>({
    dataMarts: null,
    storages: null,
    destinations: null,
  });

  useEffect(() => {
    // Mutable flag wrapped in an object so TS/ESLint cannot narrow it to the
    // literal `false` type; without the wrap, `if (state.cancelled)` below
    // gets flagged as always-falsy, even though the cleanup mutates it.
    const state = { cancelled: false };
    void (async () => {
      try {
        const [dmList, storageList, destList] = await Promise.all([
          dataMartService.getDataMarts().catch(() => null),
          dataStorageApiService.getDataStorages().catch(() => null),
          dataDestinationService.getDataDestinations().catch(() => null),
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

  const adminCount = members.filter(m => m.role === 'admin').length;
  const editorCount = members.filter(m => m.role === 'editor').length;
  const viewerCount = members.filter(m => m.role === 'viewer').length;
  const memberRoleBreakdown = [
    adminCount > 0 ? `${String(adminCount)} admin${adminCount === 1 ? '' : 's'}` : null,
    editorCount > 0 ? `${String(editorCount)} editor${editorCount === 1 ? '' : 's'}` : null,
    viewerCount > 0 ? `${String(viewerCount)} viewer${viewerCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard collapsible name='project-description'>
        <CollapsibleCardHeader>
          <CollapsibleCardHeaderTitle icon={BookOpenIcon} tooltip='About this project'>
            Description
          </CollapsibleCardHeaderTitle>
        </CollapsibleCardHeader>
        <CollapsibleCardContent>
          {/* Stacked-card layout: each fact gets its own small card with label
              on top and value below. Same grid feel as "At a glance" so the
              two sections visually line up. */}
          <div className='mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3'>
            <DescriptionCard label='Project name' value={user?.projectTitle ?? '—'} />
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
                    />
                  )}
                </div>
              }
            />
            <DescriptionCard
              label='Status'
              value={
                <span className='inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300'>
                  <Check className='h-3 w-3' />
                  Active
                </span>
              }
            />
          </div>
        </CollapsibleCardContent>
        <CollapsibleCardFooter></CollapsibleCardFooter>
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
          {/* Default grid stretch keeps all 4 cards the same height. Uniform
              height is enforced by the StatCard rendering a placeholder hint
              slot when no hint is provided — so Data Marts sits next to
              Members without visual jitter. */}
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
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

      {isOwoxIdpProvider && (
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
      <span className='text-foreground text-sm font-medium'>{value}</span>
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
