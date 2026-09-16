export const ease = [0.16, 1, 0.3, 1];

export function fadeUp(reduce, delay = 0) {
  if (reduce) return {};
  return {
    initial: { opacity: 0, y: 28, filter: 'blur(12px)' },
    whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
    viewport: { once: true, amount: 0.22 },
    transition: { duration: 0.84, delay, ease },
  };
}

export function heroReveal(reduce, delay = 0) {
  if (reduce) return {};
  return {
    initial: { opacity: 0, y: 24, filter: 'blur(14px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: 0.92, delay, ease },
  };
}

export function scrollToId(id, reduce = false) {
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
}
