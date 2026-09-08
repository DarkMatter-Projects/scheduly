export class Fault extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function requireRole(role, allowed) {
  if (!allowed.includes(role))
    throw new Fault(403, "Your role cannot perform this action.");
}
export function validatePost(input, accounts) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const caption = typeof input.caption === "string" ? input.caption : "";
  if (!title || title.length > 140)
    throw new Fault(422, "Add a title of 1–140 characters.");
  if (caption.length > 10000)
    throw new Fault(422, "Shared copy must be under 10,000 characters.");
  if (
    !Array.isArray(input.accountIds) ||
    input.accountIds.length > 20 ||
    new Set(input.accountIds).size !== input.accountIds.length
  )
    throw new Fault(422, "Choose distinct destination accounts.");
  if (
    input.accountIds.some(
      (id) =>
        !accounts.some((a) => a.id === id && a.client_id === input.clientId),
    )
  )
    throw new Fault(422, "Every account must belong to the selected client.");
  const variants = input.variants ?? {};
  if (
    typeof variants !== "object" ||
    Array.isArray(variants) ||
    Object.entries(variants).some(
      ([id, v]) =>
        !input.accountIds.includes(id) ||
        typeof v !== "string" ||
        v.length > 10000,
    )
  )
    throw new Fault(422, "Destination copy is invalid.");
  if (
    !Array.isArray(input.media) ||
    input.media.length > 10 ||
    input.media.some((id) => typeof id !== "string")
  )
    throw new Fault(422, "Choose up to 10 media assets.");
  if (input.timezone !== "Africa/Johannesburg")
    throw new Fault(422, "This pilot uses Africa/Johannesburg time.");
  const when = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (when && !Number.isFinite(when.getTime()))
    throw new Fault(422, "Choose a valid date and time.");
  return {
    title,
    caption,
    variants,
    accountIds: input.accountIds,
    media: input.media,
    scheduledAt: when?.toISOString() ?? null,
    timezone: input.timezone,
  };
}
export function checkAction(post, action, role, now = new Date()) {
  if (["published", "cancelled"].includes(post.status))
    throw new Fault(409, "This post is read-only.");
  if (action === "submit") {
    requireRole(role, ["manager", "reviewer", "creator", "editor"]);
    if (!["draft", "approved"].includes(post.status))
      throw new Fault(409, "Only a draft can be sent for review.");
    if (!post.account_ids.length || !post.caption.trim())
      throw new Fault(
        422,
        "Add an account and copy before requesting approval.",
      );
    return "in_review";
  }
  requireRole(role, ["manager", "reviewer"]);
  if (action === "approve" || action === "reject") {
    if (post.status !== "in_review")
      throw new Fault(409, "This revision is no longer awaiting review.");
    return action === "approve" ? "approved" : "draft";
  }
  if (action === "schedule") {
    if (post.status !== "approved" || post.approved_revision !== post.revision)
      throw new Fault(409, "Approve the current revision before scheduling.");
    if (!post.account_ids.length)
      throw new Fault(422, "Choose at least one account.");
    if (!post.scheduled_at || new Date(post.scheduled_at) <= now)
      throw new Fault(422, "Choose a future publication time.");
    return "scheduled";
  }
  if (action === "cancel") return "cancelled";
  throw new Fault(422, "Unknown action.");
}
