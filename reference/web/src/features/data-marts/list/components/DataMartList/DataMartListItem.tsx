import type { DataMartListItem } from '../../model/types';
import { Link } from 'react-router-dom';

interface DataMartListItemProps {
  item: DataMartListItem;
}
export const DataMartListItemComponent = ({ item }: DataMartListItemProps) => (
  <div>
    <Link
      to={`/data-marts/${item.id}`}
      className='block cursor-pointer rounded-lg p-4 transition-colors hover:bg-gray-100'
    >
      <h3>{item.title}</h3>
      <span> Last updated: {new Date(item.modifiedAt).toLocaleDateString()}</span>
    </Link>
  </div>
);
