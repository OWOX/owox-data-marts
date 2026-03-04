import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { insightTemplateSourcesService } from '../services/insight-template-sources.service';
import { mapInsightTemplateSourceListFromDto } from '../mappers/insight-template-sources.mapper';
import type {
  CreateInsightTemplateSourceRequestDto,
  UpdateInsightTemplateSourceRequestDto,
} from '../types/insight-template-sources.dto';

const INSIGHT_TEMPLATE_SOURCES_QUERY_KEY = 'insight-template-sources';

export const useInsightTemplateSources = (dataMartId: string, insightTemplateId: string) => {
  return useQuery({
    queryKey: [INSIGHT_TEMPLATE_SOURCES_QUERY_KEY, dataMartId, insightTemplateId],
    queryFn: async () => {
      const response = await insightTemplateSourcesService.getInsightTemplateSources(
        dataMartId,
        insightTemplateId
      );
      return mapInsightTemplateSourceListFromDto(response);
    },
    enabled: !!dataMartId && !!insightTemplateId,
  });
};

export const useCreateInsightTemplateSource = (dataMartId: string, insightTemplateId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInsightTemplateSourceRequestDto) =>
      insightTemplateSourcesService.createInsightTemplateSource(
        dataMartId,
        insightTemplateId,
        data
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [INSIGHT_TEMPLATE_SOURCES_QUERY_KEY, dataMartId, insightTemplateId],
      });
    },
  });
};

export const useUpdateInsightTemplateSource = (dataMartId: string, insightTemplateId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sourceId,
      data,
    }: {
      sourceId: string;
      data: UpdateInsightTemplateSourceRequestDto;
    }) =>
      insightTemplateSourcesService.updateInsightTemplateSource(
        dataMartId,
        insightTemplateId,
        sourceId,
        data
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [INSIGHT_TEMPLATE_SOURCES_QUERY_KEY, dataMartId, insightTemplateId],
      });
    },
  });
};

export const useDeleteInsightTemplateSource = (dataMartId: string, insightTemplateId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: string) =>
      insightTemplateSourcesService.deleteInsightTemplateSource(
        dataMartId,
        insightTemplateId,
        sourceId
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [INSIGHT_TEMPLATE_SOURCES_QUERY_KEY, dataMartId, insightTemplateId],
      });
    },
  });
};
