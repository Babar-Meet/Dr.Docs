const BASE_CLASS =
  "w-full rounded-[5px] border border-borderStrong bg-deep px-3 py-2.5 font-body text-[14px] text-white outline-none transition placeholder:text-[#777777] hover:border-[#666666] focus:border-orange focus:ring-2 focus:ring-orange/20 disabled:cursor-not-allowed disabled:opacity-60";

export default function Select({
  value,
  onChange,
  disabled = false,
  className = "",
  children,
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className ? `${BASE_CLASS} ${className}` : BASE_CLASS}
    >
      {children}
    </select>
  );
}
