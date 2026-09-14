import { SearchableEntityType } from '../../../common/search/search.facade';
import { buildDbSearchQuery, buildSearchText } from './search-query-builder';

describe('search-query-builder', () => {
  describe('buildDbSearchQuery', () => {
    it('creates bounded MySQL query text from normalized tokens', () => {
      const query = buildDbSearchQuery(
        'Revenue metrics for orders',
        SearchableEntityType.DATA_MART
      );

      expect(query).toStrictEqual({
        tokens: ['revenue', 'metric', 'order'],
        mysqlBooleanQuery: '+revenue* +metric* +order*',
      });
    });

    it('leaves the REPORT entity-type word out of the DB query when other tokens remain', () => {
      expect(buildDbSearchQuery('revenue report', SearchableEntityType.REPORT)).toStrictEqual({
        tokens: ['revenue'],
        mysqlBooleanQuery: '+revenue*',
      });
    });

    it.each([
      SearchableEntityType.DATA_MART,
      SearchableEntityType.DATA_STORAGE,
      SearchableEntityType.DATA_DESTINATION,
    ])('requires the report word in the DB query for %s', entityType => {
      expect(buildDbSearchQuery('revenue reports', entityType)).toStrictEqual({
        tokens: ['revenue', 'report'],
        mysqlBooleanQuery: '+revenue* +report*',
      });
    });

    it.each(['report', 'reports'])('keeps a sole %s term in the REPORT DB query', prompt => {
      expect(buildDbSearchQuery(prompt, SearchableEntityType.REPORT)).toStrictEqual({
        tokens: ['report'],
        mysqlBooleanQuery: '+report*',
      });
    });

    it('returns empty DB queries when the prompt has no searchable tokens', () => {
      const query = buildDbSearchQuery('the data mart is in the', SearchableEntityType.DATA_MART);

      expect(query).toStrictEqual({
        tokens: [],
        mysqlBooleanQuery: '',
      });
    });

    it('keeps non-ASCII tokens for DB-backed search', () => {
      const query = buildDbSearchQuery('Выручка заказы', SearchableEntityType.DATA_MART);

      expect(query).toStrictEqual({
        tokens: ['выручка', 'заказы'],
        mysqlBooleanQuery: '+выручка* +заказы*',
      });
    });
  });

  describe('buildSearchText', () => {
    it('normalizes embeddingText only for DB search', () => {
      const searchText = buildSearchText(
        JSON.stringify({
          title: 'Revenue Overview',
          description: 'Annual metrics for finance',
          embeddingText: 'Output schema:\n- raw_revenue / Revenue Amount: Booked revenue',
          richTextSlots: [
            { kind: 'title', text: 'Revenue Overview' },
            { kind: 'context', text: 'Finance Team' },
          ],
          atomicTokenSlots: [{ kind: 'field', text: 'legacy_only_field' }],
        })
      );

      expect(searchText).toBe('output schema raw revenue revenue amount booked revenue');
      expect(searchText).toContain('revenue amount');
      expect(searchText).not.toContain('finance team');
      expect(searchText).not.toContain('legacy only field');
    });

    it('keeps non-ASCII embeddingText for DB search', () => {
      const searchText = buildSearchText(
        JSON.stringify({
          title: 'Выручка по заказам',
          description: 'Клієнти і замовлення',
          embeddingText: 'Выручка по заказам Клієнти і замовлення',
          richTextSlots: [{ kind: 'title', text: 'Выручка по заказам' }],
          atomicTokenSlots: [{ kind: 'field', text: 'сума_замовлення' }],
        })
      );

      expect(searchText).toBe('выручка по заказам клієнти і замовлення');
      expect(searchText).not.toContain('сума замовлення');
    });
  });
});
