import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AiAssistantMessage } from '../AiAssistantMessage';
import { ACTION_LABELS } from '../../../model/ai-assistant/utils/action-labels';
import type { AiAssistantMessageDto } from '../../../model/ai-assistant/types/ai-assistant.dto';
import type { AssistantMessageDetails } from '../../../model/ai-assistant/types/ai-assistant-panel.types';

function buildAssistantMessage(
  overrides: Partial<AiAssistantMessageDto> = {}
): AiAssistantMessageDto {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'assistant',
    content: 'Here is a change',
    applyStatus: 'none',
    createdAt: new Date().toISOString(),
    proposedActions: [],
    ...overrides,
  };
}

const baseDetails: AssistantMessageDetails = {
  sqlCandidate: '',
  applyChangesAction: {
    id: 'a-apply',
    type: 'apply_changes_to_source',
    confidence: 1,
    payload: {},
  },
  createAndAttachAction: {
    id: 'a-create',
    type: 'create_source_and_attach',
    confidence: 1,
    payload: {},
  },
  insertIntoTemplateAction: {
    id: 'a-reuse',
    type: 'reuse_source_without_changes',
    confidence: 1,
    payload: {},
  },
  applyTemplateEditAction: {
    id: 'a-edit',
    type: 'replace_template_document',
    confidence: 1,
    payload: { text: 't', tags: [] },
  },
  hasTemplateEditPayload: true,
  hasActions: true,
};

describe('AiAssistantMessage actions', () => {
  it('renders split buttons with unified labels', () => {
    render(
      <AiAssistantMessage
        message={buildAssistantMessage()}
        details={baseDetails}
        canEdit
        isApplying={false}
        isHeavyProcessing={false}
        expandedSqlIds={new Set()}
        onToggleSql={() => {}}
        onApplyAction={() => {}}
      />
    );

    expect(screen.getAllByText('Apply & Run')).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: /apply only/i })).toHaveLength(4);
    expect(screen.getByTitle(ACTION_LABELS.applyChanges)).toBeInTheDocument();
    expect(screen.getByTitle(ACTION_LABELS.applyTemplateEdit)).toBeInTheDocument();
  });

  it('calls onApplyAction with shouldRun true/false', async () => {
    const onApplyAction = vi.fn();

    render(
      <AiAssistantMessage
        message={buildAssistantMessage()}
        details={{
          ...baseDetails,
          applyTemplateEditAction: {
            ...baseDetails.applyTemplateEditAction!,
            payload: { text: 't', tags: [] },
          },
        }}
        canEdit
        isApplying={false}
        isHeavyProcessing={false}
        expandedSqlIds={new Set()}
        onToggleSql={() => {}}
        onApplyAction={onApplyAction}
      />
    );

    // primary click (shouldRun true)
    const primary = screen.getAllByText('Apply & Run')[0];
    fireEvent.click(primary);
    expect(onApplyAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'a-apply', shouldRun: true })
    );

    // secondary click (shouldRun false)
    const container = primary.closest('div');
    const dropdownTrigger = within(container!).getByRole('button', { name: /apply only/i });
    fireEvent.pointerDown(dropdownTrigger);
    const applyOnlyItem = await within(document.body).findByText('Apply only');
    fireEvent.click(applyOnlyItem);
    expect(onApplyAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'a-apply', shouldRun: false })
    );
  });

  it('disables actions when busy or cannot edit', () => {
    render(
      <AiAssistantMessage
        message={buildAssistantMessage()}
        details={{ ...baseDetails, hasTemplateEditPayload: false }}
        canEdit={false}
        isApplying
        isHeavyProcessing
        expandedSqlIds={new Set()}
        onToggleSql={() => {}}
        onApplyAction={() => {}}
      />
    );

    screen.getAllByText('Apply & Run').forEach(btn => {
      expect(btn).toBeDisabled();
    });
  });
});
