import { BriefcaseBusiness, ExternalLink, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@owox/ui/components/alert';
import { Button } from '@owox/ui/components/button';
import { Card, CardContent, CardFooter } from '@owox/ui/components/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@owox/ui/components/empty';
import { StatusLabel, StatusTypeEnum } from '../../shared/components/StatusLabel';
import { useUser } from '../idp/hooks/useAuthState';
import { useCanEdit } from '../idp/hooks/useRole';
import { BillingLoadState } from './BillingLoadState';
import { useCloudBillingQuery, type SubscriptionDetails } from './cloud-billing';

const platformOrigin =
  import.meta.env.VITE_OWOX_PLATFORM_URL?.replace(/\/$/, '') ?? 'https://platform.owox.com';
const portalUrl = 'https://payments.bi.owox.com/p/login/5kA3doeza1Djc9O9AA';
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
  NOT_PAID: { label: 'Unpaid', type: StatusTypeEnum.WARNING },
};

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
  const status = subscription
    ? subscriptionStatuses[subscription.planType === 'NOT_PAID' ? 'NOT_PAID' : subscription.status]
    : null;
  const freePlanNotice = getFreePlanNotice(subscription);
  const canManage = canEdit && !user?.viewOnly;
  const pricingUrl = user?.projectId
    ? `${platformOrigin}/ui/p/${encodeURIComponent(user.projectId)}/pricing`
    : null;

  return (
    <div className='dm-page-content'>
      <Card>
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
                <h2 className='text-lg font-semibold'>{subscription.name}</h2>
                <StatusLabel type={status.type} variant='subtle'>
                  {status.label}
                </StatusLabel>
              </div>
              {freePlanNotice && (
                <Alert className='bg-warning-bg text-warning'>
                  <TriangleAlert aria-hidden='true' />
                  <AlertDescription className='text-foreground'>{freePlanNotice}</AlertDescription>
                </Alert>
              )}
              <dl className='grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3'>
                <div>
                  <dt className='text-muted-foreground'>Billing cycle</dt>
                  <dd>{cycleNames[subscription.billingCycle]}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>Price</dt>
                  <dd>
                    {new Intl.NumberFormat(undefined, {
                      style: 'currency',
                      currency: subscription.currency.toUpperCase(),
                    }).format(subscription.price / 100)}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {subscription.billingCycle === 'NON_RECURRING'
                      ? 'Credits'
                      : 'Credits per month'}
                  </dt>
                  <dd>
                    {number.format(
                      subscription.billingCycle === 'NON_RECURRING'
                        ? subscription.credits
                        : subscription.creditsPerMonth
                    )}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>Start date</dt>
                  <dd>{date.format(new Date(subscription.startDate))}</dd>
                </div>
                {subscription.endDate && (
                  <div>
                    <dt className='text-muted-foreground'>
                      {subscription.status === 'CANCELED' ||
                      subscription.billingCycle === 'NON_RECURRING'
                        ? 'End date'
                        : 'Renewal date'}
                    </dt>
                    <dd>{date.format(new Date(subscription.endDate))}</dd>
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
        </CardContent>
        {query.isSuccess && canManage && (
          <CardFooter>
            {subscription?.billingAccount && subscription.planType === 'PAID' ? (
              <Button asChild variant='outline' size='sm'>
                <a href={portalUrl} target='_blank' rel='noopener noreferrer'>
                  Change card &amp; billing info
                  <ExternalLink className='h-4 w-4' />
                </a>
              </Button>
            ) : pricingUrl ? (
              <Button asChild variant='outline' size='sm'>
                <a href={pricingUrl}>View plans</a>
              </Button>
            ) : null}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
