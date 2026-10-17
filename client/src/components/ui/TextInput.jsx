const BASE_CLASS =
  "w-full rounded-[5px] border border-borderStrong bg-deep px-3 py-2.5 font-body text-[14px] text-content outline-none transition placeholder:text-[#777777] hover:border-[#666666] focus:border-orange focus:ring-2 focus:ring-orange/20";

export default function TextInput({
  value,
  onChange,
  placeholder,
  className = "",
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className ? `${BASE_CLASS} ${className}` : BASE_CLASS}
    />
  );
}
