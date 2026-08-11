import { useState } from 'react';
import { Database } from 'lucide-react';

interface RawBase64IconProps {
  className?: string;
  size?: number;
  base64?: string | null;
}

/**
 * The only value shape this component will put in `src`: a base64 `data:` URI with an
 * image MIME type — exactly what the connectors build emits when it inlines a connector's
 * `logo.svg`/`.png`/`.jpg` (see `packages/connectors/vite.config.js`), and what the custom
 * connector create endpoint is expected to be given.
 *
 * A connector logo is an editor-authored string that is stored verbatim and rendered on
 * every surface that lists connectors, so a viewer who never opens the connector still
 * loads it. There is no CSP on the app, so a remote URL here would turn each of those
 * surfaces into a request to the author's host — an external beacon collecting viewers'
 * IP, user agent and timing. Restricting the scheme to `data:` removes the network
 * entirely; requiring an `image/` MIME type and a base64 payload keeps what is left to
 * the shape the component is named for. (This is not an XSS guard: React escapes the
 * attribute, and `<img>` neither executes `javascript:` URLs nor runs script inside an
 * SVG it loads.)
 *
 * The payload after `;base64,` is only required to be non-empty, not checked against the
 * base64 alphabet: it never reaches the network whatever it contains, and an undecodable
 * one already degrades to the same fallback via `onError`. Validating it would only reject
 * legitimate values (line-wrapped payloads, the base64url alphabet) for no gain.
 */
const SAFE_IMAGE_DATA_URI = /^data:image\/[a-z0-9.+-]+;base64,[\s\S]+$/i;

export const RawBase64Icon = ({ className = '', size = 24, base64 }: RawBase64IconProps) => {
  const [errored, setErrored] = useState(false);
  // Validate and render the same trimmed string, so surrounding whitespace can neither
  // defeat the check nor survive into `src`.
  const src = base64?.trim() ?? '';
  const hasImage = SAFE_IMAGE_DATA_URI.test(src) && !errored;

  if (!hasImage) {
    return (
      <Database
        className={`text-muted-foreground ${className}`}
        size={size}
        strokeWidth={1.5}
        aria-label='icon'
      />
    );
  }

  return (
    <img
      src={src}
      alt='icon'
      className={`max-w-none ${className}`}
      style={{ width: size, height: size }}
      onError={() => {
        setErrored(true);
      }}
    />
  );
};
