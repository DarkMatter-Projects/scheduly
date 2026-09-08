import { useRef, useState } from "react";
export default function VideoPreview({ src, ...props }) {
  const [shown, setShown] = useState(src),
    [playing, setPlaying] = useState(false);
  const position = useRef(0);
  // Keep a playing element's source stable when background polling renews its URL.
  if (!playing && shown !== src) setShown(src);
  return (
    <video
      {...props}
      src={shown}
      onPlay={() => setPlaying(true)}
      onPause={(e) => {
        position.current = e.currentTarget.currentTime;
        setPlaying(false);
      }}
      onEnded={() => {
        position.current = 0;
        setPlaying(false);
      }}
      onLoadedMetadata={(e) => {
        if (position.current && Number.isFinite(e.currentTarget.duration))
          e.currentTarget.currentTime = Math.min(
            position.current,
            e.currentTarget.duration,
          );
      }}
    />
  );
}
