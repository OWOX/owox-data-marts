import { useQuery } from '@tanstack/react-query';
import apiClient, { type AxiosRequestConfig } from '../../app/api/apiClient';
import { useUser } from '../idp/hooks/useAuthState';

export function getCloudBillingOrigin(flags: Record<string, unknown> | null): string | null {
  if (flags?.IDP_PROVIDER !== 'owox-better-auth') return null;
  const origin = flags.CLOUD_BILLING_API_ORIGIN;
  if (typeof origin !== 'string') return null;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.origin === origin ? origin : null;
  } catch {
    return null;
  }
}

export interface CreditBalance {
  subscriptionPlanType: 'PAID' | 'FREE' | 'NOT_PAID';
  availableCredits: number;
  consumedCredits: number;
  creditUsagePercentage: number;
}

export interface ConsumptionBranch {
  labels: Record<string, string>;
  consumption: number;
  childBranches: ConsumptionBranch[] | null;
}

export interface ConsumptionProjection {
  id: string;
  title: string;
  origin: string | null;
  childEntities: ConsumptionProjection[] | null;
}

export interface ConsumptionUnit {
  unit: string;
  consumption: number;
  roundedConsumption: number;
  consumptionUnitPrice: number;
  credits: number;
  updated: string;
  decomposition: ConsumptionBranch[] | null;
}

export interface ConsumptionProduct {
  product: string;
  credits: number;
  units: ConsumptionUnit[];
  entityProjections: Partial<Record<string, ConsumptionProjection[]>> | null;
}

export interface ConsumptionSummary {
  credits: number | null;
  actualCreditsCalculationRevision: string;
  products: ConsumptionProduct[];
}

export interface SubscriptionDetails {
  billingAccount: string | null;
  name: string;
  status: 'ACTIVE' | 'CANCELED';
  startDate: string;
  endDate: string | null;
  billingCycle:
    | 'MONTHLY'
    | 'QUARTERLY'
    | 'SEMIANNUAL'
    | 'NINE_MONTHLY'
    | 'YEARLY'
    | 'NON_RECURRING';
  price: number;
  currency: string;
  credits: number;
  creditsPerMonth: number;
  planType: 'PAID' | 'FREE' | 'NOT_PAID';
  subscribeReason: string | null;
}

type BillingEndpoint =
  | '/api/bi-projects/balance'
  | '/api/consumption/project-summary'
  | '/api/billing/subscription-details';

export function useCloudBillingQuery<T>(
  origin: string,
  endpoint: BillingEndpoint,
  period?: { year: number; month: number }
) {
  const user = useUser();
  return useQuery({
    queryKey: ['cloud-billing', origin, user?.id, user?.projectId, endpoint, period],
    enabled: Boolean(user?.id && user.projectId),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!user?.id || !user.projectId) throw new Error('Project session required');
      const config: AxiosRequestConfig = {
        baseURL: origin,
        signal,
        params: period,
        headers: { 'Content-Type': null },
        withCredentials: false,
        skipErrorToast: true,
        expectedSession: { projectId: user.projectId, userId: user.id },
      };
      const { data } = await apiClient.get<T>(endpoint, config);
      return data;
    },
  });
}
