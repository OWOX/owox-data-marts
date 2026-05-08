export interface LocationOption {
  value: string;
  label: string;
  group: string;
}

export const googleBigQueryLocationOptions: LocationOption[] = [
  // North America
  { value: 'US', label: 'US (multiple regions in United States)', group: 'North America' },
  {
    value: 'northamerica-northeast1',
    label: 'northamerica-northeast1 (Montréal, Canada)',
    group: 'North America',
  },
  {
    value: 'northamerica-northeast2',
    label: 'northamerica-northeast2 (Toronto, Canada)',
    group: 'North America',
  },
  {
    value: 'northamerica-south1',
    label: 'northamerica-south1 (Querétaro, Mexico)',
    group: 'North America',
  },
  { value: 'us-central1', label: 'us-central1 (Iowa, United States)', group: 'North America' },
  {
    value: 'us-east1',
    label: 'us-east1 (South Carolina, United States)',
    group: 'North America',
  },
  {
    value: 'us-east4',
    label: 'us-east4 (Northern Virginia, United States)',
    group: 'North America',
  },
  { value: 'us-east5', label: 'us-east5 (Columbus, United States)', group: 'North America' },
  { value: 'us-south1', label: 'us-south1 (Dallas, United States)', group: 'North America' },
  { value: 'us-west1', label: 'us-west1 (Oregon, United States)', group: 'North America' },
  {
    value: 'us-west2',
    label: 'us-west2 (Los Angeles, United States)',
    group: 'North America',
  },
  {
    value: 'us-west3',
    label: 'us-west3 (Salt Lake City, United States)',
    group: 'North America',
  },
  { value: 'us-west4', label: 'us-west4 (Las Vegas, United States)', group: 'North America' },

  // Europe
  { value: 'EU', label: 'EU (multiple regions in Europe)', group: 'Europe' },
  {
    value: 'europe-central2',
    label: 'europe-central2 (Warsaw, Poland)',
    group: 'Europe',
  },
  { value: 'europe-north1', label: 'europe-north1 (Hamina, Finland)', group: 'Europe' },
  {
    value: 'europe-southwest1',
    label: 'europe-southwest1 (Madrid, Spain)',
    group: 'Europe',
  },
  { value: 'europe-west1', label: 'europe-west1 (St. Ghislain, Belgium)', group: 'Europe' },
  { value: 'europe-west2', label: 'europe-west2 (London, United Kingdom)', group: 'Europe' },
  { value: 'europe-west3', label: 'europe-west3 (Frankfurt, Germany)', group: 'Europe' },
  {
    value: 'europe-west4',
    label: 'europe-west4 (Eemshaven, Netherlands)',
    group: 'Europe',
  },
  { value: 'europe-west6', label: 'europe-west6 (Zürich, Switzerland)', group: 'Europe' },
  { value: 'europe-west8', label: 'europe-west8 (Milan, Italy)', group: 'Europe' },
  { value: 'europe-west9', label: 'europe-west9 (Paris, France)', group: 'Europe' },
  { value: 'europe-west10', label: 'europe-west10 (Berlin, Germany)', group: 'Europe' },
  { value: 'europe-west12', label: 'europe-west12 (Turin, Italy)', group: 'Europe' },

  // Asia Pacific
  {
    value: 'asia-east1',
    label: 'asia-east1 (Changhua County, Taiwan)',
    group: 'Asia Pacific',
  },
  { value: 'asia-east2', label: 'asia-east2 (Hong Kong)', group: 'Asia Pacific' },
  {
    value: 'asia-northeast1',
    label: 'asia-northeast1 (Tokyo, Japan)',
    group: 'Asia Pacific',
  },
  {
    value: 'asia-northeast2',
    label: 'asia-northeast2 (Osaka, Japan)',
    group: 'Asia Pacific',
  },
  {
    value: 'asia-northeast3',
    label: 'asia-northeast3 (Seoul, South Korea)',
    group: 'Asia Pacific',
  },
  { value: 'asia-south1', label: 'asia-south1 (Mumbai, India)', group: 'Asia Pacific' },
  { value: 'asia-south2', label: 'asia-south2 (Delhi, India)', group: 'Asia Pacific' },
  {
    value: 'asia-southeast1',
    label: 'asia-southeast1 (Singapore)',
    group: 'Asia Pacific',
  },
  {
    value: 'asia-southeast2',
    label: 'asia-southeast2 (Jakarta, Indonesia)',
    group: 'Asia Pacific',
  },
  {
    value: 'australia-southeast1',
    label: 'australia-southeast1 (Sydney, Australia)',
    group: 'Asia Pacific',
  },
  {
    value: 'australia-southeast2',
    label: 'australia-southeast2 (Melbourne, Australia)',
    group: 'Asia Pacific',
  },

  // Middle East
  { value: 'me-central1', label: 'me-central1 (Doha, Qatar)', group: 'Middle East' },
  {
    value: 'me-central2',
    label: 'me-central2 (Dammam, Saudi Arabia)',
    group: 'Middle East',
  },
  { value: 'me-west1', label: 'me-west1 (Tel Aviv, Israel)', group: 'Middle East' },

  // South America
  {
    value: 'southamerica-east1',
    label: 'southamerica-east1 (São Paulo, Brazil)',
    group: 'South America',
  },
  {
    value: 'southamerica-west1',
    label: 'southamerica-west1 (Santiago, Chile)',
    group: 'South America',
  },

  // Africa
  {
    value: 'africa-south1',
    label: 'africa-south1 (Johannesburg, South Africa)',
    group: 'Africa',
  },
];
