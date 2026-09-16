import { Leaf } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';

const LEAVES = [
  { left: '6%', delay: '0s', dur: '18s', size: 18, drift: 28 },
  { left: '18%', delay: '3.2s', dur: '22s', size: 14, drift: -22 },
  { left: '31%', delay: '7s', dur: '16s', size: 22, drift: 36 },
  { left: '44%', delay: '1.4s', dur: '20s', size: 16, drift: -18 },
  { left: '57%', delay: '5.5s', dur: '24s', size: 20, drift: 24 },
  { left: '69%', delay: '9s', dur: '17s', size: 13, drift: -30 },
  { left: '78%', delay: '2.1s', dur: '21s', size: 19, drift: 16 },
  { left: '88%', delay: '11s', dur: '19s', size: 15, drift: -26 },
  { left: '12%', delay: '13s', dur: '23s', size: 11, drift: 20 },
  { left: '92%', delay: '6.4s', dur: '15s', size: 17, drift: -14 },
];

export default function Greenery() {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div className="lp-hero-greenery" aria-hidden="true">
      <div className="lp-hero-glow" />
      {LEAVES.map((leaf, i) => (
        <span
          key={i}
          className="lp-leaf"
          style={{
            left: leaf.left,
            animationDelay: leaf.delay,
            animationDuration: leaf.dur,
            '--lp-leaf-x': `${leaf.drift}px`,
            width: leaf.size,
            height: leaf.size,
          }}
        >
          <Leaf size={leaf.size} strokeWidth={1.7} />
        </span>
      ))}
    </div>
  );
}
