interface Props {
  className?: string;
}

/** Vinted "V" logo mark — approximate brush-stroke style */
export default function VintedLogo({ className }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="
        M 20 14
        C 13 14 10 20 13 28
        L 41 82
        Q 44 90 50 90
        Q 56 90 59 82
        L 82 28
        C 85 20 82 14 76 14
        C 70 14 68 20 66 26
        L 50 68
        L 28 26
        C 26 20 26 14 20 14
        Z
      " />
    </svg>
  );
}
