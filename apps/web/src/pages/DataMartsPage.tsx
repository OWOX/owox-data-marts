import { DataMartTable } from '../features/data-mart-list';
import { columns } from '../features/data-mart-list/components/DataMartTable/columns';
import { type DataMart } from '../features/data-mart-list/components/DataMartTable/types';

// Sample data for demonstration
const data: DataMart[] = [
  {
    id: '728ed52f',
    title: 'Marketing Analytics',
    status: 'success',
    owner: 'm@example.com',
    createdAt: new Date('2024-03-01'),
  },
  {
    id: '489e1d42',
    title: 'Sales Performance',
    status: 'processing',
    owner: 'example@test.com',
    createdAt: new Date('2024-03-10'),
  },
  {
    id: '489e1d43',
    title: 'Customer Insights',
    status: 'success',
    owner: 'test@example.com',
    createdAt: new Date('2024-03-15'),
  },
  {
    id: 'e19c8a21',
    title: 'Ad Campaign ROI',
    status: 'failed',
    owner: 'ana@company.com',
    createdAt: new Date('2024-02-20'),
  },
  {
    id: 'f56bd930',
    title: 'Email Marketing Metrics',
    status: 'success',
    owner: 'kate@marketing.com',
    createdAt: new Date('2024-03-05'),
  },
  {
    id: '7abf2441',
    title: 'Lead Generation Funnel',
    status: 'processing',
    owner: 'john@analytics.io',
    createdAt: new Date('2024-01-18'),
  },
  {
    id: 'a62d871f',
    title: 'Website Traffic Analysis',
    status: 'success',
    owner: 'maria@insights.org',
    createdAt: new Date('2024-02-02'),
  },
  {
    id: 'c489ab20',
    title: 'Organic vs Paid Performance',
    status: 'success',
    owner: 'alex@company.com',
    createdAt: new Date('2024-01-29'),
  },
  {
    id: 'bfa7d130',
    title: 'Social Media Engagement',
    status: 'failed',
    owner: 'linda@socials.net',
    createdAt: new Date('2024-03-12'),
  },
  {
    id: 'd31ab4e9',
    title: 'SEO Ranking Tracker',
    status: 'success',
    owner: 'kevin@seo.io',
    createdAt: new Date('2024-02-25'),
  },
  {
    id: '9981d002',
    title: 'Product Launch Impact',
    status: 'processing',
    owner: 'olga@launches.com',
    createdAt: new Date('2024-04-01'),
  },
  {
    id: '7723aa88',
    title: 'Customer Retention Metrics',
    status: 'success',
    owner: 'sasha@crm.io',
    createdAt: new Date('2024-03-28'),
  },
  {
    id: 'ff20a320',
    title: 'Landing Page Conversions',
    status: 'failed',
    owner: 'ivan@webtools.io',
    createdAt: new Date('2024-02-15'),
  },
  {
    id: 'e442dc98',
    title: 'Campaign Budget Allocation',
    status: 'success',
    owner: 'mila@adspend.org',
    createdAt: new Date('2024-03-20'),
  },
  {
    id: '184d1a87',
    title: 'Referral Traffic Analysis',
    status: 'processing',
    owner: 'denis@referral.io',
    createdAt: new Date('2024-01-11'),
  },
  {
    id: '29fdbe71',
    title: 'Multi-Channel Attribution',
    status: 'success',
    owner: 'tania@analytics.com',
    createdAt: new Date('2024-03-09'),
  },
  {
    id: '91bcdd43',
    title: 'App User Acquisition',
    status: 'success',
    owner: 'yaroslav@mobile.io',
    createdAt: new Date('2024-03-23'),
  },
  {
    id: 'a71db12e',
    title: 'Conversion Rate by Source',
    status: 'failed',
    owner: 'oksana@funnels.io',
    createdAt: new Date('2024-02-28'),
  },
  {
    id: '607bdcc4',
    title: 'Weekly Marketing Summary',
    status: 'success',
    owner: 'vlad@reports.org',
    createdAt: new Date('2024-03-16'),
  },
  {
    id: '31cdd771',
    title: 'AB Test Results',
    status: 'success',
    owner: 'julia@abtesting.com',
    createdAt: new Date('2024-01-25'),
  },
];

export default function DataMartsPage() {
  return (
    <div>
      <header className='px-12 pt-6 pb-4'>
        <h1 className='text-2xl font-medium'>Data Marts</h1>
      </header>
      <div className='px-4 sm:px-12'>
        <DataMartTable columns={columns} data={data} />
      </div>
    </div>
  );
}
