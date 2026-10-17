const BASE_CLASS =
  "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px]";

const VARIANT_CLASS = {
  success: "border-success/30 bg-successBg text-successText",
  warning: "border-warning/30 bg-warningBg text-warningText",
  error: "border-error/30 bg-errorBg text-errorText",
};

const DEFAULT_VARIANT_CLASS = "border-borderDark bg-panel text-muted";

export default function StatusChip({ variant, children }) {
  const variantClass = VARIANT_CLASS[variant] || DEFAULT_VARIANT_CLASS;
  return <span className={`${BASE_CLASS} ${variantClass}`}>{children}</span>;
}
