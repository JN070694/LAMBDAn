interface LogoProps { size?: number; }

// The Λ and n are drawn as fixed vector shapes (outlines of DejaVu Serif Bold,
// the same letterforms as the desktop icon) instead of <text>, so the logo
// looks identical on every computer regardless of which serif fonts are installed.
export default function Logo({ size = 38 }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" aria-label="LAMBDAn logo">
      <rect x="50" y="50" width="200" height="200" rx="32" fill="var(--white)" stroke="var(--black)" strokeWidth="7"/>
      <clipPath id="logo-clip">
        <rect x="57" y="57" width="186" height="186" rx="26"/>
      </clipPath>
      <g clipPath="url(#logo-clip)">
        <path d="M94.17 209.59H112.42V222H66.89V209.59H79.4L137.03 68.91H161.54L219.27 209.59H233.83V222H162.15V209.59H177.12L135.9 107.36Z" fill="var(--black)"/>
      </g>
      <path d="M198.12 105V101.34H202.69V76.48H198.12V72.82H213.41V77.36Q215.34 74.48 217.83 73.21Q220.31 71.94 224.09 71.94Q229.51 71.94 232.28 75.14Q235.05 78.33 235.05 84.54V101.34H239.65V105H220.43V101.34H224.34V84.23Q224.34 80.15 223.29 78.56Q222.25 76.97 219.67 76.97Q216.43 76.97 214.92 79.34Q213.41 81.72 213.41 86.9V101.34H217.34V105Z" fill="var(--black)"/>
    </svg>
  );
}
