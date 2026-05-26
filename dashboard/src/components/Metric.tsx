import clsx from "clsx";

interface MetricProps {
  label: string;
  value: string | number;
  size?: "sm" | "md" | "lg" | "xl";
  color?: "default" | "success" | "warning" | "error";
  className?: string;
}

const sizeClasses = {
  sm: "hud-value-sm",
  md: "hud-value-md",
  lg: "hud-value-lg",
  xl: "hud-value-xl",
};

const colorClasses = {
  default: "",
  success: "text-hud-success",
  warning: "text-hud-warning",
  error: "text-hud-error",
};

export function Metric({ label, value, size = "lg", color = "default", className }: MetricProps) {
  return (
    <div className={clsx("flex flex-col", className)}>
      <span className="hud-label mb-1">{label}</span>
      <span className={clsx(sizeClasses[size], colorClasses[color])}>{value}</span>
    </div>
  );
}

interface MetricInlineProps {
  label: string;
  value: string | number;
  color?: "default" | "success" | "warning" | "error";
  valueClassName?: string;
  className?: string;
}

export function MetricInline({ label, value, color = "default", valueClassName, className }: MetricInlineProps) {
  return (
    <div className={clsx("flex items-baseline gap-2", className)}>
      <span className="hud-label">{label}</span>
      <span className={clsx("hud-value-sm", valueClassName || colorClasses[color])}>{value}</span>
    </div>
  );
}
