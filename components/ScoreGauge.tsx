import { BAND_LABEL, healthBand } from "@/lib/site-issues";

const BAND_STROKE = {
  good: "var(--color-gauge-good)",
  fair: "var(--color-gauge-mid)",
  weak: "var(--color-gauge-bad)",
};

/**
 * Ring gauge for a 0-100 website score. The colour follows the band (weak,
 * fair, good) but the number and band name are always written out, so the
 * colour is never the only signal. score null draws an empty ring with a dash.
 */
export function ScoreGauge({ score, size = 112, label = "Website health" }: { score: number | null; size?: number; label?: string }) {
  const stroke = size >= 80 ? 10 : 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const band = score !== null ? healthBand(score) : null;
  const offset = score !== null ? circumference * (1 - score / 100) : circumference;
  const large = size >= 80;

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score !== null ? `${label}: ${score} out of 100, ${BAND_LABEL[band!].toLowerCase()}` : `${label}: not scored`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        {score !== null && score > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={BAND_STROKE[band!]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none" aria-hidden="true">
        <span className={`${large ? "text-3xl" : "text-[11px]"} font-bold text-ink tabular-nums`}>{score ?? "–"}</span>
        {large && <span className="mt-1 text-xs font-medium text-muted">{band ? BAND_LABEL[band] : "Not scored"}</span>}
      </span>
    </div>
  );
}
