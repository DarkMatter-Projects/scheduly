import { persistComposer } from "./save-composer.mjs";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Upload,
  Check,
  Image,
  Info,
  X,
  Heart,
  MessageCircle,
  Send,
} from "lucide-react";
import { request, upload, networks, toInput, mediaUrl } from "./api";
import { Network, Avatar, Status } from "./primitives";
export default function Composer({
  post,
  data,
  onClose,
  onSaved,
  initialDate,
  defaultClient,
}) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [checkpoint, setCheckpoint] = useState(null);
  const [clientId, setClient] = useState(
    post?.client_id || defaultClient || data.clients[0]?.id || "",
  );
  const [title, setTitle] = useState(post?.title || "");
  const [caption, setCaption] = useState(post?.caption || "");
  const [ids, setIds] = useState(post?.account_ids || []);
  const [variants, setVariants] = useState(post?.variants || {});
  const [media, setMedia] = useState(post?.media || []);
  const [assets, setAssets] = useState(data.media);
  const [when, setWhen] = useState(
    toInput(post?.scheduled_at) || (initialDate ? `${initialDate}T09:30` : ""),
  );
  const [copyTab, setCopyTab] = useState("shared");
  const [previewId, setPreview] = useState(ids[0] || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [library, setLibrary] = useState(false);
  const [dirty, setDirty] = useState(false);
  const accounts = data.accounts.filter((a) => a.client_id === clientId),
    selected = accounts.filter((a) => ids.includes(a.id));
  const client = data.clients.find((c) => c.id === clientId),
    preview = selected.find((a) => a.id === previewId) || selected[0];
  const copy = copyTab === "shared" ? caption : (variants[copyTab] ?? caption);
  const previewCopy = preview ? (variants[preview.id] ?? caption) : caption;
  const readOnly = post && ["published", "cancelled"].includes(post.status);
  const change = (fn) => (v) => {
    setDirty(true);
    fn(v);
  };
  function toggle(id) {
    setDirty(true);
    setIds((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
    );
    if (ids.includes(id)) {
      setVariants((old) =>
        Object.fromEntries(Object.entries(old).filter(([key]) => key !== id)),
      );
      if (copyTab === id) setCopyTab("shared");
    }
  }
  async function save(submit) {
    setBusy(true);
    setError("");
    try {
      const payload = {
        clientId,
        title,
        caption,
        accountIds: ids,
        variants,
        media,
        scheduledAt: when ? new Date(`${when}:00+02:00`).toISOString() : null,
        timezone: "Africa/Johannesburg",
      };
      const fingerprint = JSON.stringify(payload);
      const current = await persistComposer({
        checkpoint,
        post,
        payload,
        fingerprint,
        submit,
        request,
        onCheckpoint: setCheckpoint,
      });
      setDirty(false);
      await onSaved(current.submitted ? "Sent for approval." : "Draft saved.");
    } catch (e) {
      setError(
        e.message +
          " Your changes are retained. Retry the save before leaving.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addFile(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const added = await upload(file, clientId);
      setAssets((old) => [
        ...old,
        { ...added, name: file.name, mime: file.type, client_id: clientId },
      ]);
      setMedia((old) => [...old, added.id]);
      setDirty(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (
      dirty &&
      !window.confirm("Leave this post and discard your unsaved changes?")
    )
      return;
    onClose();
  }
  return (
    <div className="composer">
      <div className="composer-main">
        <button className="text-button" onClick={close}>
          <ArrowLeft size={17} />
          Back to calendar
        </button>
        <h1>{post ? "Edit post" : "New post"}</h1>
        <p className="subtitle">
          One idea. The right version for every account.
        </p>
        {post && (
          <div className="revision">
            <Status status={post.status} />
            <span>Revision {post.revision}</span>
          </div>
        )}
        <fieldset disabled={busy || readOnly || !!checkpoint?.pending}>
          <label>
            Client
            <select
              value={clientId}
              disabled={!!post}
              onChange={(e) => {
                setClient(e.target.value);
                setIds([]);
                setVariants({});
                setMedia([]);
                setCopyTab("shared");
                setDirty(true);
              }}
            >
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>Choose accounts</label>
          <div className="account-choices">
            {accounts.map((a) => (
              <button
                type="button"
                className={ids.includes(a.id) ? "chosen" : ""}
                key={a.id}
                aria-pressed={ids.includes(a.id)}
                onClick={() => toggle(a.id)}
              >
                <Network network={a.network} />
                <span>
                  <b>{a.name}</b>
                  <small>{networks[a.network]}</small>
                </span>
                <span className="check-circle">
                  {ids.includes(a.id) && <Check size={12} />}
                </span>
              </button>
            ))}
          </div>
          <label>
            Internal title
            <input
              maxLength={140}
              value={title}
              onChange={(e) => change(setTitle)(e.target.value)}
              placeholder="Give this idea a name"
            />
          </label>
          <label>Content</label>
          <div className="copy-tabs">
            <button
              className={copyTab === "shared" ? "active" : ""}
              onClick={() => setCopyTab("shared")}
            >
              Shared copy
            </button>
            {selected.map((a) => (
              <button
                key={a.id}
                className={copyTab === a.id ? "active" : ""}
                onClick={() => setCopyTab(a.id)}
              >
                <Network network={a.network} />
                {networks[a.network]}
                {variants[a.id] !== undefined && <i />}
              </button>
            ))}
          </div>
          <textarea
            aria-label="Post copy"
            value={copy}
            maxLength={10000}
            onChange={(e) => {
              setDirty(true);
              copyTab === "shared"
                ? setCaption(e.target.value)
                : setVariants({ ...variants, [copyTab]: e.target.value });
            }}
            placeholder="What would you like to share?"
          />
          <div className="copy-helper">
            <span>
              {copyTab === "shared"
                ? "Used by every account unless customised."
                : "Custom copy for this destination."}
            </span>
            <span>{copy.length.toLocaleString()} characters</span>
          </div>
          {copyTab !== "shared" && variants[copyTab] !== undefined && (
            <button
              className="text-button"
              onClick={() => {
                setVariants(
                  Object.fromEntries(
                    Object.entries(variants).filter(([id]) => id !== copyTab),
                  ),
                );
                setDirty(true);
              }}
            >
              Use shared copy
            </button>
          )}
          <div className="section-label">
            <label>Media</label>
            <button
              className="text-button"
              onClick={() => setLibrary(!library)}
            >
              Choose from library
            </button>
          </div>
          <div className="media-choices">
            {media.map((id) => (
              <div className="media-choice" key={id}>
                {assets.find((a) => a.id === id)?.mime.startsWith("video") ? (
                  <video src={mediaUrl(id)} controls />
                ) : (
                  <img
                    src={mediaUrl(id)}
                    alt={
                      assets.find((a) => a.id === id)?.name || "Selected media"
                    }
                  />
                )}
                <button
                  aria-label={`Remove ${assets.find((a) => a.id === id)?.name || "media"}`}
                  onClick={() => {
                    setMedia(media.filter((x) => x !== id));
                    setDirty(true);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {media.length < 10 && (
              <label className="upload-box">
                <Upload size={22} />
                <b>{busy ? "Uploading…" : "Upload media"}</b>
                <small>Original files · up to 20 MB</small>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  onChange={(e) => {
                    addFile(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {library && (
            <div className="library-picker">
              {assets
                .filter(
                  (a) => a.client_id === clientId && !media.includes(a.id),
                )
                .map((a) => (
                  <button
                    key={a.id}
                    disabled={media.length >= 10}
                    onClick={() => {
                      setMedia([...media, a.id]);
                      setDirty(true);
                      setLibrary(false);
                    }}
                  >
                    {a.mime.startsWith("image") ? (
                      <img src={mediaUrl(a.id)} alt="" />
                    ) : (
                      <Image size={25} />
                    )}
                    <span>{a.name}</span>
                  </button>
                ))}
              {!assets.some(
                (a) => a.client_id === clientId && !media.includes(a.id),
              ) && (
                <p>No more media for this client. Upload an original above.</p>
              )}
            </div>
          )}
          <label>
            Proposed publication time
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => change(setWhen)(e.target.value)}
              onInput={(e) => change(setWhen)(e.currentTarget.value)}
            />
          </label>
          <p className="field-note">
            Africa/Johannesburg · UTC+02:00. A proposed time does not schedule
            an unapproved draft.
          </p>
        </fieldset>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <footer className="composer-actions">
          <button disabled={busy || readOnly} onClick={() => save(false)}>
            {busy ? "Saving…" : "Save draft"}
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              readOnly ||
              !title.trim() ||
              !caption.trim() ||
              !ids.length
            }
            onClick={() => save(true)}
          >
            Request approval <Send size={15} />
          </button>
        </footer>
      </div>
      <aside className="preview-panel">
        <div className="preview-heading">
          <h2>Preview</h2>
          <select
            aria-label="Preview account"
            value={preview?.id || ""}
            onChange={(e) => setPreview(e.target.value)}
          >
            {selected.length ? (
              selected.map((a) => (
                <option key={a.id} value={a.id}>
                  {networks[a.network]}
                </option>
              ))
            ) : (
              <option value="">Choose accounts</option>
            )}
          </select>
        </div>
        <p className="field-note">
          Layout guide. Final rendering varies by network.
        </p>
        <div className="selected-account">
          <Network network={preview?.network} />
          <span>
            <b>{client?.name}</b>
            <small>
              {preview ? networks[preview.network] : "Select a destination"}
            </small>
          </span>
        </div>
        <div className="social-preview">
          <header>
            <Avatar client={client} />
            <b>{client?.name}</b>
            <span>•••</span>
          </header>
          {media[0] ? (
            assets.find((a) => a.id === media[0])?.mime.startsWith("video") ? (
              <video controls src={mediaUrl(media[0])} />
            ) : (
              <img src={mediaUrl(media[0])} alt="Post preview" />
            )
          ) : (
            <div className="preview-empty">
              <Image size={32} strokeWidth={1} />
              <p>Your media appears here</p>
            </div>
          )}
          <div className="social-actions">
            <Heart size={20} />
            <MessageCircle size={20} />
            <Send size={20} />
          </div>
          <p>
            <b>{client?.name}</b> {previewCopy || "Your story starts here."}
          </p>
        </div>
        <div className="info-note">
          <Info size={18} />
          <span>
            <b>Approval stays with the content</b>
            <p>
              Editing a post creates a new revision and cancels its previous
              queued delivery. A manager reviews the new version before
              scheduling.
            </p>
          </span>
        </div>
        <div className="field-note">
          Local rehearsal · Nothing from this workspace is sent to social
          platforms.
        </div>
      </aside>
    </div>
  );
}
