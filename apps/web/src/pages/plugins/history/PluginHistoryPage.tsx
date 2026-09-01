import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import { ArrowLeft, Blocks, History } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  InstallPluginDialog,
  usePluginActions,
  usePluginInstallations,
  type InstalledPlugin,
  type PluginGalleryEntry,
} from '../../../features/plugins';
import { useProjectRoute } from '../../../shared/hooks';
import { formatDateOnly } from '../../../utils/date-formatters';

/**
 * Everything this member has ever installed in this project, still installed or not.
 *
 * Not a convenience listing, and the reason it lists both is the same in either case: a
 * plugin nobody publishes any more is gone from the Gallery entirely. §13 entitles a
 * previous installer to restore it, and an installed one still needs a route to its own
 * page, where uninstall and update live. Nothing else reaches either.
 */
export default function PluginHistoryPage() {
  const { installations, isLoading } = usePluginInstallations(true);
  const { install, isInstalling } = usePluginActions();
  const { scope } = useProjectRoute();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<PluginGalleryEntry | null>(null);

  const current = installations.filter(item => item.uninstalledAt === null);
  const removed = installations.filter(item => item.uninstalledAt !== null);

  /**
   * Restoring re-opens the same Install confirmation as a first install. Backend only
   * reactivates the soft-uninstalled row; UI still asks the member to agree again.
   *
   * §13 still holds: if the version moved on after the dialog opened, the server refuses
   * and the dialog reappears with the version that is current now.
   */
  const restore = async (
    target: PluginGalleryEntry,
    credentialSelections: Readonly<Record<string, string | null>>
  ) => {
    const stale = await install(target.pluginId, target.currentVersionId, credentialSelections);
    if (stale) {
      setConfirming(stale);
      return;
    }

    setConfirming(null);
  };

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        {/* Same gutter treatment as the plugin page, so the title lines up with content. */}
        <div className='-ml-4 flex min-w-0 items-center md:-ml-6 md:gap-2 lg:-ml-11'>
          <Button
            variant='ghost'
            className='size-8 lg:size-9'
            aria-label='Back to plugins'
            onClick={() => void navigate(scope('/plugins'))}
          >
            <ArrowLeft className='h-4 w-4 lg:h-5 lg:w-5' />
          </Button>
          <h1 className='dm-page-header-title truncate'>Installation history</h1>
        </div>
      </header>

      <div className='dm-page-content'>
        <div className='dm-card flex flex-col gap-6'>
          {!isLoading && installations.length === 0 && (
            <div className='dm-empty-state'>
              <History className='dm-empty-state-ico' strokeWidth={1} aria-hidden />
              <h2 className='dm-empty-state-title'>Nothing installed yet</h2>
              <p className='dm-empty-state-subtitle'>
                Plugins you install stay here, and so do the ones you remove — including any nobody
                publishes any more.
              </p>
            </div>
          )}

          {current.length > 0 && (
            <Section title='Installed'>
              {current.map(item => (
                <PluginHistoryCard
                  key={item.installationId}
                  item={item}
                  caption={`Installed ${formatDateOnly(item.installedAt)}`}
                  href={scope(`/plugins/${item.pluginId}`)}
                />
              ))}
            </Section>
          )}

          {removed.length > 0 && (
            <Section title='Removed'>
              {removed.map(item => (
                <PluginHistoryCard
                  key={item.installationId}
                  item={item}
                  caption={`Removed ${formatDateOnly(item.uninstalledAt)}`}
                  href={scope(`/plugins/${item.pluginId}`)}
                  action={
                    <Button
                      variant='outline'
                      disabled={isInstalling || item.suspended || !item.currentVersionId}
                      onClick={() => {
                        setConfirming(item);
                      }}
                    >
                      Restore
                    </Button>
                  }
                />
              ))}
            </Section>
          )}
        </div>
      </div>

      {confirming && (
        <InstallPluginDialog
          plugin={confirming}
          open
          onOpenChange={open => {
            if (!open) {
              setConfirming(null);
            }
          }}
          onConfirm={credentialSelections => void restore(confirming, credentialSelections)}
          isInstalling={isInstalling}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-3'>
      <h2 className='text-muted-foreground text-sm font-medium'>{title}</h2>
      {children}
    </section>
  );
}

/**
 * Built like the Gallery card, so a plugin looks the same wherever it is listed.
 *
 * The plugin's own page is where uninstall and update live, and for a plugin no
 * publication lists any more this card is the only way there -- hence the whole surface
 * navigates, not just the name.
 */
function PluginHistoryCard({
  item,
  caption,
  href,
  action,
}: {
  item: InstalledPlugin;
  caption: string;
  href: string;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  const open = () => void navigate(href);

  return (
    <div
      role='link'
      tabIndex={0}
      aria-label={item.displayName}
      className='hover:border-foreground/20 bg-card flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors'
      onClick={event => {
        // Restore owns its own click; everything else opens the plugin.
        if (!(event.target as HTMLElement).closest('button, a')) {
          open();
        }
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          open();
        }
      }}
    >
      {/* Placeholder mark: plugin.json carries no icon field yet, so this reserves the
          space a real icon will occupy rather than pretending one exists. */}
      <div className='bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md'>
        <Blocks className='size-6' aria-hidden />
      </div>

      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='truncate font-medium'>{item.displayName}</span>
          {item.currentSemver && <Badge variant='secondary'>v{item.currentSemver}</Badge>}
          {item.suspended && <Badge variant='destructive'>Unavailable</Badge>}
        </div>
        <span className='text-muted-foreground truncate text-sm'>
          by {item.source.ownerName} · {caption}
        </span>
      </div>

      {action}
    </div>
  );
}
