import { useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Link, useSearchParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Badge } from '@owox/ui/components/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@owox/ui/components/breadcrumb';
import { Button } from '@owox/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@owox/ui/components/card';
import { Tabs, TabsList, TabsTrigger } from '@owox/ui/components/tabs';
import { useProjectRoute } from '../../shared/hooks';
import { useUser } from '../idp/hooks/useAuthState';
import { useCanEdit } from '../idp/hooks/useRole';
import { useStartCheckout, type PricingOffer, type PricingPlan } from './app-pricing';
import { BillingLoadState } from './BillingLoadState';
import { useCloudBillingQuery, type SubscriptionDetails } from './cloud-billing';

const planCopy: Record<
  string,
  { name: string; description: string; features: string[]; recommended?: boolean }
> = {
  individual_2026_10: {
    name: 'Individual',
    description: 'Your analyst, just for you.',
    features: [
      'Up to 100 AI answers a month',
      'One context with all your data',
      'Self-setup with guides and chat support',
    ],
  },
  team_2026_10: {
    name: 'Team',
    description: 'Your analyst for your leadership team.',
    features: [
      'Up to 500 AI answers a month',
      'One shared context with sensitive data by access',
      'Setup with OWOX data experts',
    ],
    recommended: true,
  },
};

const scaleFeatures = [
  'The people you assign',
  'Scope set around your growth goals',
  'A separate context for each team',
  'We set it up and stay with you',
];

function formatAmount(offer: PricingOffer, dividedBy = 1): string {
  const format = new Intl.NumberFormat(undefined, { style: 'currency', currency: offer.currency });
  const minorDigits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(offer.amountMinor / 10 ** minorDigits / dividedBy);
}

export function AppPricing({ origin }: { origin: string }) {
  const project = useProjectRoute();
  const user = useUser();
  const canEdit = useCanEdit();
  const [params, setParams] = useSearchParams();
  const cycle = params.get('billingCycle') === 'monthly' ? 'monthly' : 'yearly';
  const [checkoutError, setCheckoutError] = useState('');
  const [recovery, setRecovery] = useState<{
    userId: string;
    projectId: string;
    invoiceUrl: string | null;
  }>();
  const submissionInFlight = useRef(false);
  const lastAttempt = useRef<{ key: string; id: string }>(undefined);
  const plans = useCloudBillingQuery<PricingPlan[]>(origin, '/api/stripe/app-pricing');
  const subscription = useCloudBillingQuery<SubscriptionDetails | null>(
    origin,
    '/api/billing/subscription-details'
  );
  const checkout = useStartCheckout(origin);
  const canManageBilling = canEdit && !user?.viewOnly;
  const outstandingInvoice =
    canManageBilling && recovery?.userId === user?.id && recovery?.projectId === user?.projectId
      ? recovery
      : undefined;
  const canBuy =
    canManageBilling &&
    !outstandingInvoice &&
    subscription.isSuccess &&
    subscription.data?.planType !== 'PAID';

  async function startCheckout(offer: PricingOffer) {
    if (!canBuy || !user?.id || !user.projectId || submissionInFlight.current) return;
    const billingAccount = user.email?.trim();
    if (!billingAccount) {
      setCheckoutError('Your account needs an email address to start checkout.');
      return;
    }
    submissionInFlight.current = true;
    setCheckoutError('');
    const key = JSON.stringify([user.id, user.projectId, billingAccount, offer.priceId]);
    if (lastAttempt.current?.key !== key) {
      lastAttempt.current = { key, id: crypto.randomUUID() };
    }
    try {
      const result = await checkout.mutateAsync({
        priceId: offer.priceId,
        billingAccount,
        attemptId: lastAttempt.current.id,
      });
      if (result.kind === 'outstanding-invoice') {
        setRecovery({ userId: user.id, projectId: user.projectId, invoiceUrl: result.invoiceUrl });
        return;
      }
      window.location.assign(result.url);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        setCheckoutError('This offer changed. Select an available plan.');
        void plans.refetch();
      } else {
        setCheckoutError('Could not open checkout. Try again or check your current subscription.');
      }
    } finally {
      submissionInFlight.current = false;
    }
  }

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <Breadcrumb>
          <BreadcrumbList className='dm-page-header-title'>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={project.scope('/project-settings/subscription')}>Subscription</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <h1 aria-current='page' className='text-foreground'>
                Plans and pricing
              </h1>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className='dm-page-content space-y-4 pb-6'>
        {checkoutError && canManageBilling && (
          <Alert variant='destructive'>
            <AlertTitle>{checkoutError}</AlertTitle>
          </Alert>
        )}
        {params.get('checkout') === 'canceled' && (
          <Alert>
            <AlertTitle>Checkout canceled</AlertTitle>
            <AlertDescription>You can select a plan when you’re ready.</AlertDescription>
          </Alert>
        )}
        {outstandingInvoice && subscription.data?.planType !== 'PAID' && (
          <Alert>
            <AlertTitle>Your previous subscription is unpaid</AlertTitle>
            <AlertDescription>
              <p>
                {outstandingInvoice.invoiceUrl
                  ? 'Pay the outstanding Stripe invoice to restore your subscription.'
                  : 'The invoice is currently unavailable. Contact support for help restoring your subscription.'}
              </p>
              {outstandingInvoice.invoiceUrl && (
                <Button asChild variant='outline' size='sm' className='mt-2'>
                  <a href={outstandingInvoice.invoiceUrl} target='_blank' rel='noopener noreferrer'>
                    Pay outstanding invoice
                  </a>
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {!plans.isSuccess ? (
          <BillingLoadState
            isPending={plans.isPending}
            errorTitle='Could not load plans'
            onRetry={() => void plans.refetch()}
          />
        ) : (
          <>
            {plans.data.length > 0 && (
              <Tabs
                value={cycle}
                onValueChange={value => {
                  const next = new URLSearchParams(params);
                  next.set('billingCycle', value);
                  setParams(next, { replace: true });
                }}
              >
                <TabsList aria-label='Billing period'>
                  <TabsTrigger value='monthly'>Monthly</TabsTrigger>
                  <TabsTrigger value='yearly'>Yearly</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {subscription.isError && canEdit && !user?.viewOnly && (
              <BillingLoadState
                isPending={false}
                errorTitle='Could not check your subscription'
                onRetry={() => void subscription.refetch()}
              />
            )}
            {plans.data.length === 0 && (
              <Alert>
                <AlertTitle>No plans available for online purchase</AlertTitle>
              </Alert>
            )}
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
              {plans.data.map(plan => {
                const copy = Object.prototype.hasOwnProperty.call(planCopy, plan.internalName)
                  ? planCopy[plan.internalName]
                  : undefined;
                const name = copy?.name ?? plan.name;
                const offers = plan.offers.filter(offer => offer.billingCycle === cycle);
                return (
                  <Card key={plan.productId}>
                    <CardHeader>
                      <CardTitle className='flex flex-wrap items-center gap-2'>
                        {name}
                        {copy?.recommended && <Badge variant='secondary'>Recommended</Badge>}
                      </CardTitle>
                      {copy?.description && <CardDescription>{copy.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className='flex-1 space-y-4'>
                      {offers.length === 0 && (
                        <p className='text-muted-foreground text-sm'>
                          Unavailable for this billing period
                        </p>
                      )}
                      {offers.map(offer => (
                        <div key={offer.priceId} className='space-y-2'>
                          <p>
                            <span className='text-2xl font-semibold'>
                              {formatAmount(offer, offer.billingPeriodMonths)}
                            </span>{' '}
                            <span className='text-muted-foreground text-sm'>/ month</span>
                          </p>
                          {cycle === 'yearly' && (
                            <p className='text-muted-foreground text-sm'>
                              {formatAmount(offer)} billed yearly
                            </p>
                          )}
                          <p className='text-sm'>
                            {offer.creditsPerMonth.toLocaleString()} credits per month · Up to{' '}
                            {offer.seats} {offer.seats === 1 ? 'account' : 'accounts'}
                          </p>
                          {canBuy && (
                            <Button
                              variant={copy?.recommended ? 'default' : 'outline'}
                              onClick={() => {
                                void startCheckout(offer);
                              }}
                              disabled={checkout.isPending}
                              aria-label={`Select ${name} ${offer.currency.toUpperCase()}`}
                            >
                              {checkout.isPending && checkout.variables.priceId === offer.priceId
                                ? 'Opening checkout…'
                                : 'Select plan'}
                            </Button>
                          )}
                        </div>
                      ))}
                      {copy && (
                        <ul className='text-muted-foreground list-disc space-y-1 pl-4 text-sm'>
                          {copy.features.map(feature => (
                            <li key={feature}>{feature}</li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              <Card>
                <CardHeader>
                  <CardTitle>Scale</CardTitle>
                  <CardDescription>Your analyst for the whole company.</CardDescription>
                </CardHeader>
                <CardContent className='flex-1'>
                  <ul className='text-muted-foreground list-disc space-y-1 pl-4 text-sm'>
                    {scaleFeatures.map(feature => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button asChild variant='outline'>
                    <a href='https://www.owox.com/book-a-call' target='_blank' rel='noreferrer'>
                      Book a demo
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
