import React from 'react';

export interface IconProps {
  size?: number;
  className?: string;
}

const baseSvgProps = (size: number, className?: string): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className,
  'aria-hidden': true,
});

/**
 * 까치 (Kkachi) Brand Mark: a magpie holding an envelope in its beak.
 */
export const KkachiLogoIcon: React.FC<IconProps> = ({ size = 28, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <rect x="2" y="2" width="60" height="60" rx="15" fill="#6E9BFF" />
    <circle cx="43" cy="20" r="10" fill="#FFFFFF" fillOpacity="0.2" />
    {/* Tail */}
    <path d="M22 35 L9 50 L13 51 L26 38 Z" fill="#0F766E" />
    {/* Bird Body & Head */}
    <path
      d="M32 16 C35.5 16 38 18.5 38 22 C37.8 25 37 28 36 31 C35 35.5 32.5 40 28 41.5 C23.5 43 19.5 40 20 35.5 C20.5 31.5 23.5 27.5 26 24.5 C27 22 27.5 16 32 16 Z"
      fill="#0B1120"
    />
    {/* White Belly & Wing Patch */}
    <path
      d="M29.5 27.5 C33.5 28 35.5 32 34 36.2 C32.5 39.8 28 41.2 24.8 40 C22.8 39 22 37.5 22.8 35.2 C24 31.5 26.5 27 29.5 27.5 Z"
      fill="#FFFFFF"
    />
    <path
      d="M23.5 27.5 C26.2 25.5 29.8 26.2 30.2 28.8 C30.5 30.5 28.4 32 25.6 32.2 C23.4 32.4 21.8 30.5 23.5 27.5 Z"
      fill="#FFFFFF"
    />
    {/* Eye */}
    <circle cx="34.2" cy="20.4" r="1.4" fill="#FFFFFF" />
    <circle cx="34.5" cy="20.4" r="0.8" fill="#0F172A" />
    {/* Envelope in Beak */}
    <g transform="rotate(-11 40 23)">
      <rect x="40" y="18.5" width="16" height="10.5" rx="1.8" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="0.6" />
      <path d="M40.5 19.2 L48 25 L55.5 19.2" stroke="#94A3B8" strokeWidth="1.2" fill="none" />
      <circle cx="48" cy="24.5" r="1.8" fill="#EF4444" />
    </g>
    {/* Beak */}
    <path d="M36.8 20.6 L42.5 22.4 L36.6 23.2 Z" fill="#475569" />
  </svg>
);

export interface MascotSvgProps extends IconProps {
  holdingLetter: boolean;
}

/**
 * Transparent background-free desktop Kkachi magpie mascot.
 * Displays an empty-beaked resting magpie when no new emails exist,
 * or holding a wax-sealed letter when new/unread emails are present.
 */
export const KkachiMascotSvg: React.FC<MascotSvgProps> = ({
  size = 92,
  holdingLetter,
  className,
}) => {
  const uid = React.useId().replace(/:/g, '');
  const wingGradId = `wing-${uid}`;
  const tailGradId = `tail-${uid}`;
  const waxGradId = `wax-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={wingGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0F766E" />
          <stop offset="55%" stopColor="#1D4ED8" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
        <linearGradient id={tailGradId} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="55%" stopColor="#0F766E" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </linearGradient>
        <linearGradient id={waxGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F87171" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>
      </defs>

      {/* Branch Perch */}
      <path
        d="M 16 92 Q 52 80 86 86"
        stroke="#334155"
        strokeWidth="3.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 16 92 Q 52 80 86 86"
        stroke="#64748B"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
        fill="none"
      />

      {/* Long Graduated Tail */}
      <path
        d="M 40 68 L 11 100 C 9.5 101.8 11 104.5 13.8 103.8 L 26 97.5 L 48 74 Z"
        fill={`url(#${tailGradId})`}
        stroke="#1E293B"
        strokeWidth="1.1"
      />

      {/* Feet Gripping Branch */}
      <path
        d="M 49 79 L 47.5 87 M 47.5 87 L 44 88.8 M 47.5 87 L 49.5 89.5"
        stroke="#334155"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 57 79 L 58 86.5 M 58 86.5 L 55 88.5 M 58 86.5 L 61 88.5"
        stroke="#334155"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Smooth Head, Neck & Body */}
      <path
        d="M 58 26 C 66 26 71 32 71 40 C 70.5 46 69 52 67.5 58 C 65.5 68 61 79 52 83 C 42 87 32 82 31.5 72 C 31 63 37 53 43 45 C 45.5 42 46 36 47.5 32 C 49.5 27.5 53.5 26 58 26 Z"
        fill="#0F172A"
        stroke="#334155"
        strokeWidth="1.3"
      />

      {/* Subtle Crown Sheen */}
      <path
        d="M 50 30 C 55 27 63 28 66.5 32.5 C 62 30 55.5 30 50 30 Z"
        fill="#475569"
        opacity="0.65"
      />

      {/* White Belly */}
      <path
        d="M 54 54 C 62 55 66.5 63 63.5 72.5 C 60 81 50.5 84 43 81.5 C 39 80 37 76.5 38.5 72 C 41 63.5 47.5 53 54 54 Z"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="1"
      />

      {/* Iridescent Folded Wing */}
      <path
        d="M 37.5 56 C 43.5 49.5 54 49 57 56 C 59.5 62.5 53 73.5 42 78 C 36.5 80.5 32.5 76.5 33.5 70 C 34.5 65 35 59 37.5 56 Z"
        fill={`url(#${wingGradId})`}
      />

      {/* White Scapular Wing Patch */}
      <path
        d="M 41 55.5 C 46.5 51.5 53.8 53 55 58 C 55.5 61.2 51.2 64.2 45.8 64.8 C 41.2 65.2 37.6 61.5 41 55.5 Z"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="0.9"
      />

      {/* Expressive Eye */}
      <circle cx="62.8" cy="36" r="2.6" fill="#FFFFFF" />
      <circle cx="63.3" cy="36" r="1.6" fill="#0F172A" />
      <circle cx="64" cy="35.3" r="0.65" fill="#FFFFFF" />

      {holdingLetter ? (
        <>
          {/* Lower Beak Behind Envelope */}
          <path d="M 69.5 40.5 L 81.5 44 L 68.5 43.8 Z" fill="#334155" />

          {/* Wax-Sealed White Letter Held in Beak */}
          <g transform="rotate(-10 78 41)">
            <rect
              x="76"
              y="30.5"
              width="35"
              height="23.5"
              rx="3"
              fill="#FFFFFF"
              stroke="#94A3B8"
              strokeWidth="1.4"
            />
            <path
              d="M 77.5 52.5 L 89.5 43 M 109.5 52.5 L 97.5 43"
              stroke="#CBD5E1"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <path
              d="M 77 31.5 L 93.5 44.5 L 110 31.5"
              fill="#F8FAFC"
              stroke="#94A3B8"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <circle cx="93.5" cy="43.8" r="3.6" fill={`url(#${waxGradId})`} />
            <circle
              cx="93.5"
              cy="43.8"
              r="2.2"
              fill="none"
              stroke="#FECACA"
              strokeWidth="0.7"
              opacity="0.8"
            />
          </g>

          {/* Upper Beak Gripping Envelope */}
          <path
            d="M 69 36.2 C 75 36.6 81 38.6 84 40.5 C 80 41.4 74.5 41.4 68.8 40.5 Z"
            fill="#475569"
            stroke="#334155"
            strokeWidth="0.6"
          />
        </>
      ) : (
        <>
          {/* Resting Closed Beak (No Letter) */}
          <path
            d="M 69 36.4 C 75 36.8 81 38.8 84 40.8 C 79.8 42.4 74.2 42.6 68.6 41.6 Z"
            fill="#475569"
            stroke="#334155"
            strokeWidth="0.8"
          />
          <path d="M 69.5 39.6 L 82.8 40.8" stroke="#1E293B" strokeWidth="0.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
};

export const InboxIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

export const MailIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export const MailOpenIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" />
    <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
  </svg>
);

export const ReplyIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
);

export const SendIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

export const EditIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const BellIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

export const VolumeOnIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

export const VolumeOffIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="22" y1="9" x2="16" y2="15" />
    <line x1="16" y1="9" x2="22" y2="15" />
  </svg>
);

export const TranslateIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="m5 8 6 6" />
    <path d="m4 14 6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2h1" />
    <path d="m22 22-5-10-5 10" />
    <path d="M14 18h6" />
  </svg>
);

export const GlobeIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const CheckDoubleIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M18 6 7 17l-5-5" />
    <path d="m22 10-7.5 7.5L13 16" />
  </svg>
);

export const AlertCircleIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const PaperclipIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const ServerIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

export const SunIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

export const MoonIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export const SplitLayoutIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);

export const StackLayoutIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);

export const PanelRightOpenIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <path d="m8 9 3 3-3 3" />
  </svg>
);

export const PanelRightCloseIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <path d="m10 9-3 3 3 3" />
  </svg>
);

export const PrinterIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

export const FilePdfIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseSvgProps(size, className)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M12 18v-6" />
    <path d="m9.5 15.5 2.5 2.5 2.5-2.5" />
  </svg>
);
