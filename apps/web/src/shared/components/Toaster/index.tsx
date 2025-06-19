import { Toaster as HotToaster } from 'react-hot-toast';

export function Toaster() {
  return (
    <HotToaster
      position={'top-center'}
      toastOptions={{
        duration: 3000,
        style: {
          background: '#363636',
          color: '#fff',
        },
        success: {
          style: {
            background: '#16a34a',
          },
        },
        error: {
          style: {
            background: '#dc2626',
          },
          duration: 4000,
        },
      }}
    />
  );
}
