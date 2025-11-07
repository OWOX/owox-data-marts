import { Outlet } from 'react-router-dom';

export default function DataMartInsightsContent() {
  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Insights</h1>
      </header>
      <div className='dm-page-content'>
        <Outlet />
      </div>
    </div>
  );
}
