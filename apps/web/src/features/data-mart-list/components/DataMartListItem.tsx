import type { DataMartListItem } from '../model/types';

export const DataMartListItemComponent = ({ item }: { item: DataMartListItem }) => (
  <div>
    <h3>{item.title}</h3>
    <span> Last updated: {new Date(item.modifiedAt).toLocaleDateString()}</span>
  </div>
);
