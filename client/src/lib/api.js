export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function buildEndpoint(pathname) {
  return API_BASE ? `${API_BASE}${pathname}` : pathname;
}

export async function submitProcess({
  operation,
  files,
  targetFormat = "",
  pageRanges = "",
  rotationAngle = "90",
  pages = "all",
  password = "",
  rotations = "",
}) {
  const formData = new FormData();
  formData.append("operation", operation);

  if (operation === "convert" || operation === "merge") {
    formData.append("targetFormat", targetFormat);
  }

  if (operation === "split" && pageRanges.trim()) {
    formData.append("pageRanges", pageRanges.trim());
  }

  if (operation === "rotate") {
    formData.append("rotationAngle", String(rotationAngle));
    formData.append("pages", pages.trim() || "all");
    if (rotations.trim()) {
      formData.append("rotations", rotations.trim());
    }
  }

  if (operation === "protect") {
    formData.append("password", password);
  }

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(buildEndpoint("/process"), {
    method: "POST",
    body: formData,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return { ok: response.ok && payload.status !== "failed", payload };
}
