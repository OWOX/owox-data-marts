import { useEffect } from 'react';
import { useDataMartList } from '../../model/hooks';
import { DataMartListItemComponent } from './DataMartListItem.tsx';

export function DataMartList() {
  const { items, loading, error, loadDataMarts } = useDataMartList();

  useEffect(() => {
    void (async () => {
      await loadDataMarts();
    })();
  }, [loadDataMarts]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {items.map(item => (
        <DataMartListItemComponent key={item.id} item={item} />
      ))}
    </div>
  );
}
