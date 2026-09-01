import { CredentialsManager } from '../../features/credentials';

export function CredentialsPage() {
  return (
    <div className='dm-page'>
      <header className='dm-page-header'>
        <h1 className='dm-page-header-title'>Credentials</h1>
      </header>
      <div className='dm-page-content'>
        <CredentialsManager />
      </div>
    </div>
  );
}
