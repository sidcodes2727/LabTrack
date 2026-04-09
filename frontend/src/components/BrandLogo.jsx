export default function BrandLogo({ compact = false, showTagline = false, light = false, className = '' }) {
  const wordLabTone = light ? 'text-white' : 'text-[#1f1318]';
  const wordTrackTone = light ? 'text-[#ffc9d3]' : 'text-[#9d2235]';
  const ruleTone = light ? 'border-white/40' : 'border-[#d8a14a]';
  const taglineTone = light ? 'text-white/80' : 'text-[#6d4b53]';

  return (
    <div className={`leading-none ${className}`}>
      <p className={`${compact ? 'text-2xl' : 'text-[56px]'} font-sans font-extrabold tracking-[-0.02em]`}>
          <span className={wordLabTone}>Lab</span>
          <span className={wordTrackTone}>Track</span>
      </p>

      {showTagline && (
        <div className="mt-1">
          <div className={`mb-1 border-t ${ruleTone}`} />
          <p className={`text-[10px] uppercase tracking-[0.25em] ${taglineTone}`}>Campus Lab Asset Management</p>
        </div>
      )}
    </div>
  );
}
