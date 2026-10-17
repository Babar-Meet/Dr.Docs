export default function DropZone({
  multiple,
  accept,
  dragActive,
  fileInputRef,
  onPickFiles,
  onDragOver,
  onDragLeave,
  onDrop,
  singlePdfHint,
}) {
  const formats = accept
    ? accept
        .split(",")
        .map((entry) => entry.replace(".", "").trim().toUpperCase())
        .filter(Boolean)
        .join(", ")
    : null;
  const formatsLine = formats
    ? `Supported: ${formats} (max 50MB each)`
    : "Any supported file type, 50MB each";

  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={
        "cursor-pointer rounded-[6px] border-2 border-dashed px-8 py-14 text-center transition " +
        (dragActive
          ? "border-orange bg-elevated"
          : "border-borderStrong bg-panel hover:border-[#666666] hover:bg-elevated")
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        accept={accept || undefined}
        className="hidden"
        onChange={(event) => onPickFiles(event.target.files)}
      />
      <button
        type="button"
        tabIndex={0}
        className="mx-auto inline-flex items-center gap-2 rounded-[5px] bg-orange px-6 py-3 font-display text-[15px] font-bold leading-none text-black transition shadow-sm hover:bg-orangeSoft active:bg-orangeDark"
      >
        {singlePdfHint ? "Select PDF file" : "Select files"}
      </button>
      <p className="mt-3 font-body text-[14px] text-offWhite">or drop file(s) here</p>
      <p className="mt-3 font-body text-[13px] text-muted">
        {multiple ? `${formatsLine}, batch up to 200 files` : formatsLine}
      </p>
    </section>
  );
}
