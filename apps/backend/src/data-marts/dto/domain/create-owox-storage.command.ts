import type { OwoxStorageLocation } from '../../owox-storage/owox-storage-settings';

export class CreateOwoxStorageCommand {
  constructor(
    public readonly projectId: string,
    public readonly title: string,
    public readonly location: OwoxStorageLocation,
    public readonly userId: string,
    public readonly fromPlugin: boolean,
    public readonly ownerIds?: string[]
  ) {}
}
