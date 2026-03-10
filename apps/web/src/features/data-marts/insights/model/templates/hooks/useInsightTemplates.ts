import { useQuery } from '@tanstack/react-query';
import { insightTemplatesService } from '../services/insight-templates.service';
import { mapInsightTemplateListFromDto } from '../mappers/insight-templates.mapper';

const INSIGHT_TEMPLATES_QUERY_KEY = 'insight-templates';

/**
 * Hook for fetching insight templates for a data mart
 */
export const useInsightTemplates = (dataMartId: string) => {
  return useQuery({
    queryKey: [INSIGHT_TEMPLATES_QUERY_KEY, dataMartId],
    queryFn: async () => {
      const response = await insightTemplatesService.getInsightTemplates(dataMartId);
      return mapInsightTemplateListFromDto(response);
    },
    enabled: !!dataMartId,
  });
};
