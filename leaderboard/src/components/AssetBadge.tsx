import clsx from "clsx";

interface AssetBadgeProps {
  assetClass: "stocks" | "crypto" | "both";
}

const config = {
  stocks: { label: "STOCKS", color: "text-hud-cyan border-hud-cyan/30" },
  crypto: { label: "CRYPTO", color: "text-hud-purple border-hud-purple/30" },
  both: { label: "BOTH", color: "text-hud-primary border-hud-primary/30" },
};

export function AssetBadge({ assetClass }: AssetBadgeProps) {
  const { label, color } = config[assetClass] || config.stocks;

  return (
    <span
      className={clsx(
        "inline-block text-[9px] tracking-[0.15em] uppercase border px-[6px] py-[2px]",
        color
      )}
    >
      {label}
    </span>
  );
}
