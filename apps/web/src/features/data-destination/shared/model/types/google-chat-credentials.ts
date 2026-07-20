export type GoogleChatCredentials =
  | {
      deliveryMethod: 'webhook';
      /** Empty for an existing destination because webhook URLs are never returned by the API. */
      webhookUrl?: string;
      configured?: boolean;
    }
  | {
      deliveryMethod: 'email';
      to: string[];
    };
