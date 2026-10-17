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
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={
        "cursor-pointer rounded-[6px] border-2 border-dashed p-8 text-center transition " +
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
        className={"mx-auto h-10 w-10 " + (dragActive ? "text-orange" : "text-muted")}
      />
      <p className="mx-auto mt-4 max-w-[28ch] font-display text-[15px] font-bold leading-tight text-white">
        {singlePdfHint
          ? "Drop one PDF file, or click to upload"
          : "Drag and drop file(s), or click to upload"}
      </p>
      <p className="mt-2 font-body text-[13px] text-muted">
        Supported: PDF, DOCX, PPTX, XLSX, JPG, PNG, ZIP (max 50MB each)
      </p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-borderDark bg-panel px-3 py-1 font-mono text-[11px] text-muted">
        Click to browse - Batch up to 200 files
      </p>
    </section>
  );
}
