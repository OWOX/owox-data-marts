export interface DataLayerEvent {
  event: string;
  eventType?: 'app' | 'system';
  category?: string;
  action?: string;
  label?: string;
  context?: string;
  value?: string;
  details?: string;
  error?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export interface UserIdentifiedEvent extends DataLayerEvent {
  event: 'system_user_identified';
  userId: string;
  userEmail?: string;
  userFullName?: string;
}

export type AnalyticsEvent = DataLayerEvent | UserIdentifiedEvent;

export interface DataLayer {
  push: (data: AnalyticsEvent | Record<string, unknown>) => void;
}

declare global {
  interface Window {
    dataLayer?: DataLayer;
  }
}

const initializeDataLayer = (): void => {
  if (typeof window !== 'undefined' && !window.dataLayer) {
    window.dataLayer = [] as unknown as DataLayer;
  }
};
export const trackEvent = (eventData: AnalyticsEvent): void => {
  eventData.timestamp = eventData.timestamp ?? Date.now();
  eventData.eventType = eventData.eventType ?? 'app';
  pushToDataLayer(eventData);
};

export const trackUserIdentified = (identifiedEvent: Omit<UserIdentifiedEvent, 'event'>): void => {
  trackEvent({
    event: 'system_user_identified',
    eventType: 'system',
    category: 'UserSession',
    action: 'Identified',
    ...identifiedEvent,
  });
};

export const trackLogout = (): void => {
  trackEvent({
    event: 'system_user_logged_out',
    eventType: 'system',
    category: 'UserSession',
    action: 'Logout',
  });
};

export const pushToDataLayer = (data: Record<string, unknown>): void => {
  if (typeof window !== 'undefined') {
    initializeDataLayer();
    try {
      window.dataLayer?.push(data);
    } catch (error) {
      console.error('Failed to push data to dataLayer', error);
    }
  }
};
