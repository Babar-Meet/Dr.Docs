import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
} from "lucide-react";

export default function FileTypeIcon({ extension }) {
  if ([".jpg", ".jpeg", ".png"].includes(extension)) {
    return <FileImage className="h-8 w-8 text-muted" />;
  }
  if (extension === ".xlsx") {
    return <FileSpreadsheet className="h-8 w-8 text-muted" />;
  }
  if (extension === ".zip") {
    return <FileArchive className="h-8 w-8 text-muted" />;
  }
  return <FileText className="h-8 w-8 text-muted" />;
}
