import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportService } from '../../../shared';
import { mapReportDtoToEntity } from '../../../shared/model/mappers';

const REPORTS_BY_INSIGHT_TEMPLATE_QUERY_KEY = 'reports-by-insight-template';

export const useReportsByInsightTemplate = (dataMartId: string, insightTemplateId: string) => {
  return useQuery({
    queryKey: [REPORTS_BY_INSIGHT_TEMPLATE_QUERY_KEY, dataMartId, insightTemplateId],
    queryFn: async () => {
      const response = await reportService.getReportsByInsightTemplateId(
        dataMartId,
        insightTemplateId
      );
      return response.map(mapReportDtoToEntity);
    },
    enabled: !!dataMartId && !!insightTemplateId,
  });
};

export const useDeleteReport = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reportId: string) => {
      await reportService.deleteReport(reportId);
      return reportId;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      void queryClient.invalidateQueries({ queryKey: [REPORTS_BY_INSIGHT_TEMPLATE_QUERY_KEY] });
    },
  });
};

export const useRunReport = () => {
  return useMutation({
    mutationFn: async (reportId: string) => {
      await reportService.runReport(reportId);
      return reportId;
    },
  });
};
