import { useLayoutEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';

export default function DataMartNextInsightsContent() {
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
    <div ref={ref} className='overflow-hidden'>
      <Outlet />
    </div>
  );
}
