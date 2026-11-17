import { useRef, useState, type SubmitEvent } from 'react';
import { isAxiosError } from 'axios';
import { Link, useSearchParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Badge } from '@owox/ui/components/badge';
import { Button } from '@owox/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@owox/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@owox/ui/components/dialog';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
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
  const [selected, setSelected] = useState<{
    offer: PricingOffer;
    name: string;
    attemptId: string;
  }>();
  const [billingAccount, setBillingAccount] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [recovery, setRecovery] = useState<{
    userId: string;
    projectId: string;
    invoiceUrl: string | null;
  }>();
  const submissionInFlight = useRef(false);
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

  function selectOffer(offer: PricingOffer, name: string) {
    setBillingAccount(subscription.data?.billingAccount ?? user?.email ?? '');
    setCheckoutError('');
    setSelected({ offer, name, attemptId: crypto.randomUUID() });
  }

  async function startCheckout(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !canBuy || !user?.id || !user.projectId || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setCheckoutError('');
    try {
      const result = await checkout.mutateAsync({
        priceId: selected.offer.priceId,
        billingAccount: billingAccount.trim(),
        attemptId: selected.attemptId,
      });
      if (result.kind === 'outstanding-invoice') {
        submissionInFlight.current = false;
        setRecovery({ userId: user.id, projectId: user.projectId, invoiceUrl: result.invoiceUrl });
        setSelected(undefined);
        return;
      }
      window.location.assign(result.url);
    } catch (error) {
      submissionInFlight.current = false;
      if (isAxiosError(error) && error.response?.status === 404) {
        setCheckoutError('This offer changed. Close checkout and select a plan again.');
        void plans.refetch();
      } else {
        setCheckoutError('Could not open checkout. Try again or check your current subscription.');
      }
    }
  }

  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Plans and pricing</h1>
      </header>
      <div className='dm-page-content space-y-4 pb-6'>
        <Button asChild variant='link' className='px-0'>
          <Link to={project.scope('/project-settings/subscription')}>Back to subscription</Link>
        </Button>
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
                              onClick={() => {
                                selectOffer(offer, name);
                              }}
                              aria-label={`Select ${name} ${offer.currency.toUpperCase()}`}
                            >
                              Select plan
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
            {plans.data.length > 0 && (
              <p className='text-muted-foreground text-sm'>
                Credits pay for OWOX work. An AI answer, report refresh, or data export costs 0.1
                credit. AI answers also have a monthly plan limit.
              </p>
            )}
          </>
        )}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={open => {
          if (!open && !submissionInFlight.current) setSelected(undefined);
        }}
      >
        {selected && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Continue with {selected.name}</DialogTitle>
              <DialogDescription>
                {formatAmount(selected.offer)} per{' '}
                {selected.offer.billingCycle === 'yearly' ? 'year' : 'month'}. Stripe will show your
                final total, including any taxes or adjustments.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={event => void startCheckout(event)} className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='billing-email'>Billing email</Label>
                <Input
                  id='billing-email'
                  type='email'
                  autoComplete='email'
                  value={billingAccount}
                  required
                  onChange={event => {
                    setBillingAccount(event.target.value);
                    setSelected({ ...selected, attemptId: crypto.randomUUID() });
                  }}
                  disabled={checkout.isPending}
                />
              </div>
              {checkoutError && (
                <Alert variant='destructive'>
                  <AlertTitle>{checkoutError}</AlertTitle>
                </Alert>
              )}
              <DialogFooter>
                <Button type='submit' disabled={!canBuy || checkout.isPending}>
                  {checkout.isPending ? 'Opening checkout…' : 'Continue to Stripe'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
