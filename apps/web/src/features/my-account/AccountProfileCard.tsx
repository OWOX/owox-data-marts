import { useRef, type SubmitEvent } from 'react';
import { Button } from '@owox/ui/components/button';
import { AppForm, FormActions, FormItem, FormLayout } from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@owox/ui/components/sheet';
import { appHelpLinks } from '../../shared/constants/app-help-links';
import type { AccountProfile, AccountProfileFields } from './account-profile.service';

const editableFields = [
  { name: 'fullName', label: 'Full name', required: true, type: 'text' },
  { name: 'workEmail', label: 'Work email', required: false, type: 'email' },
  { name: 'phone', label: 'Phone', required: false, type: 'tel' },
  { name: 'companyName', label: 'Company name', required: false, type: 'text' },
  { name: 'companyWebsite', label: 'Company website', required: false, type: 'text' },
] as const;
const signInEmail = { name: 'email' as const, label: 'Sign-in email' };
const displayFields = [editableFields[0], signInEmail, ...editableFields.slice(1)];

interface AccountProfileCardProps {
  profile: AccountProfile;
  viewOnly: boolean;
  editing: boolean;
  saving: boolean;
  error?: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (fields: AccountProfileFields) => void;
}

export function AccountProfileCard({
  profile,
  viewOnly,
  editing,
  saving,
  error,
  onEdit,
  onCancel,
  onSave,
}: AccountProfileCardProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    const changes: AccountProfileFields = {};
    for (const { name } of editableFields) {
      const value = values.get(name);
      if (typeof value === 'string' && value !== profile[name]) changes[name] = value;
    }
    if (Object.keys(changes).length === 0) onCancel();
    else onSave(changes);
  }

  return (
    <Sheet
      open={editing}
      onOpenChange={open => {
        if (saving) return;
        if (open) onEdit();
        else onCancel();
      }}
    >
      <section className='dm-card flex flex-col gap-4' aria-labelledby='account-profile-heading'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h2 id='account-profile-heading' className='text-base font-medium'>
            Profile
          </h2>
          {!viewOnly && (
            <SheetTrigger asChild>
              <Button variant='outline'>Edit profile</Button>
            </SheetTrigger>
          )}
        </div>
        <dl className='grid gap-4 sm:grid-cols-2'>
          {displayFields.map(({ name, label }) => (
            <div key={name} className='min-w-0'>
              <dt className='text-muted-foreground text-sm font-medium'>{label}</dt>
              <dd className='mt-1 text-sm wrap-anywhere'>{profile[name] || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <SheetContent
        onOpenAutoFocus={event => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader>
          <SheetTitle ref={titleRef} tabIndex={-1} className='focus:outline-none'>
            Edit profile
          </SheetTitle>
          <SheetDescription>Update your contact and company details.</SheetDescription>
        </SheetHeader>
        <AppForm onSubmit={handleSubmit}>
          <FormLayout>
            {displayFields.map(field => {
              const id = `edit-profile-${field.name}`;
              return (
                <FormItem key={field.name}>
                  <Label htmlFor={id}>{field.label}</Label>
                  {field.name === 'email' ? (
                    <>
                      <Input
                        id={id}
                        aria-describedby='edit-profile-email-help'
                        value={profile.email}
                        readOnly
                        className='bg-muted text-muted-foreground dark:bg-muted shadow-none'
                      />
                      <p id='edit-profile-email-help' className='text-muted-foreground text-xs'>
                        This email is used to sign in and can’t be changed here.
                      </p>
                    </>
                  ) : (
                    <Input
                      id={id}
                      name={field.name}
                      type={field.type}
                      required={field.required}
                      defaultValue={profile[field.name]}
                      disabled={saving}
                    />
                  )}
                </FormItem>
              );
            })}
            <p className='text-muted-foreground text-sm leading-relaxed'>
              Need help?{' '}
              <a
                href={appHelpLinks.profileSettings}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:underline'
              >
                Learn more about profile settings
              </a>{' '}
              and{' '}
              <a
                href='https://support.google.com/accounts/answer/19870'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary hover:underline'
              >
                how to change profile email
              </a>
              .
            </p>
            {error && (
              <p role='alert' className='text-destructive text-sm'>
                {error}
              </p>
            )}
          </FormLayout>
          <FormActions>
            <Button type='submit' className='w-full' disabled={saving} aria-busy={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
            <Button
              type='button'
              variant='outline'
              className='w-full'
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          </FormActions>
        </AppForm>
      </SheetContent>
    </Sheet>
  );
}
