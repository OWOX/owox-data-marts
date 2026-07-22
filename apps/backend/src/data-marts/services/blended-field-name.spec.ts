import { buildBlendedFieldUnifiedName } from './blended-field-name';

describe('buildBlendedFieldUnifiedName', () => {
  it('keeps a flat field name unchanged (no hash)', () => {
    expect(buildBlendedFieldUnifiedName('ads', 'campaign_id')).toBe('ads__campaign_id');
  });

  it('always hashes a nested field, even with zero collision risk present', () => {
    // sha1('ads|campaign.id').slice(0, 8), computed independently of the implementation.
    expect(buildBlendedFieldUnifiedName('ads', 'campaign.id')).toBe('ads__campaign_id__a8702665');
  });

  it('gives the flat campaign_id and nested campaign.id case from the bug report distinct names', () => {
    const flat = buildBlendedFieldUnifiedName('ads', 'campaign_id');
    const nested = buildBlendedFieldUnifiedName('ads', 'campaign.id');
    expect(flat).not.toBe(nested);
  });

  it('hashes a 3-level struct path correctly, distinct from a 2-level path sharing the same leaf', () => {
    const threeLevel = buildBlendedFieldUnifiedName('ads', 'catalog.category.id');
    const twoLevel = buildBlendedFieldUnifiedName('ads', 'category.id');
    expect(threeLevel).toBe('ads__catalog_category_id__d614205f');
    expect(twoLevel).toBe('ads__category_id__3ec1e389');
    expect(threeLevel).not.toBe(twoLevel);
  });

  it('derives sqlPrefix from aliasPath (nested join paths)', () => {
    expect(buildBlendedFieldUnifiedName('category.details', 'item_count')).toBe(
      'category_details__item_count'
    );
    // sha1('category.details|item.event_count').slice(0, 8)
    expect(buildBlendedFieldUnifiedName('category.details', 'item.event_count')).toBe(
      'category_details__item_event_count__d9cd4740'
    );
  });

  it('is stable regardless of any other field, proving there is no reactive/relational behavior', () => {
    const first = buildBlendedFieldUnifiedName('ads', 'campaign.id');
    // Interleave calls for other, unrelated field identities in between - the
    // result for the same (aliasPath, originalFieldName) must never change.
    buildBlendedFieldUnifiedName('orders', 'customer.id');
    buildBlendedFieldUnifiedName('ads', 'campaign_id');
    const second = buildBlendedFieldUnifiedName('ads', 'campaign.id');
    expect(second).toBe(first);
  });
});
