import { zodResolver } from '@hookform/resolvers/zod';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@owox/ui/components/accordion';
import { Button } from '@owox/ui/components/button';
import { ExternalAnchor } from '@owox/ui/components/common/external-anchor';
import {
  AppForm,
  Form,
  FormActions,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormLayout,
  FormMessage,
  FormSection,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@owox/ui/components/sheet';
import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  usePluginPublishing,
  usePublishableScopes,
  type PublishFailure,
} from '../hooks/usePluginPublications';
import { safeHttpsUrl } from '../safeHttpsUrl';
import type { PluginPublicationScope } from '../types';

const schema = z.object({
  repository: z
    .string()
    .min(1, 'A GitHub repository is required')
    .refine(
      value => /^[\w.-]+\/[\w.-]+$/.test(value.trim()) || value.trim().startsWith('https://'),
      'Use a repository URL or owner/name'
    ),
  scope: z.enum(['project', 'member']),
});

type PublishFormValues = z.infer<typeof schema>;

const SCOPE_LABELS: Record<PluginPublicationScope, string> = {
  deployment: 'Everyone on this deployment',
  project: 'Everyone in this project',
  member: 'Only me',
};

interface PublishPluginSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Publishes a plugin from the browser at project or member scope.
 *
 * There is deliberately no field for a target project or member. The server takes both
 * from the authenticated session, so a form field would be an invitation to try
 * publishing somewhere the caller has no authority -- and it would be ignored anyway.
 */
export function PublishPluginSheet({ isOpen, onClose }: PublishPluginSheetProps) {
  const scopes = usePublishableScopes();
  const { publish, isPublishing } = usePluginPublishing();
  const [failure, setFailure] = useState<PublishFailure | null>(null);
  const installationHref = safeHttpsUrl(failure?.installationUrl);

  const form = useForm<PublishFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { repository: '', scope: scopes.includes('project') ? 'project' : 'member' },
  });

  const submit = async (values: PublishFormValues) => {
    const result = await publish(values.repository.trim(), values.scope);
    if (result) {
      setFailure(result);
      return;
    }

    form.reset();
    setFailure(null);
    onClose();
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          setFailure(null);
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Publish a plugin</SheetTitle>
          <SheetDescription>
            Publishing lists a plugin so people can find it. It does not install it for anyone.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          {/* AppForm is itself the <form>; nesting another one inside it is invalid HTML. */}
          <AppForm
            noValidate
            onSubmit={event => {
              void form.handleSubmit(submit)(event);
            }}
          >
            <FormLayout>
              <FormSection>
                <FormField
                  control={form.control}
                  name='repository'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GitHub repository</FormLabel>
                      <FormControl>
                        <Input placeholder='OWOX/example-plugin' {...field} />
                      </FormControl>
                      <FormDescription>
                        A URL or owner/name. The plugin&apos;s versions come from its GitHub
                        releases.
                      </FormDescription>
                      <FormMessage />

                      <FieldHelp
                        value='repository-help'
                        title='Which repositories can be published'
                      >
                        <p>
                          The repository must contain a <code>plugin.json</code> at its root and at
                          least one published release tagged <code>MAJOR.MINOR.PATCH</code>, with an
                          optional leading <code>v</code>. Prereleases and build metadata are
                          ignored, because the highest eligible version becomes current for everyone
                          at once and nobody can pin an older one.
                        </p>
                        <p>
                          The repository — not its name — is the plugin&apos;s identity. Renaming or
                          transferring it keeps the same plugin; two repositories are always two
                          plugins, even with identical contents.
                        </p>
                        <p>
                          {/* No link yet: the App does not exist. The server already returns the
                              exact installation URL when it cannot read a repository, and the
                              failure panel below renders it, so nothing here has to guess one. */}
                          A public repository works immediately. For a private one, the OWOX Data
                          Marts GitHub App has to be installed on it first — publish it once and
                          OWOX will show you the exact link to grant that access.
                        </p>
                      </FieldHelp>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='scope'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Who can find it</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {scopes.map(scope => (
                            <SelectItem key={scope} value={scope}>
                              {SCOPE_LABELS[scope]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />

                      <FieldHelp value='scope-help' title='What each option does'>
                        <p>
                          <strong>Only me.</strong> The plugin appears in your Gallery and nobody
                          else&apos;s. Available to every project member, and it needs no approval.
                        </p>
                        <p>
                          <strong>Everyone in this project.</strong> Every member of this project
                          finds it in their Gallery. Only a Project Admin can choose this.
                        </p>
                        <p>
                          Whichever you pick, publishing only makes the plugin{' '}
                          <strong>findable</strong>. It installs it for nobody: each member still
                          installs it themselves, and unpublishing later removes the listing without
                          uninstalling anyone.
                        </p>
                        <p>
                          The levels are independent, so the same plugin can be listed at both and
                          still appears once. You can widen a personal listing to the whole project
                          later from the plugin&apos;s own page.
                        </p>
                      </FieldHelp>
                    </FormItem>
                  )}
                />
              </FormSection>

              {failure && (
                <div className='text-destructive flex flex-col gap-2 rounded-md border p-3 text-sm'>
                  <p>{failure.message}</p>
                  {/*
                      The one publishing failure a member can actually resolve, and the
                      server hands back exactly where to go. Burying it in a toast would
                      hide the only thing that fixes it.
                    */}
                  {installationHref && (
                    <p>
                      <ExternalAnchor href={installationHref}>
                        Give OWOX Data Marts access to this repository
                      </ExternalAnchor>
                      , then publish again.
                    </p>
                  )}
                </div>
              )}
            </FormLayout>

            {/*
              Same sheet footer pattern as CreateApiKeySheet / other AppForm sheets:
              FormActions sits after FormLayout so Cancel/Publish stick to the bottom
              band with a top border, not float under the last field.
            */}
            <FormActions>
              <Button type='button' variant='secondary' onClick={onClose} disabled={isPublishing}>
                Cancel
              </Button>
              <Button type='submit' disabled={isPublishing}>
                {isPublishing ? <Loader2 className='size-4 animate-spin' aria-hidden /> : null}
                {isPublishing ? 'Publishing…' : 'Publish'}
              </Button>
            </FormActions>
          </AppForm>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Collapsed explanation under a field.
 *
 * Collapsed by default on purpose: someone republishing a repository they know needs none
 * of this, while someone doing it the first time has to be told what the choice actually
 * changes -- and the sheet has room for one of those, not both.
 */
function FieldHelp({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Accordion variant='common' type='single' collapsible>
      <AccordionItem value={value}>
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
