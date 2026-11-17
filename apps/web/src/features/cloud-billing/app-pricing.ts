import { useMutation } from '@tanstack/react-query';
import apiClient, { type AxiosRequestConfig } from '../../app/api/apiClient';
import { getTokenProvider } from '../../app/api/token-provider';
import { useUser } from '../idp/hooks/useAuthState';

const stripeCheckoutOrigins = new Set([
  'https://checkout.stripe.com',
  'https://payments.bi.owox.com',
]);
const stripeInvoiceOrigins = new Set([
  'https://invoice.stripe.com',
  'https://payments.bi.owox.com',
]);

export interface PricingOffer {
  priceId: string;
  billingCycle: 'monthly' | 'yearly';
  billingPeriodMonths: number;
  currency: string;
  amountMinor: number;
  creditsPerMonth: number;
  seats: number;
}

export interface PricingPlan {
  productId: string;
  internalName: string;
  name: string;
  offers: PricingOffer[];
}

export interface CheckoutSession {
  id: string;
  checkoutUrl: string | null;
  status: string;
  paymentStatus: string;
}

interface StartCheckout {
  priceId: string;
  billingAccount: string;
  attemptId: string;
}

interface CheckoutConflict {
  code: string;
  invoiceUrl: string | null;
}

function trustedStripeUrl(value: string | null, origins: ReadonlySet<string>): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return origins.has(url.origin) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function useStartCheckout(origin: string) {
  const user = useUser();
  return useMutation({
    mutationFn: async (request: StartCheckout) => {
      if (!user?.id || !user.projectId) throw new Error('Project session required');
      const config: AxiosRequestConfig = {
        baseURL: origin,
        withCredentials: false,
        skipErrorToast: true,
        skipLogoutOnUnauthorizedRetry: true,
        expectedSession: { projectId: user.projectId, userId: user.id },
        validateStatus: status => (status >= 200 && status < 300) || status === 409,
      };
      const { data, status } = await apiClient.post<CheckoutSession | CheckoutConflict>(
        '/api/stripe/app-checkout-sessions',
        request,
        config
      );
      const provider = getTokenProvider();
      if (provider?.getProjectId?.() !== user.projectId || provider.getUserId?.() !== user.id) {
        throw new Error('The active project or account changed');
      }
      if (status === 409) {
        if (!('code' in data) || data.code !== 'UNPAID_SUBSCRIPTION') {
          throw new Error('Could not start checkout');
        }
        return {
          kind: 'outstanding-invoice' as const,
          invoiceUrl: trustedStripeUrl(data.invoiceUrl, stripeInvoiceOrigins),
        };
      }
      const url = trustedStripeUrl(
        'checkoutUrl' in data ? data.checkoutUrl : null,
        stripeCheckoutOrigins
      );
      if (!url) throw new Error('Invalid Stripe Checkout URL');
      return { kind: 'checkout' as const, url };
    },
  });
}
