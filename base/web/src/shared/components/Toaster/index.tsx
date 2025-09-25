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
            color: '#16a34a',
            background: '#fff',
          },
        },
        error: {
          style: {
            color: '#dc2626',
            background: '#fff',
          },
          duration: 4000,
        },
      }}
    />
  );
}
