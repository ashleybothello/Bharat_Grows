import { Leaf } from 'lucide-react';

export default function BrandMark({
  size = 'md',
  inverse = false,
  showIcon = true,
  className = '',
}) {
  return (
    <span className={`brand-mark brand-${size}${inverse ? ' is-inverse' : ''}${className ? ` ${className}` : ''}`}>
      {showIcon && <Leaf className="brand-icon" strokeWidth={2.2} aria-hidden />}
      <span className="brand-bharat" lang="hi">भारत</span>
      <span className="brand-grows">Grows</span>
    </span>
  );
}
