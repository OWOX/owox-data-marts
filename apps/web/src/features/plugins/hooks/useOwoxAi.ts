import { useQuery } from '@tanstack/react-query';
import { pluginsService } from '../services/plugins.service';

/** Whether this deployment offers OWOX AI to plugins, and whether its calls use project credits. */
export function useOwoxAi() {
  const { data, isLoading } = useQuery({
    queryKey: ['plugins', 'owox-ai'],
    queryFn: () => pluginsService.getOwoxAi(),
    staleTime: 60_000,
    retry: false,
  });
  return { owoxAi: data, isLoading };
}
