/**
 * One bar per day, labels thinned to a handful — a 90-day range printed one
 * label per bar produced ~90 overlapping dates that read as a grey smear.
 */
function pickTicks(labels: string[], count: number): string[] {
  if (labels.length <= count) return labels;
  const step = (labels.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => labels[Math.round(i * step)] ?? "");
}

export function BarSparkline({
  values,
  labels,
  height = 48,
  color = "bg-black",
  ariaLabel,
  showTicks = true,
}: {
  values: number[];
  labels: string[];
  height?: number;
  color?: string;
  ariaLabel: string;
  showTicks?: boolean;
}) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="flex items-end gap-px" style={{ height }} role="img" aria-label={ariaLabel}>
        {values.map((value, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${color} transition-all`}
            style={{
              height: `${Math.max((value / max) * height, 2)}px`,
              opacity: value > 0 ? 1 : 0.15,
            }}
            title={`${labels[i] ?? ""}: ${value}`}
          />
        ))}
      </div>
      {showTicks && (
        <div className="mt-1 flex justify-between text-[10px] text-gray-400">
          {pickTicks(labels, 5).map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function formatClicksPerView(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
