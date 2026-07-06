/**
 * Original identity mark for this (independent) study — a rising event-study
 * curve with a node, echoing the study's own signature chart. Deliberately NOT
 * QFEX's logo: this project is unaffiliated, a study *about* QFEX's listings.
 */
export function IndexMark({ size = 20, color = "var(--gold)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 18.5 L7 13.5 L11 15.5 L15 9 L21.5 3.5"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21.5" cy="3.5" r="2.1" fill={color} />
    </svg>
  );
}
