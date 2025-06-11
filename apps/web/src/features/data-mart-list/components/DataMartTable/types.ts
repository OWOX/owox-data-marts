// Define the DataMart type that will be used in the DataMartTable component
export interface DataMart {
  id: string;
  title: string;
  owner: string;
  createdAt: Date;
  status: 'pending' | 'processing' | 'success' | 'failed';
}
