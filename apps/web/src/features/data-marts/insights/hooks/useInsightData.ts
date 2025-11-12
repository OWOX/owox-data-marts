import { useNavigate, useParams } from 'react-router-dom';
import { useCallback, useEffect } from 'react';
import { useInsights, type InsightEntity } from '../model';

export const useInsightData = () => {
  const navigate = useNavigate();
  const { insightId } = useParams<{ insightId: string }>();

  const { updateInsight, deleteInsight, getInsight, currentInsight } = useInsights();

  // Fetch the insight on demand when insightId changes
  useEffect(() => {
    if (!insightId) return;
    void getInsight(insightId);
  }, [insightId, getInsight]);

  const insight = currentInsight as InsightEntity | undefined;

  const handleDelete = useCallback(async () => {
    if (!insight) return;
    await deleteInsight(insight.id);
    navigate('..');
  }, [insight, deleteInsight, navigate]);

  return {
    insight,
    insightId,
    updateInsight,
    handleDelete,
  };
};
