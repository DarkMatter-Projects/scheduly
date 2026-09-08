// Record each completed write before refreshing the workspace so retries resume safely.
export async function persistComposer({
  checkpoint,
  post,
  payload,
  fingerprint,
  submit,
  request,
  onCheckpoint,
}) {
  let current = checkpoint;
  if (!current || current.fingerprint !== fingerprint) {
    const identity = current?.saved || post;
    const requestId =
      current?.pending?.fingerprint === fingerprint
        ? current.pending.requestId
        : crypto.randomUUID();
    current = { ...current, pending: { requestId, fingerprint } };
    onCheckpoint(current);
    const saved = await request(`posts${identity ? `/${identity.id}` : ""}`, {
      ...payload,
      requestId,
      revision: identity?.revision,
    });
    current = { saved, fingerprint, submitted: false };
    onCheckpoint(current);
  }
  if (submit && !current.submitted) {
    await request(`posts/${current.saved.id}/action`, {
      action: "submit",
      revision: current.saved.revision,
    });
    current = { ...current, submitted: true };
    onCheckpoint(current);
  }
  return current;
}
