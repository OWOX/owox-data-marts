import { BriefcaseBusiness, ExternalLink, Info } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@owox/ui/components/button';
import { ButtonGroup } from '@owox/ui/components/button-group';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@owox/ui/components/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@owox/ui/components/empty';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from '@owox/ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { StatusLabel, StatusTypeEnum } from '../../shared/components/StatusLabel';
import { useUser } from '../idp/hooks/useAuthState';
import { useCanEdit } from '../idp/hooks/useRole';
import { BillingLoadState } from './BillingLoadState';
import { useCloudBillingQuery, type SubscriptionDetails } from './cloud-billing';
import { buildProjectPath } from '../../utils/path';

const portalUrl = 'https://payments.bi.owox.com/p/login/5kA3doeza1Djc9O9AA';
const billingHelpUrl = 'https://support.owox.com/hc/en-us/sections/12401110143892';
const number = new Intl.NumberFormat();
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const cycleNames: Record<SubscriptionDetails['billingCycle'], string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SEMIANNUAL: 'Every 6 months',
  NINE_MONTHLY: 'Every 9 months',
  YEARLY: 'Yearly',
  NON_RECURRING: 'One-time',
};

const subscriptionStatuses = {
  ACTIVE: { label: 'Active', type: StatusTypeEnum.SUCCESS },
  CANCELED: { label: 'Canceled', type: StatusTypeEnum.NEUTRAL },
};

function formatSubscriptionDate([year, month, day]: SubscriptionDetails['startDate']): string {
  return date.format(new Date(Date.UTC(year, month - 1, day)));
}

function getFreePlanNotice(subscription: SubscriptionDetails | null | undefined): string | null {
  if (subscription?.planType !== 'FREE') return null;

  switch (subscription.subscribeReason) {
    case 'PREVIOUS_SUBSCRIPTION_UNPAID':
      return 'This project moved to the Free plan because its previous subscription was unpaid.';
    case 'PREVIOUS_SUBSCRIPTION_CANCELED':
      return 'This project moved to the Free plan because its previous subscription was canceled.';
    default:
      return null;
  }
}

export function Subscription({ origin }: { origin: string }) {
  const user = useUser();
  const canEdit = useCanEdit();
  const query = useCloudBillingQuery<SubscriptionDetails | null>(
    origin,
    '/api/billing/subscription-details'
  );
  const subscription = query.data;
  const isOneTime = subscription?.billingCycle === 'NON_RECURRING';
  const status = subscription ? subscriptionStatuses[subscription.status] : null;
  const freePlanNotice = getFreePlanNotice(subscription);
  const canManage = canEdit && !user?.viewOnly;
  const pricingUrl = user?.projectId ? buildProjectPath(user.projectId, '/pricing') : null;
  const viewPlansLink = pricingUrl && (
    <Button asChild variant='link' className='h-auto p-0'>
      <Link to={pricingUrl}>View plans</Link>
    </Button>
  );
  const showBillingPortal =
    query.isSuccess &&
    canManage &&
    Boolean(subscription?.billingAccount) &&
    subscription?.planType !== 'FREE';

  return (
    <div className='dm-page-content'>
      <Card>
        <CardHeader className='flex items-center gap-1'>
          <CardTitle role='heading' aria-level={2}>
            Subscription details
          </CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant='ghost' size='icon-sm' className='text-muted-foreground'>
                <a
                  href={billingHelpUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-label='Billing help'
                >
                  <Info aria-hidden='true' />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Billing help</TooltipContent>
          </Tooltip>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!query.isSuccess ? (
            <BillingLoadState
              isPending={query.isPending}
              errorTitle='Could not load subscription'
              onRetry={() => void query.refetch()}
            />
          ) : subscription && status ? (
            <>
              <div className='flex flex-wrap items-center gap-3'>
                <h3 className='text-lg font-semibold'>{subscription.name}</h3>
                <span className='inline-flex items-center gap-1'>
                  <StatusLabel type={status.type} variant='subtle'>
                    {status.label}
                  </StatusLabel>
                  {freePlanNotice && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-sm'
                          className='text-warning hover:text-warning'
                          aria-label='Why this project is on the Free plan'
                        >
                          <Info aria-hidden='true' />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent aria-label='Free plan details' align='start' className='p-3'>
                        <PopoverDescription>{freePlanNotice}</PopoverDescription>
                      </PopoverContent>
                    </Popover>
                  )}
                </span>
                {viewPlansLink}
              </div>
              <dl className='grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3'>
                <div>
                  <dt className='text-muted-foreground'>Billing cycle</dt>
                  <dd>{cycleNames[subscription.billingCycle]}</dd>
                </div>
                {!isOneTime && (
                  <div>
                    <dt className='text-muted-foreground'>Price</dt>
                    <dd>
                      {new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: subscription.currency.toUpperCase(),
                      }).format(subscription.price / 100)}
                    </dd>
                  </div>
                )}
                {(!isOneTime || subscription.credits > 0) && (
                  <div>
                    <dt className='text-muted-foreground'>
                      {isOneTime ? 'Credits' : 'Credits per month'}
                    </dt>
                    <dd>
                      {number.format(
                        isOneTime ? subscription.credits : subscription.creditsPerMonth
                      )}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className='text-muted-foreground'>Start date</dt>
                  <dd>{formatSubscriptionDate(subscription.startDate)}</dd>
                </div>
                {subscription.endDate && (
                  <div>
                    <dt className='text-muted-foreground'>
                      {subscription.status === 'CANCELED' || isOneTime
                        ? 'End date'
                        : 'Renewal date'}
                    </dt>
                    <dd>{formatSubscriptionDate(subscription.endDate)}</dd>
                  </div>
                )}
                {subscription.billingAccount && (
                  <div>
                    <dt className='text-muted-foreground'>Billing account</dt>
                    <dd className='break-all'>{subscription.billingAccount}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <BriefcaseBusiness aria-hidden='true' />
                </EmptyMedia>
                <EmptyTitle>This project has no active subscription</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          {(!query.isSuccess || !status) && viewPlansLink}
        </CardContent>
        {showBillingPortal && (
          <CardFooter>
            <ButtonGroup
              aria-label='Stripe billing'
              className='[&>button:last-child]:border-border [&>button:last-child]:border-l-0'
            >
              <Button asChild variant='outline' size='sm'>
                <a href={portalUrl} target='_blank' rel='noopener noreferrer'>
                  Change card &amp; billing info
                  <ExternalLink className='h-4 w-4' aria-hidden='true' />
                </a>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon-sm'
                    className='text-muted-foreground'
                    aria-label='About signing in to Stripe'
                  >
                    <Info aria-hidden='true' />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className='max-w-xs' sideOffset={4}>
                  Use the billing account email above to receive a sign-in link from Stripe.
                </TooltipContent>
              </Tooltip>
            </ButtonGroup>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
