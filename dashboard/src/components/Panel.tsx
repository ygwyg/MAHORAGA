import clsx from "clsx";
import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  title?: string;
  titleRight?: string | ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function Panel({ children, title, titleRight, className, noPadding = false }: PanelProps) {
  return (
    <div className={clsx("hud-panel flex flex-col", className)}>
      {(title || titleRight) && (
        <div className="flex justify-between items-center px-4 py-2 border-b border-hud-line shrink-0">
          {title && <span className="hud-label">{title}</span>}
          {titleRight &&
            (typeof titleRight === "string" ? <span className="hud-value-sm">{titleRight}</span> : titleRight)}
        </div>
      )}
      <div className={clsx("flex-1 min-h-0", noPadding ? "" : "p-3")}>{children}</div>
    </div>
  );
}
