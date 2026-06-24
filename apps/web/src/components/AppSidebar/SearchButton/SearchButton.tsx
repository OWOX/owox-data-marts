import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useProjectRoute } from '../../../shared/hooks';
import { getActiveMenuItemClassName, isSameOrNestedPath } from '../menu-item-active';

const KEYCAP_CLASS =
  'border-foreground/20 bg-foreground/10 text-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-sans text-xs';
const FOCUS_SEARCH_INPUT_EVENT = 'owox:focus-search-input';

function isMac(): boolean {
  return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest('.monaco-editor')) return true;
  return false;
}

export function SearchButton() {
  const { scope } = useProjectRoute();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const searchPath = scope('/search');
  const isActive = isSameOrNestedPath(pathname, searchPath);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      if (isEditableTarget(document.activeElement)) return;
      e.preventDefault();

      if (isActive) {
        window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_INPUT_EVENT));
        return;
      }

      void navigate(searchPath);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, navigate, searchPath]);

  return (
    <Link
      to={searchPath}
      aria-current={isActive ? 'page' : undefined}
      data-sidebar='menu-button'
      data-size='md'
      className={`group/search peer/menu-button ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-2 ${getActiveMenuItemClassName(isActive)}`}
    >
      <Search className='size-4 shrink-0' />

      <span className='truncate'>Search</span>

      <span className='ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/search:opacity-75 group-data-[collapsible=icon]:hidden'>
        <kbd className={KEYCAP_CLASS}>{isMac() ? '⌘' : 'Ctrl'}</kbd>
        <kbd className={KEYCAP_CLASS}>K</kbd>
      </span>
    </Link>
  );
}
