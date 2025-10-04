export interface LocationOption {
  value: string;
  label: string;
  group: string;
}

export const googleBigQueryLocationOptions: LocationOption[] = [
  // North America
  { value: 'US', label: 'US (multiple regions)', group: 'North America' },
  {
    value: 'northamerica-northeast1',
    label: 'northamerica-northeast1 (Montréal)',
    group: 'North America',
  },
  {
    value: 'northamerica-northeast2',
    label: 'northamerica-northeast2 (Toronto)',
    group: 'North America',
  },
  { value: 'us-central1', label: 'us-central1 (Iowa)', group: 'North America' },
  { value: 'us-east1', label: 'us-east1 (South Carolina)', group: 'North America' },
  { value: 'us-east4', label: 'us-east4 (Northern Virginia)', group: 'North America' },
  { value: 'us-east5', label: 'us-east5 (Columbus)', group: 'North America' },
  { value: 'us-west1', label: 'us-west1 (Oregon)', group: 'North America' },
  { value: 'us-west2', label: 'us-west2 (Los Angeles)', group: 'North America' },
  { value: 'us-west3', label: 'us-west3 (Salt Lake City)', group: 'North America' },
  { value: 'us-west4', label: 'us-west4 (Las Vegas)', group: 'North America' },
  // Europe
  { value: 'EU', label: 'EU (multiple regions)', group: 'Europe' },
  { value: 'europe-central2', label: 'europe-central2 (Warsaw)', group: 'Europe' },
  { value: 'europe-north1', label: 'europe-north1 (Finland)', group: 'Europe' },
  { value: 'europe-southwest1', label: 'europe-southwest1 (Madrid)', group: 'Europe' },
  { value: 'europe-west1', label: 'europe-west1 (Belgium)', group: 'Europe' },
  { value: 'europe-west2', label: 'europe-west2 (London)', group: 'Europe' },
  { value: 'europe-west3', label: 'europe-west3 (Frankfurt)', group: 'Europe' },
  { value: 'europe-west4', label: 'europe-west4 (Netherlands)', group: 'Europe' },
  { value: 'europe-west6', label: 'europe-west6 (Zurich)', group: 'Europe' },
  { value: 'europe-west8', label: 'europe-west8 (Milan)', group: 'Europe' },
  { value: 'europe-west9', label: 'europe-west9 (Paris)', group: 'Europe' },
  { value: 'europe-west12', label: 'europe-west12 (Turin)', group: 'Europe' },
  // Asia Pacific
  { value: 'asia-east1', label: 'asia-east1 (Taiwan)', group: 'Asia Pacific' },
  { value: 'asia-east2', label: 'asia-east2 (Hong Kong)', group: 'Asia Pacific' },
  { value: 'asia-northeast1', label: 'asia-northeast1 (Tokyo)', group: 'Asia Pacific' },
  { value: 'asia-northeast2', label: 'asia-northeast2 (Osaka)', group: 'Asia Pacific' },
  { value: 'asia-northeast3', label: 'asia-northeast3 (Seoul)', group: 'Asia Pacific' },
  { value: 'asia-south1', label: 'asia-south1 (Mumbai)', group: 'Asia Pacific' },
  { value: 'asia-south2', label: 'asia-south2 (Delhi)', group: 'Asia Pacific' },
  { value: 'asia-southeast1', label: 'asia-southeast1 (Singapore)', group: 'Asia Pacific' },
  { value: 'asia-southeast2', label: 'asia-southeast2 (Jakarta)', group: 'Asia Pacific' },
  { value: 'australia-southeast1', label: 'australia-southeast1 (Sydney)', group: 'Asia Pacific' },
  {
    value: 'australia-southeast2',
    label: 'australia-southeast2 (Melbourne)',
    group: 'Asia Pacific',
  },
  // Other
  { value: 'southamerica-east1', label: 'southamerica-east1 (São Paulo)', group: 'Other' },
  { value: 'southamerica-west1', label: 'southamerica-west1 (Santiago)', group: 'Other' },
  { value: 'me-central1', label: 'me-central1 (Doha)', group: 'Other' },
  { value: 'me-central2', label: 'me-central2 (Dammam)', group: 'Other' },
  { value: 'me-west1', label: 'me-west1 (Tel Aviv)', group: 'Other' },
  { value: 'africa-south1', label: 'africa-south1 (Johannesburg)', group: 'Other' },
];
