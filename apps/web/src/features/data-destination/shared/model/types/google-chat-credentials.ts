/** Webhook delivery sends through the Destination's Credential; email delivery keeps recipients here. */
export type GoogleChatCredentials =
  | { deliveryMethod: 'webhook' }
  | { deliveryMethod: 'email'; to: string[] };
