export function ClarvexIcon({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CLARVEX"
    >
      <defs>
        <linearGradient id="clarvex-icon-grad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="26" fill="url(#clarvex-icon-grad)" />
      {/* Stylized C arc — center at (22, 28), radius 9 */}
      <path
        d="M 31 19 A 9 9 0 1 0 31 37"
        stroke="white"
        strokeWidth="3.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Checkmark integrated at the bottom end of C */}
      <polyline
        points="27,33 31,37 37,29"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
