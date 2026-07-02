import { cn } from "@/lib/utils";

interface ScoreMeterProps {
  /** scores collected so far, each 0-10 */
  scores: number[];
  /** total questions in the interview, default 10 */
  total?: number;
  className?: string;
}

// Interpolate between blue (#3B82F6) and green (#22C55E)
function getGradientColor(index: number, total: number) {
  if (total <= 1) return "rgb(59, 130, 246)";
  const ratio = index / (total - 1);
  const r = Math.round(59 + ratio * (34 - 59));
  const g = Math.round(130 + ratio * (197 - 130));
  const b = Math.round(246 + ratio * (94 - 246));
  return `rgb(${r}, ${g}, ${b})`;
}

export function ScoreMeter({ scores, total = 10, className }: ScoreMeterProps) {
  const cells = Array.from({ length: total }, (_, i) => scores[i]);

  return (
    <div className={cn("flex w-full gap-1.5", className)}>
      {cells.map((score, i) => {
        const isAnswered = score !== undefined;
        const color = isAnswered ? getGradientColor(i, total) : undefined;

        return (
          <div
            key={i}
            className={cn(
              "h-2.5 flex-1 rounded-full transition-all duration-300",
              !isAnswered && "bg-surface-3 border border-border/40"
            )}
            style={isAnswered ? { backgroundColor: color } : undefined}
            title={
              score === undefined
                ? `Question ${i + 1}: not yet answered`
                : `Question ${i + 1}: ${score}/10`
            }
          />
        );
      })}
    </div>
  );
}
