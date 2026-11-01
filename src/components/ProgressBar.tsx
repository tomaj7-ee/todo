import type { Progress } from "@/types";

export function ProgressBar({ progress, label }: { progress: Progress; label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="progress">
      <div
        className="h-2 flex-1 overflow-hidden rounded bg-zinc-200"
        role="progressbar"
        aria-label={label ?? "진행률"}
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-emerald-500" style={{ width: `${progress.percent}%` }} />
      </div>
      <span className="whitespace-nowrap tabular-nums">
        {progress.done}/{progress.total} ({progress.percent}%)
      </span>
    </div>
  );
}
