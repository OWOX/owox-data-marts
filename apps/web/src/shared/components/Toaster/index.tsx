import { Toaster as HotToaster } from 'react-hot-toast';
import { TOASTER_CONTAINER_CLASS } from './toaster-container';

export function Toaster() {
  return (
    <HotToaster
      position='top-center'
      containerClassName={TOASTER_CONTAINER_CLASS}
      toastOptions={{
        duration: 3000,
        style: {
          borderRadius: '32px',
          boxShadow: 'none',
          padding: '0.4rem 1rem',
          maxWidth: '800px',
          fontSize: '0.875rem',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
        },
        success: {
          style: {
            background: '#ECFDF5',
            color: '#166534',
            borderBottomColor: '#D6DFE6',
          },
        },
        error: {
          style: {
            background: '#FEE2E2',
            color: '#991B1B',
            borderBottomColor: '#EAD1D1',
          },
          duration: 6000,
        },
        loading: {
          style: {
            background: '#E8EDFB',
            color: '#1D4ED8',
            borderBottomColor: '#CAD5F6',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
          },
        },
      }}
    />
  );
}
