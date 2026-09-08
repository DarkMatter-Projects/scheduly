import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { dayKey, labels, dateLabel, timeLabel, networks } from "./api";
import { PostCard, Empty, Avatar, Status, Network } from "./primitives";
export function PostList({ posts, data, onOpen }) {
  if (!posts.length)
    return (
      <Empty title="A little room for your next idea">
        No posts match these filters.
      </Empty>
    );
  return (
    <div className="post-list">
      <div className="list-head">
        <span>Content</span>
        <span>Accounts</span>
        <span>Planned for · SAST</span>
        <span>Status</span>
      </div>
      {posts.map((p) => (
        <button className="list-row" key={p.id} onClick={() => onOpen(p)}>
          <span className="list-title">
            <Avatar client={data.clients.find((c) => c.id === p.client_id)} />
            <span>
              <b>{p.title}</b>
              <small>
                {data.clients.find((c) => c.id === p.client_id)?.name} ·
                Revision {p.revision}
              </small>
            </span>
          </span>
          <span className="network-stack">
            {p.account_ids.map((id) => (
              <Network
                key={id}
                network={data.accounts.find((a) => a.id === id)?.network}
              />
            ))}
          </span>
          <span>
            {dateLabel(p.scheduled_at)}
            <small>{p.scheduled_at && timeLabel(p.scheduled_at)}</small>
          </span>
          <Status status={p.status} />
        </button>
      ))}
    </div>
  );
}
export default function Calendar({
  posts,
  data,
  onOpen,
  onNew,
  view,
  setView,
  anchor,
  setAnchor,
}) {
  const year = anchor.getFullYear(),
    month = anchor.getMonth();
  const first = new Date(year, month, 1, 12);
  const monthStart = new Date(year, month, 1 - ((first.getDay() + 6) % 7), 12);
  const weekStart = new Date(
    year,
    month,
    anchor.getDate() - ((anchor.getDay() + 6) % 7),
    12,
  );
  const start = view === "week" ? weekStart : monthStart;
  const count =
    view === "week"
      ? 7
      : Math.ceil(
          (((first.getDay() + 6) % 7) +
            new Date(year, month + 1, 0).getDate()) /
            7,
        ) * 7;
  const dates = Array.from(
    { length: count },
    (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12),
  );
  const shift = (step) =>
    setAnchor(
      view === "week"
        ? new Date(year, month, anchor.getDate() + step * 7, 12)
        : new Date(year, month + step, 1, 12),
    );
  const dated = posts.filter(
    (p) =>
      p.scheduled_at &&
      dayKey(p.scheduled_at) >= dayKey(dates[0]) &&
      dayKey(p.scheduled_at) <= dayKey(dates.at(-1)),
  );
  return (
    <>
      <div className="calendar-toolbar">
        <div className="period">
          <button
            className="icon-button"
            aria-label="Previous period"
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>
            {view === "week"
              ? `${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}`
              : anchor.toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                })}
          </h2>
          <button
            className="icon-button"
            aria-label="Next period"
            onClick={() => shift(1)}
          >
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setAnchor(new Date())}>Today</button>
        </div>
        <div className="segmented">
          {["month", "week", "list"].map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              className={view === v ? "selected" : ""}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {view === "list" ? (
        <PostList posts={dated} data={data} onOpen={onOpen} />
      ) : (
        <div className={`calendar-grid ${view}`}>
          <div className="weekdays">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="days">
            {dates.map((date) => (
              <section
                className={`day ${date.getMonth() !== month ? "outside" : ""} ${dayKey(date) === dayKey(new Date()) ? "today" : ""}`}
                key={dayKey(date)}
              >
                <header>
                  <span>{date.getDate()}</span>
                  <button
                    aria-label={`New post on ${dayKey(date)}`}
                    onClick={() => onNew(dayKey(date))}
                  >
                    <Plus size={14} />
                  </button>
                </header>
                {posts
                  .filter(
                    (p) =>
                      p.scheduled_at && dayKey(p.scheduled_at) === dayKey(date),
                  )
                  .map((p) => (
                    <PostCard key={p.id} post={p} data={data} onOpen={onOpen} />
                  ))}
              </section>
            ))}
          </div>
        </div>
      )}
      <div className="calendar-footer">
        <span>Africa/Johannesburg · UTC+02:00</span>
        <span>
          {dated.length} posts in this view ·{" "}
          {posts.filter((p) => !p.scheduled_at).length} unscheduled drafts
        </span>
      </div>
    </>
  );
}
export function AttentionRail({ posts, data, onOpen, onPage }) {
  const next = posts
    .filter(
      (p) =>
        p.scheduled_at &&
        new Date(p.scheduled_at) > new Date() &&
        p.status !== "cancelled",
    )
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
  return (
    <aside className="attention-rail">
      <section>
        <h2>At a glance</h2>
        <p>Across your selected accounts</p>
        <div className="attention-counts">
          {["scheduled", "in_review", "needs_attention"].map((s) => (
            <button
              key={s}
              onClick={() =>
                onPage(s === "in_review" ? "Approvals" : "Content", s)
              }
            >
              <i className={`dot ${s}`} />
              <strong>{posts.filter((p) => p.status === s).length}</strong>
              <span>{labels[s]}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Next in the plan</h2>
        {next ? (
          <>
            <p>
              {dateLabel(next.scheduled_at)} · {timeLabel(next.scheduled_at)}
            </p>
            <PostCard post={next} data={data} onOpen={onOpen} />
          </>
        ) : (
          <p>No upcoming content in this view.</p>
        )}
      </section>
      <section>
        <h2>Account readiness</h2>
        <p>Connect channels to enable live delivery.</p>
        {Object.entries(networks).map(([id, name]) => (
          <div className="health-row" key={id}>
            <Network network={id} />
            <span>{name}</span>
            <small>Setup needed</small>
          </div>
        ))}
        <button className="text-button" onClick={() => onPage("Accounts")}>
          Manage connections <ChevronRight size={15} />
        </button>
      </section>
      <div className="rail-note">
        A clear plan.
        <br />A calmer publishing day.
      </div>
    </aside>
  );
}
