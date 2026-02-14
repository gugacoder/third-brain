import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: "ok" | "warning" | "error" | "idle";
  label: string;
};

const colors: Record<StatusBadgeProps["status"], string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  idle: "bg-neutral-400",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={cn("h-2 w-2 rounded-full", colors[status])} />
      {label}
    </span>
  );
}
