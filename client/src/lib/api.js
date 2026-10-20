import { appendOptionFields } from "./toolRules";

export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function buildEndpoint(pathname) {
  return API_BASE ? `${API_BASE}${pathname}` : pathname;
}

// Transport layer only: it serialises the prepared values that
// lib/toolRules.js shapes into the wire fields (additionally declared there),
// appends the selected files and normalises the response. Option names,
// defaults and per-operation field selection live in lib/toolRules.js.
export async function submitProcess({ operation, files, values }) {
  const formData = new FormData();
  formData.append("operation", operation);

  appendOptionFields(formData, { operation, values });

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
