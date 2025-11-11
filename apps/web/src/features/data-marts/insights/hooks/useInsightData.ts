import { useNavigate, useParams } from 'react-router-dom';
import { useMemo as useReactMemo } from 'react';
import { useInsights, useInsightsList, type InsightEntity } from '../model'; // Припускаючи, що Insight тут експортується

export const useInsightData = () => {
  const navigate = useNavigate();
  const { insightId } = useParams<{ insightId: string }>();

  const { updateInsight, deleteInsight } = useInsights();
  const { insights } = useInsightsList();

  const insight = useReactMemo(
    () => insights.find(i => i.id === (insightId ?? '')),
    [insights, insightId]
  ) as InsightEntity | undefined;

  const handleDelete = async () => {
    if (!insight) return;
    await deleteInsight(insight.id);
    navigate('..');
  };

  return {
    insight,
    insightId,
    updateInsight,
    handleDelete,
  };
};
