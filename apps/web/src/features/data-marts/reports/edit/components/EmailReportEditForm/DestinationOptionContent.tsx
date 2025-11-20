import { type DataDestination, DataDestinationTypeModel } from '../../../../../data-destination';

export interface DestinationOptionContentProps {
  destination: DataDestination;
}

export const DestinationOptionContent = ({ destination }: DestinationOptionContentProps) => {
  const typeInfo = DataDestinationTypeModel.getInfo(destination.type);
  const IconComponent = typeInfo.icon;

  return (
    <div className='flex w-full min-w-0 items-center gap-2'>
      <IconComponent className='flex-shrink-0' size={18} />
      <div className='flex min-w-0 flex-col'>
        <span className='truncate'>{destination.title}</span>
      </div>
    </div>
  );
};
