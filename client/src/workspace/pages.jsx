import VideoPreview from "./video-preview";
import { useState, useEffect, useRef } from "react";
import {
  Download,
  ExternalLink,
  Upload,
  Image,
  CheckCircle2,
  Clock3,
  ArrowRight,
} from "lucide-react";
import {
  request,
  upload,
  mediaUrl,
  networks,
  labels,
  dateLabel,
  timeLabel,
  exportCsv,
  dayKey,
} from "./api";
import { Network, Avatar, Status, Empty } from "./primitives";
const portals = {
  instagram: "https://developers.facebook.com/apps/",
  facebook: "https://developers.facebook.com/apps/",
  linkedin: "https://www.linkedin.com/developers/apps/266161292/products",
  youtube:
    "https://console.cloud.google.com/apis/dashboard?project=scheduly-508008",
  tiktok: "https://developers.tiktok.com/apps/",
};
export function Accounts({ data, clientId, onRefresh, pendingConnection, onConnectionFinalized }) {
  const [selectedClient, setSelectedClient] = useState(
    clientId || data.clients[0]?.id || "",
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [destination, setDestination] = useState(null),
    [assetId, setAssetId] = useState("");
  const [consent, setConsent] = useState(false);
  const [selectedConnectionAccounts, setSelectedConnectionAccounts] = useState([]);
  const admin = data.team?.role === "admin";
  const selectedAsset = data.media.find(
    (a) => a.id === assetId && a.client_id === destination?.client_id,
  );
  useEffect(() => {
    setSelectedConnectionAccounts(
      pendingConnection ? pendingConnection.accounts.map((account) => account.id) : [],
    );
  }, [pendingConnection]);
  async function connect(provider = "tiktok") {
    setBusy(true);
    setMessage("");
    try {
      const result = await request(`${provider}/start`, {
        clientId: selectedClient,
      });
      const target = new URL(result.url);
      const expected = {
        tiktok: "https://www.tiktok.com",
        meta: "https://www.facebook.com",
        youtube: "https://accounts.google.com",
      }[provider];
      if (target.origin !== expected)
        throw new Error("Unexpected connection destination.");
      window.location.assign(target.href);
    } catch (e) {
      setMessage(e.message);
      setBusy(false);
    }
  }
  async function finaliseConnection() {
    if (!pendingConnection) return;
    const accountIds = selectedConnectionAccounts;
    setBusy(true);
    setMessage("");
    try {
      const result = await request(`${pendingConnection.provider}/finalize`, {
        sessionId: pendingConnection.sessionId,
        accountIds,
      });
      setMessage(`${result.connected.length} account${result.connected.length === 1 ? "" : "s"} connected.`);
      onConnectionFinalized();
      await onRefresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function sendDraft() {
    setBusy(true);
    setMessage("");
    try {
      const result = await request("tiktok/upload", {
        accountId: destination.id,
        mediaId: assetId,
        confirmDraft: consent,
      });
      setMessage(`${result.status}: ${result.message}`);
      await onRefresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="info-note">
        <CheckCircle2 size={20} />
        <span>
          <b>Your clients and their channels</b>
          <p>
            TikTok videos are sent as drafts. The account owner finishes editing
            and posting in their TikTok inbox.
          </p>
        </span>
      </div>
      {admin && (
        <div className="media-toolbar">
          <label>
            Connect for client{" "}
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              disabled={busy}
            >
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" disabled={busy || !selectedClient} onClick={() => connect("tiktok")}>{busy ? "Working…" : "Connect TikTok"}</button>
          <button className="button" disabled={busy || !selectedClient} onClick={() => connect("meta")}>Connect Meta</button>
          <button className="button" disabled={busy || !selectedClient} onClick={() => connect("youtube")}>Connect YouTube</button>
        </div>
      )}
      {message && (
        <div className="info-note" role="status">
          {message}
        </div>
      )}
      {pendingConnection && (
        <section className="info-note" aria-label={`Choose ${pendingConnection.provider} accounts`}>
          <div>
            <h2>Choose accounts for {data.clients.find((client) => client.id === pendingConnection.clientId)?.name}</h2>
            <p>Only the accounts you select will be connected. Access credentials remain private to Scheduly.</p>
            {pendingConnection.accounts.map((account) => (
              <p key={account.id}>
                <label>
                  <input type="checkbox" checked={selectedConnectionAccounts.includes(account.id)} disabled={busy} onChange={(event) => setSelectedConnectionAccounts((selected) => event.target.checked ? [...selected, account.id] : selected.filter((id) => id !== account.id))} /> {account.name} · {networks[account.network]}
                </label>
              </p>
            ))}
            <button className="button primary" disabled={busy} onClick={finaliseConnection}>{busy ? "Connecting…" : "Connect selected accounts"}</button>
            <button className="button" disabled={busy} onClick={onConnectionFinalized}>Cancel</button>
          </div>
        </section>
      )}
      <div className="account-table">
        {data.accounts
          .filter((a) => !clientId || a.client_id === clientId)
          .map((a) => (
            <div className="account-row" key={a.id}>
              <Avatar client={data.clients.find((c) => c.id === a.client_id)} />
              <span>
                <b>{a.name}</b>
                <small>
                  {networks[a.network]} ·{" "}
                  {data.clients.find((c) => c.id === a.client_id)?.name}
                </small>
              </span>
              <Network network={a.network} />
              <span className="connection-state">
                {a.connection === "connected" ? "Connected" : "Not connected"}
              </span>
              {admin &&
              a.network === "tiktok" &&
              a.connection === "connected" ? (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    setDestination(a);
                    setAssetId("");
                    setConsent(false);
                    setMessage("");
                  }}
                >
                  Upload a draft
                </button>
              ) : (
                <a
                  className="button"
                  href={portals[a.network]}
                  target="_blank"
                  rel="noreferrer"
                >
                  Developer setup <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
      </div>
      {!data.accounts.length && (
        <p>
          No social accounts connected yet. An Admin can connect TikTok above.
        </p>
      )}
      {destination && (
        <section className="info-note" aria-label="Review TikTok draft upload">
          <div>
            <h2>Upload a draft to {destination.name}</h2>
            <p>
              Client:{" "}
              {data.clients.find((c) => c.id === destination.client_id)?.name}.
              This transfers the original video. Finish your caption, edits and
              posting in TikTok.
            </p>
            <label>
              Video{" "}
              <select
                value={assetId}
                disabled={busy}
                onChange={(e) => {
                  setAssetId(e.target.value);
                  setConsent(false);
                }}
              >
                <option value="">Choose an MP4</option>
                {data.media
                  .filter(
                    (a) =>
                      a.client_id === destination.client_id &&
                      a.mime === "video/mp4",
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            {selectedAsset && (
              <>
                <p>{selectedAsset.name}</p>
                <video
                  controls
                  preload="metadata"
                  src={selectedAsset.url || undefined}
                  style={{ maxWidth: "100%", maxHeight: 280 }}
                />
                <p>
                  <label>
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={busy}
                      onChange={(e) => setConsent(e.target.checked)}
                    />{" "}
                    I have permission to send this video to {destination.name}.
                    I understand it must be finished in TikTok.
                  </label>
                </p>
              </>
            )}
            <button
              className="button primary"
              disabled={busy || !selectedAsset || !consent}
              onClick={sendDraft}
            >
              {busy ? "Working…" : "Send draft / check status"}
            </button>{" "}
            <button
              className="button"
              disabled={busy}
              onClick={() => setDestination(null)}
            >
              Close
            </button>
          </div>
        </section>
      )}
    </>
  );
}
export function Media({ data, clientId, onRefresh }) {
  const [chosen, setChosen] = useState(clientId || data.clients[0]?.id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const assets = data.media.filter(
    (a) => !clientId || a.client_id === clientId,
  );
  async function add(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await upload(file, chosen);
      await onRefresh("Original uploaded.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="media-toolbar" hidden={data.team?.role === "viewer"}>
        <label>
          Upload to
          <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {data.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`button primary ${busy ? "disabled" : ""}`}>
          <Upload size={16} />
          {busy ? "Uploading…" : "Upload original"}
          <input
            hidden
            disabled={busy}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            onChange={(e) => {
              add(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {assets.length ? (
        <div className="media-grid">
          {assets.map((a) => (
            <article key={a.id}>
              {a.mime.startsWith("image") ? (
                <img src={mediaUrl(a.id)} alt={a.name} />
              ) : (
                <VideoPreview src={mediaUrl(a.id)} controls />
              )}
              <b>{a.name}</b>
              <small>
                {data.clients.find((c) => c.id === a.client_id)?.name} ·{" "}
                {(a.size / 1_000_000).toFixed(1)} MB
              </small>
              <a href={mediaUrl(a.id)} target="_blank" rel="noreferrer">
                View original <ExternalLink size={12} />
              </a>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="Give your ideas a home">
          Upload original images or MP4 videos. Assets stay with their client
          and can be reused in the composer.
        </Empty>
      )}
    </>
  );
}
export function Analytics({ posts, data, clientId, accountIds = [] }) {
  const [from, setFrom] = useState(
      dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12)),
    ),
    [to, setTo] = useState(
      dayKey(
        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 12),
      ),
    );
  const scoped = posts.filter(
      (p) =>
        p.scheduled_at &&
        dayKey(p.scheduled_at) >= from &&
        dayKey(p.scheduled_at) <= to,
    ),
    total = scoped.length;
  function download() {
    exportCsv(
      [
        [
          "Report type",
          "Client",
          "Title",
          "Status",
          "Selected destinations",
          "Planned time UTC",
          "Revision",
        ],
        ...scoped.map((p) => [
          "Local rehearsal planning",
          data.clients.find((c) => c.id === p.client_id)?.name,
          p.title,
          labels[p.status],
          p.account_ids
            .filter((id) => !accountIds.length || accountIds.includes(id))
            .map((id) => {
              const a = data.accounts.find((item) => item.id === id);
              return `${a?.name} (${networks[a?.network]})`;
            })
            .join("; "),
          p.scheduled_at,
          p.revision,
        ]),
      ],
      `scheduly-planning-${from}-${to}.csv`,
    );
  }
  return (
    <>
      <div className="report-toolbar">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button onClick={download} disabled={from > to}>
          <Download size={16} />
          Export planning report
        </button>
      </div>
      {from > to ? (
        <div className="error">
          The end date must be on or after the start date.
        </div>
      ) : (
        <>
          <div className="report-stats">
            {[
              ["Content planned", total],
              [
                "Awaiting approval",
                scoped.filter((p) => p.status === "in_review").length,
              ],
              [
                "Approved",
                scoped.filter((p) => p.status === "approved").length,
              ],
              [
                "Scheduled in rehearsal",
                scoped.filter((p) => p.status === "scheduled").length,
              ],
            ].map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <strong>{value}</strong>
                <small>Planning activity · selected date range</small>
              </div>
            ))}
          </div>
          <div className="analytics-columns">
            <section>
              <h2>Content by client</h2>
              <p className="field-note">
                Planned posts, not social performance
              </p>
              {data.clients
                .filter((c) => !clientId || c.id === clientId)
                .map((c) => {
                  const count = scoped.filter(
                    (p) => p.client_id === c.id,
                  ).length;
                  return (
                    <div className="bar-row" key={c.id}>
                      <Avatar client={c} small />
                      <span>{c.name}</span>
                      <div className="bar-track">
                        <div
                          style={{
                            width: `${total ? (count / total) * 100 : 0}%`,
                            background: c.colour,
                          }}
                        />
                      </div>
                      <strong>{count}</strong>
                    </div>
                  );
                })}
            </section>
            <section>
              <h2>Social performance</h2>
              <div className="metric-empty">
                <Image size={28} strokeWidth={1.2} />
                <h3>Your results belong here</h3>
                <p>
                  Reach, impressions, engagement and video views will appear
                  after authorised channels supply verified measurements.
                </p>
                <span>
                  Data source: not connected · Last synced: unavailable
                </span>
              </div>
            </section>
          </div>
          <section className="report-table">
            <h2>Channel coverage</h2>
            <div className="list-head">
              <span>Network</span>
              <span>Planned posts</span>
              <span>Impressions</span>
              <span>Engagements</span>
            </div>
            {Object.entries(networks).map(([id, name]) => (
              <div className="list-row" key={id}>
                <span className="inline">
                  <Network network={id} />
                  {name}
                </span>
                <span>
                  {
                    scoped.filter((p) =>
                      p.account_ids.some(
                        (a) =>
                          (!accountIds.length || accountIds.includes(a)) &&
                          data.accounts.find((x) => x.id === a)?.network === id,
                      ),
                    ).length
                  }
                </span>
                <span className="muted">Unavailable</span>
                <span className="muted">Unavailable</span>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
export function Detail({ post, data, onClose, onEdit, onRefresh }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(type) {
    setBusy(true);
    setError("");
    try {
      await request(`posts/${post.id}/action`, {
        action: type,
        revision: post.revision,
      });
      await onRefresh(
        type === "schedule"
          ? "Scheduled in the local rehearsal. No live publishing."
          : "Post updated.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const client = data.clients.find((c) => c.id === post.client_id);
  const role = data.team?.role;
  const canReview = !role || ["admin", "editor"].includes(role);
  const canEdit =
    role !== "viewer" &&
    (role !== "content_creator" ||
      (post.created_by === data.user.id && post.status === "draft"));
  return (
    <dialog
      ref={dialog}
      aria-labelledby="post-heading"
      className="detail-backdrop"
      onCancel={onClose}
      onClick={onClose}
    >
      <section className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <span>Post review</span>
          <button onClick={onClose} autoFocus>
            Close
          </button>
        </header>
        <div className="detail-body">
          <Status status={post.status} />
          <h1 id="post-heading">{post.title}</h1>
          <div className="inline">
            <Avatar client={client} />
            <span>
              <b>{client?.name}</b>
              <small>
                Revision {post.revision} · {dateLabel(post.scheduled_at)}{" "}
                {post.scheduled_at && timeLabel(post.scheduled_at)} SAST
              </small>
            </span>
          </div>
          {post.media.map((id, index) => {
            const asset = data.media.find((item) => item.id === id);
            return (
              <figure key={id} className="review-asset">
                {asset?.mime?.startsWith("video/") ? (
                  <VideoPreview
                    className="detail-image"
                    src={mediaUrl(id)}
                    controls
                    preload="metadata"
                  />
                ) : (
                  <img
                    className="detail-image"
                    src={mediaUrl(id)}
                    alt={asset?.name || `Attachment ${index + 1}`}
                  />
                )}
                <figcaption>
                  {index + 1} of {post.media.length} ·{" "}
                  {asset?.name || "Attachment"}
                </figcaption>
              </figure>
            );
          })}
          <h3>Shared copy</h3>
          <p className="post-copy">{post.caption || "No copy yet."}</p>
          <h3>Destination versions</h3>
          {post.account_ids.map((id) => {
            const a = data.accounts.find((x) => x.id === id);
            return (
              <div className="destination-review" key={id}>
                <div className="inline">
                  <Network network={a?.network} />
                  <b>{a?.name}</b>
                  <span>{networks[a?.network]}</span>
                </div>
                <p>{post.variants[id] ?? post.caption}</p>
              </div>
            );
          })}
          <h3>Delivery activity</h3>
          {data.deliveries.filter((d) => d.post_id === post.id).length ? (
            data.deliveries
              .filter((d) => d.post_id === post.id)
              .map((d) => (
                <div className="activity-item" key={d.id}>
                  <Clock3 size={16} />
                  <span>
                    <b>
                      {
                        networks[
                          data.accounts.find((a) => a.id === d.account_id)
                            ?.network
                        ]
                      }{" "}
                      · {d.state.replaceAll("_", " ")}
                    </b>
                    <small>
                      {d.last_error ||
                        "Local rehearsal job. No live provider call."}
                    </small>
                  </span>
                </div>
              ))
          ) : (
            <p className="field-note">No delivery job has been created.</p>
          )}
          <h3>Revision history</h3>
          {data.events
            .filter((e) => e.post_id === post.id)
            .map((e) => (
              <div className="activity-item" key={e.id}>
                <CheckCircle2 size={15} />
                <span>
                  <b>{e.action}</b>
                  <small>
                    Revision {e.revision} · {dateLabel(e.created_at)}{" "}
                    {timeLabel(e.created_at)}
                  </small>
                </span>
              </div>
            ))}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
        </div>
        <footer className="detail-actions">
          <button
            disabled={
              busy ||
              !canEdit ||
              ["published", "cancelled"].includes(post.status)
            }
            onClick={() => onEdit(post)}
          >
            Edit content
          </button>
          {post.status === "draft" && canEdit && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => action("submit")}
            >
              Request approval
            </button>
          )}
          {post.status === "in_review" && canReview && (
            <>
              <button disabled={busy} onClick={() => action("reject")}>
                Request changes
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => action("approve")}
              >
                Approve revision <CheckCircle2 size={15} />
              </button>
            </>
          )}
          {post.status === "approved" && canReview && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => action("schedule")}
            >
              {data.mode === "local-rehearsal"
                ? "Schedule rehearsal"
                : "Check publishing readiness"}{" "}
              <ArrowRight size={15} />
            </button>
          )}
          {post.status === "scheduled" && canReview && (
            <button disabled={busy} onClick={() => action("cancel")}>
              Cancel schedule
            </button>
          )}
        </footer>
      </section>
    </dialog>
  );
}
export function Settings() {
  return (
    <div className="settings">
      <section>
        <h2>Workspace</h2>
        <dl>
          <dt>Name</dt>
          <dd>DarkMatter</dd>
          <dt>Default timezone</dt>
          <dd>Africa/Johannesburg · UTC+02:00</dd>
          <dt>Approval policy</dt>
          <dd>A manager approves each content revision before scheduling.</dd>
          <dt>Environment</dt>
          <dd>
            Local rehearsal, persisted in a dedicated local PostgreSQL database.
          </dd>
        </dl>
      </section>
      <section>
        <h2>Launch readiness</h2>
        <p>
          The hosted release needs team authentication, connected provider
          accounts, approved API access, live delivery verification and a
          rehearsed migration before client schedules can move here.
        </p>
        <p>
          Public publishing is disabled in this build. Developer applications
          are managed separately in the open portal tabs.
        </p>
      </section>
    </div>
  );
}
