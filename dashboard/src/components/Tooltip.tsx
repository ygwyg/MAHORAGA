import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, type RefObject, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipCoords {
  top: number;
  left: number;
}

interface UseTooltipOptions {
  position?: TooltipPosition;
  delay?: number;
}

interface UseTooltipReturn<T extends HTMLElement> {
  triggerRef: RefObject<T | null>;
  triggerProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  tooltipProps: {
    isVisible: boolean;
    coords: TooltipCoords;
    position: TooltipPosition;
  };
}

export function useTooltip<T extends HTMLElement = HTMLElement>(options: UseTooltipOptions = {}): UseTooltipReturn<T> {
  const { position = "top", delay = 200 } = options;
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords>({ top: 0, left: 0 });
  const triggerRef = useRef<T>(null);
  const timeoutRef = useRef<number | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const padding = 8;

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = rect.top + scrollY - padding;
        left = rect.left + scrollX + rect.width / 2;
        break;
      case "bottom":
        top = rect.bottom + scrollY + padding;
        left = rect.left + scrollX + rect.width / 2;
        break;
      case "left":
        top = rect.top + scrollY + rect.height / 2;
        left = rect.left + scrollX - padding;
        break;
      case "right":
        top = rect.top + scrollY + rect.height / 2;
        left = rect.right + scrollX + padding;
        break;
    }

    setCoords({ top, left });
  }, [position]);

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = window.setTimeout(() => {
      calculatePosition();
      setIsVisible(true);
    }, delay);
  }, [calculatePosition, delay]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  return {
    triggerRef,
    triggerProps: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
    tooltipProps: {
      isVisible,
      coords,
      position,
    },
  };
}

interface TooltipPortalProps {
  isVisible: boolean;
  coords: TooltipCoords;
  position: TooltipPosition;
  content: ReactNode;
  className?: string;
}

function getTransformOrigin(position: TooltipPosition) {
  switch (position) {
    case "top":
      return "bottom center";
    case "bottom":
      return "top center";
    case "left":
      return "center right";
    case "right":
      return "center left";
  }
}

function getTransform(position: TooltipPosition) {
  switch (position) {
    case "top":
      return "translateX(-50%) translateY(-100%)";
    case "bottom":
      return "translateX(-50%)";
    case "left":
      return "translateY(-50%) translateX(-100%)";
    case "right":
      return "translateY(-50%)";
  }
}

export function TooltipPortal({ isVisible, coords, position, content, className = "" }: TooltipPortalProps) {
  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          style={{
            position: "absolute",
            top: coords.top,
            left: coords.left,
            transform: getTransform(position),
            transformOrigin: getTransformOrigin(position),
            zIndex: 9999,
          }}
          className={`
            bg-hud-bg-panel border border-hud-line
            px-3 py-2 text-xs text-hud-text
            max-w-xs pointer-events-none
            ${className}
          `}
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: TooltipPosition;
  delay?: number;
  className?: string;
}

export function Tooltip({ children, content, position = "top", delay = 200, className = "" }: TooltipProps) {
  const { triggerRef, triggerProps, tooltipProps } = useTooltip<HTMLDivElement>({ position, delay });

  return (
    <>
      <div ref={triggerRef} {...triggerProps} className="inline-block">
        {children}
      </div>
      <TooltipPortal {...tooltipProps} content={content} className={className} />
    </>
  );
}

interface TooltipContentProps {
  title?: string;
  items?: Array<{ label: string; value: string | number; color?: string }>;
  description?: string;
}

export function TooltipContent({ title, items, description }: TooltipContentProps) {
  return (
    <div className="space-y-2">
      {title && <div className="hud-label text-hud-primary border-b border-hud-line/50 pb-1">{title}</div>}

      {items && items.length > 0 && (
        <div className="space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span className="text-hud-text-dim">{item.label}</span>
              <span className={item.color || "text-hud-text-bright"}>{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {description && <p className="text-hud-text-dim text-[10px] leading-tight">{description}</p>}
    </div>
  );
}
