import { useState } from 'react';
import { Image as ImageIcon, Film, Play } from 'lucide-react';
import clsx from 'clsx';

/**
 * Image / video thumbnail with graceful fallback.
 *
 *  - mimeType starts with `image/` (or omitted) → renders <img>
 *  - mimeType starts with `video/` → renders <video preload="metadata">
 *    so the browser loads enough to display the first frame as the poster,
 *    plus a play overlay so it's obviously a video
 *  - on any load failure or missing src → placeholder icon
 */
export default function Thumbnail({
  src,
  alt = '',
  mimeType,
  className = '',
  iconSize = 'w-4 h-4',
  placeholder,
}) {
  const [failed, setFailed] = useState(false);
  const isVideo = (mimeType || '').startsWith('video/');

  if (!src || failed) {
    return (
      <div className={clsx('flex items-center justify-center bg-slate-100', className)}>
        {placeholder || (
          isVideo
            ? <Film className={clsx(iconSize, 'text-slate-300')} />
            : <ImageIcon className={clsx(iconSize, 'text-slate-300')} />
        )}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={clsx('relative bg-slate-900', className)}>
        <video
          src={src}
          // preload=metadata pulls just enough bytes to render the first
          // frame — no autoplay, no audio, no actual playback until user
          // interacts. Cheaper than asking the server to generate posters.
          preload="metadata"
          muted
          playsInline
          className="w-full h-full object-cover pointer-events-none"
          onError={() => setFailed(true)}
        />
        {/* Bottom-right play badge — small enough for 40px tiles, still
            visible on full-size media library cards. Pointer-events off so
            clicks pass through to the parent. */}
        <div className="absolute bottom-0.5 right-0.5 pointer-events-none">
          <div className="rounded-full bg-black/65 backdrop-blur-sm w-4 h-4 flex items-center justify-center">
            <Play className="w-2 h-2 text-white fill-white ml-px" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
