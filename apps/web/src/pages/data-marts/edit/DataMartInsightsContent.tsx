import { useLayoutEffect, useRef } from 'react';
import { Outlet } from 'react-router';
import { InsightsProvider } from '../../../features/data-marts/insights-prev/model';

export default function DataMartInsightsContent() {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const top = el.getBoundingClientRect().top;
      el.style.height = (window.innerHeight - top - 24).toString() + 'px';
    };

    update();
    window.addEventListener('resize', update);
    document.documentElement.style.overflowY = 'hidden';

    return () => {
      window.removeEventListener('resize', update);
      document.documentElement.style.overflowY = '';
    };
  }, []);

  return (
    <InsightsProvider>
      <div ref={ref} className='overflow-hidden'>
        <Outlet />
      </div>
    </InsightsProvider>
  );
}
