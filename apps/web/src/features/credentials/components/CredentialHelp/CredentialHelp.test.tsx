import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GoogleChatWebhookDescription from './GoogleChatWebhookDescription';
import GoogleProviderChoiceDescription from './GoogleProviderChoiceDescription';

const open = () => fireEvent.click(screen.getByRole('button'));

describe('GoogleProviderChoiceDescription', () => {
  it('keeps the Storage text for the Storage pair, with the renamed service account', () => {
    render(
      <GoogleProviderChoiceDescription definitionIds={['google-oauth', 'google-service-account']} />
    );
    open();

    expect(screen.getByText('BigQuery supports two authentication methods:')).toBeInTheDocument();
    expect(screen.getByText(/Best for most users\./)).toBeInTheDocument();
    expect(screen.getByText('Google Service Account:')).toBeInTheDocument();
    expect(screen.queryByText(/It fits both BigQuery Storages/)).not.toBeInTheDocument();
    expect(screen.getByText(/Whichever provider you choose/)).toBeInTheDocument();
  });

  it('adds the Sheets and Chat blocks only when those definitions are offered', () => {
    render(
      <GoogleProviderChoiceDescription
        definitionIds={['google-service-account', 'google-sheets-oauth', 'google-chat-webhook']}
      />
    );
    open();

    expect(screen.getByText('Sheets Google account (OAuth):')).toBeInTheDocument();
    expect(screen.getByText('Google Chat webhook:')).toBeInTheDocument();
    expect(screen.queryByText('BigQuery supports two authentication methods:')).toBeNull();
    expect(screen.getByText(/For BigQuery, the account/)).toBeInTheDocument();
    expect(screen.queryByText(/Whichever provider you choose/)).toBeNull();
  });

  it('omits the BigQuery roles for the Sheets Destination pair', () => {
    render(
      <GoogleProviderChoiceDescription
        definitionIds={['google-service-account', 'google-sheets-oauth']}
      />
    );
    open();

    expect(screen.queryByText(/roles\/bigquery\.dataEditor/)).toBeNull();
  });

  it('omits the BigQuery roles when neither BigQuery provider is offered', () => {
    render(<GoogleProviderChoiceDescription definitionIds={['google-sheets-oauth']} />);
    open();

    expect(screen.queryByText(/roles\/bigquery\.dataEditor/)).toBeNull();
  });
});

describe('GoogleChatWebhookDescription', () => {
  it('keeps the moved instructions and points to the Webhook URL field', () => {
    render(<GoogleChatWebhookDescription />);
    open();

    expect(screen.getByText(/Open the target space in Google Chat on a computer/)).toBeVisible();
    expect(screen.getByText(/Google Workspace administrator might have disabled/)).toBeVisible();
    expect(screen.getByText(/Webhook URL field of the Credential form/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Google Chat webhook guide' })).toHaveAttribute(
      'href',
      'https://developers.google.com/workspace/chat/quickstart/webhooks'
    );
  });
});
