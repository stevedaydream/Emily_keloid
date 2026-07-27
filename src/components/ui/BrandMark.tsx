export default function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" className="fill-brand-700" />
      <rect x="17" y="9" width="6" height="22" rx="2" fill="white" />
      <rect x="9" y="17" width="22" height="6" rx="2" fill="white" />
      <path d="M27 27 Q36 24 33.5 33.5 Q24 36 27 27 Z" className="fill-accent-400" />
    </svg>
  );
}
