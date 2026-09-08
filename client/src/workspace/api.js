import { supabase } from "./auth-client";
const apiBase = import.meta.env.VITE_WORKSPACE_API_URL || "/workspace-api";
export async function request(path, body) {
  const authHeaders = {};
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to continue.");
    authHeaders.Authorization = `Bearer ${session.access_token}`;
    authHeaders.apikey =
      import.meta.env.VITE_WORKSPACE_SUPABASE_PUBLISHABLE_KEY;
  }
  const response = await fetch(
    `${apiBase}/${path}`,
    body === undefined
      ? { headers: authHeaders }
      : {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
            ...(!supabase ? { "X-Scheduly-Local": "rehearsal" } : {}),
          },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
export async function upload(file, clientId) {
  if (file.size > 20_000_000) throw new Error("Choose a file under 20 MB.");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return request("media", { name: file.name, mime: file.type, data, clientId });
}
export const mediaUrl = (id) => `/workspace-api/media/${id}`;
export const labels = {
  draft: "Draft",
  in_review: "Needs approval",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  needs_attention: "Needs attention",
  cancelled: "Cancelled",
};
export const networks = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
};
export function dayKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function timeLabel(date) {
  return date
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Johannesburg",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(date))
    : "Unscheduled";
}
export function dateLabel(date) {
  return date
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Johannesburg",
        day: "numeric",
        month: "short",
      }).format(new Date(date))
    : "Unscheduled";
}
export function toInput(date) {
  return date ? `${dayKey(date)}T${timeLabel(date)}` : "";
}
export function exportCsv(rows, name) {
  const safe = (v) => {
    const s = String(v ?? "");
    return (
      '"' + (/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"'
    );
  };
  const data = rows.map((row) => row.map(safe).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + data], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to begin reading the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
