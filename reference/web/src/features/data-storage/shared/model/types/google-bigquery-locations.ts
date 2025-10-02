export interface LocationOption {
  value: string;
  label: string;
  group: string;
}

export const googleBigQueryLocationOptions: LocationOption[] = [
  // North America
  { value: 'US', label: 'US (multiple regions)', group: 'North America' },
  { value: 'northamerica-northeast1', label: 'Montréal', group: 'North America' },
  { value: 'northamerica-northeast2', label: 'Toronto', group: 'North America' },
  { value: 'us-central1', label: 'Iowa', group: 'North America' },
  { value: 'us-east1', label: 'South Carolina', group: 'North America' },
  { value: 'us-east4', label: 'Northern Virginia', group: 'North America' },
  { value: 'us-east5', label: 'Columbus', group: 'North America' },
  { value: 'us-west1', label: 'Oregon', group: 'North America' },
  { value: 'us-west2', label: 'Los Angeles', group: 'North America' },
  { value: 'us-west3', label: 'Salt Lake City', group: 'North America' },
  { value: 'us-west4', label: 'Las Vegas', group: 'North America' },
  // Europe
  { value: 'EU', label: 'EU (multiple regions)', group: 'Europe' },
  { value: 'europe-central2', label: 'Warsaw', group: 'Europe' },
  { value: 'europe-north1', label: 'Finland', group: 'Europe' },
  { value: 'europe-southwest1', label: 'Madrid', group: 'Europe' },
  { value: 'europe-west1', label: 'Belgium', group: 'Europe' },
  { value: 'europe-west2', label: 'London', group: 'Europe' },
  { value: 'europe-west3', label: 'Frankfurt', group: 'Europe' },
  { value: 'europe-west4', label: 'Netherlands', group: 'Europe' },
  { value: 'europe-west6', label: 'Zurich', group: 'Europe' },
  { value: 'europe-west8', label: 'Milan', group: 'Europe' },
  { value: 'europe-west9', label: 'Paris', group: 'Europe' },
  { value: 'europe-west12', label: 'Turin', group: 'Europe' },
  // Asia Pacific
  { value: 'asia-east1', label: 'Taiwan', group: 'Asia Pacific' },
  { value: 'asia-east2', label: 'Hong Kong', group: 'Asia Pacific' },
  { value: 'asia-northeast1', label: 'Tokyo', group: 'Asia Pacific' },
  { value: 'asia-northeast2', label: 'Osaka', group: 'Asia Pacific' },
  { value: 'asia-northeast3', label: 'Seoul', group: 'Asia Pacific' },
  { value: 'asia-south1', label: 'Mumbai', group: 'Asia Pacific' },
  { value: 'asia-south2', label: 'Delhi', group: 'Asia Pacific' },
  { value: 'asia-southeast1', label: 'Singapore', group: 'Asia Pacific' },
  { value: 'asia-southeast2', label: 'Jakarta', group: 'Asia Pacific' },
  { value: 'australia-southeast1', label: 'Sydney', group: 'Asia Pacific' },
  { value: 'australia-southeast2', label: 'Melbourne', group: 'Asia Pacific' },
  // Other
  { value: 'southamerica-east1', label: 'São Paulo', group: 'Other' },
  { value: 'southamerica-west1', label: 'Santiago', group: 'Other' },
  { value: 'me-central1', label: 'Doha', group: 'Other' },
  { value: 'me-central2', label: 'Dammam', group: 'Other' },
  { value: 'me-west1', label: 'Tel Aviv', group: 'Other' },
  { value: 'africa-south1', label: 'Johannesburg', group: 'Other' },
];
