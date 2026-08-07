import { cn } from "@/lib/utils";

/** Trust Lens mark — a bold minimal lens with an iris: "look closely
 *  before you trust." Renders in currentColor so it inherits theme tones. */
export function TrustLensMark({
  className,
  strokeWidth = 2.6,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-8", className)}
      aria-hidden="true"
      fill="none"
    >
      {/* lens housing */}
      <circle
        cx="32"
        cy="32"
        r="28.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      {/* aperture ring */}
      <circle cx="32" cy="32" r="19.5" stroke="currentColor" strokeWidth="1.4" />
      {/* four aperture blades */}
      {[0, 90, 180, 270].map((deg) => (
        <circle
          key={deg}
          cx="32"
          cy="32"
          r="12"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.55"
          strokeDasharray="13 76"
          transform={`rotate(${deg + 45} 32 32)`}
        />
      ))}
      {/* iris */}
      <circle cx="32" cy="32" r="8" stroke="currentColor" strokeWidth="1.2" />
      {/* pupil */}
      <circle cx="32" cy="32" r="3.8" fill="currentColor" />
      {/* glass highlight */}
      <circle cx="36.2" cy="27.8" r="1.4" fill="currentColor" opacity="0.85" />
    </svg>
  );
}
