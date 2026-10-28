import { useCallback, useEffect, useRef } from 'react';
import { useInvalidateBlendableSchema } from './useInvalidateBlendableSchema';

/**
 * For a link that sends the person to another tab to change a Data Mart's schema. Returns `arm`,
 * which the link calls when it is used. From then on, while the component stays mounted, every
 * return to this tab refetches the blendable schema once, so a change saved there shows up here,
 * even when the person came back before saving it and returned again after.
 */
export function useRefreshBlendableSchemaOnReturn(): () => void {
  const invalidateBlendableSchema = useInvalidateBlendableSchema();
  const armed = useRef(false);
  const away = useRef(false);

  useEffect(() => {
    const leave = () => {
      away.current = true;
    };
    const comeBack = () => {
      if (!armed.current || !away.current) return;
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      away.current = false;
      invalidateBlendableSchema();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') leave();
      else comeBack();
    };
    window.addEventListener('blur', leave);
    window.addEventListener('focus', comeBack);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', comeBack);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [invalidateBlendableSchema]);

  return useCallback(() => {
    armed.current = true;
  }, []);
}
