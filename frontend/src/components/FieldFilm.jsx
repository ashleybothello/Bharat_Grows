import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Replace this file to swap the cinematic hero: frontend/public/videos/bharatgrow-hero.mp4 */
export const HERO_VIDEO = '/videos/bharatgrow-hero.mp4';
export const HERO_POSTER = '/farm_hero.png';

export default function FieldFilm({
  className = '',
  src = HERO_VIDEO,
  poster = HERO_POSTER,
  preload = 'metadata',
}) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || failed) return undefined;

    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;

    const play = () => {
      el.muted = true;
      el.playbackRate = 0.92;
      return el.play().catch(() => {});
    };

    el.addEventListener('loadeddata', play);
    el.addEventListener('canplay', play);
    play();

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) play();
      else el.pause();
    }, { threshold: 0.12 });

    io.observe(el.parentElement || el);
    return () => {
      el.removeEventListener('loadeddata', play);
      el.removeEventListener('canplay', play);
      io.disconnect();
    };
  }, [reduce, failed, src]);

  if (reduce || failed) {
    return <div className={`${className} is-still`} aria-hidden="true" />;
  }

  return (
    <div className={className}>
      <video
        ref={ref}
        className="mkt-hero-video"
        autoPlay
        muted
        loop
        playsInline
        preload={preload}
        poster={poster}
        disablePictureInPicture
        aria-hidden="true"
        onError={() => setFailed(true)}
      >
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
}
