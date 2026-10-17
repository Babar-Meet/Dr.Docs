import { UploadCloud } from "lucide-react";

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
          : "border-borderStrong bg-deep hover:border-[#666666] hover:bg-panel")
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
      <UploadCloud
        className={"mx-auto h-14 w-14 " + (dragActive ? "text-orange" : "text-muted")}
      />
      <p className="mx-auto mt-5 max-w-[32ch] font-display text-[17px] font-bold leading-tight text-white">
        {singlePdfHint
          ? "Drop one PDF file, or click to upload"
          : "Drag and drop file(s), or click to upload"}
      </p>
      <p className="mt-3 font-body text-[13px] text-muted">
        {multiple ? `${formatsLine}, batch up to 200 files` : formatsLine}
      </p>
    </section>
  );
}
