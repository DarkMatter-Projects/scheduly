import Team from "./team";
import { supabase } from "./auth-client";
import { createElement, useEffect, useState } from "react";
import {
  CalendarDays,
  Layers,
  CheckCircle2,
  Image,
  ChartNoAxesCombined,
  Users,
  Settings as SettingsIcon,
  ChevronRight,
  Search,
  SlidersHorizontal,
  RefreshCw,
  Menu,
  X,
} from "lucide-react";
import { request, labels, networks } from "./api";
import { AddButton, Avatar, Empty } from "./primitives";
import Calendar, { AttentionRail, PostList } from "./calendar";
import Composer from "./composer";
import { Accounts, Media, Analytics, Detail } from "./pages";
const nav = [
  ["Calendar", CalendarDays],
  ["Content", Layers],
  ["Approvals", CheckCircle2],
  ["Media library", Image],
  ["Analytics", ChartNoAxesCombined],
  ["Accounts", Users],
  ["Settings", SettingsIcon],
];
const descriptions = {
  Calendar: "Plan every account. See the whole picture.",
  Content: "Every idea, from first draft to final delivery.",
  Approvals: "Give the right version the green light.",
  "Media library": "Original assets. Ready for their next story.",
  Analytics: "Understand the plan. Measure what actually happened.",
  Accounts: "The right channels, connected to the right clients.",
  Settings: "A workspace built around your team.",
};
export default function App() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState("Calendar"),
    [client, setClient] = useState(""),
    [accountIds, setAccountIds] = useState([]),
    [status, setStatus] = useState(""),
    [query, setQuery] = useState(""),
    [view, setView] = useState("month"),
    [anchor, setAnchor] = useState(new Date()),
    [composer, setComposer] = useState(null),
    [detailId, setDetail] = useState(null),
    [toast, setToast] = useState(""),
    [mobileNav, setMobileNav] = useState(false);
  async function refresh(message) {
    try {
      const next = await request("snapshot");
      setData(next);
      setError("");
      if (message) setToast(message);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }
  useEffect(() => {
    let active = true;
    const load = () =>
      request("snapshot")
        .then((next) => {
          if (active) {
            setData(next);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const listener = (e) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const newPost = (date) => {
    if (data.team?.role === "viewer") {
      setToast("Your Viewer role is read-only.");
      return;
    }
    if (!data.clients.length) {
      setToast(
        "Your account has no assigned clients yet. Ask your workspace administrator for access.",
      );
      return;
    }
    setComposer(date ? { date } : {});
  };
  const go = (name, s = "") => {
    setPage(name);
    setQuery("");
    setStatus(s);
    setMobileNav(false);
  };
  if (!data)
    return (
      <div className="loading">
        <h1>scheduly</h1>
        <p>{error || "Opening your workspace…"}</p>
        {error && (
          <>
            <button onClick={() => refresh().catch(() => {})}>
              Check access again
            </button>
            {supabase && (
              <button
                onClick={async () => {
                  const { error } = await supabase.auth.signOut({
                    scope: "local",
                  });
                  if (error) setError(error.message);
                }}
              >
                Sign out
              </button>
            )}
          </>
        )}
      </div>
    );
  const filtered = data.posts
    .filter(
      (p) =>
        (!client || p.client_id === client) &&
        (!accountIds.length ||
          p.account_ids.some((id) => accountIds.includes(id))) &&
        (!status || p.status === status) &&
        (!query ||
          `${p.title} ${p.caption}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort(
      (a, b) =>
        new Date(a.scheduled_at || "2099-01-01") -
        new Date(b.scheduled_at || "2099-01-01"),
    );
  const accounts = data.accounts.filter(
      (a) => !client || a.client_id === client,
    ),
    detail = data.posts.find((p) => p.id === detailId);
  return (
    <div className="workspace">
      <button
        className="mobile-menu"
        aria-label="Toggle navigation"
        onClick={() => setMobileNav(!mobileNav)}
      >
        {mobileNav ? <X /> : <Menu />}
      </button>
      <nav
        className={`sidebar ${mobileNav ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="wordmark">scheduly</div>
        <div className="workspace-label">Workspace</div>
        <div className="workspace-name">
          <span className="workspace-avatar">D</span>DarkMatter
          <ChevronRight size={15} />
        </div>
        <div className="navigation">
          {nav.map(([name, Icon], i) => (
            <button
              key={name}
              className={`${page === name && !composer ? "active" : ""} ${i === 5 ? "nav-divider" : ""}`}
              onClick={() => {
                if (composer) {
                  if (
                    !window.confirm(
                      "Leave the composer? Unsaved changes will be lost.",
                    )
                  )
                    return;
                  setComposer(null);
                }
                go(name);
              }}
            >
              {createElement(Icon, { size: 18, strokeWidth: 1.6 })}
              {name}
              {name === "Approvals" && (
                <span className="nav-count">
                  {data.posts.filter((p) => p.status === "in_review").length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="preview-user">
            <span className="workspace-avatar">DM</span>
            <span>
              {data.user.name}
              <small>
                {data.mode === "local-rehearsal"
                  ? "Local rehearsal workspace"
                  : "Hosted workspace"}
              </small>
            </span>
          </div>
          {supabase && (
            <button
              onClick={() =>
                supabase.auth
                  .signOut()
                  .catch(() => setToast("Could not sign out. Please retry."))
              }
            >
              Sign out
            </button>
          )}
          <p>
            A clearer plan.
            <br />
            More room to create.
          </p>
        </div>
      </nav>
      <div className="workspace-body">
        <div className="rehearsal-bar">
          <span>
            <i />
            {data.mode === "local-rehearsal"
              ? "Local rehearsal · Sample clients · Live publishing disabled"
              : "Hosted preview · Live publishing disabled"}
          </span>
          <button
            onClick={() => refresh("Workspace refreshed.").catch(() => {})}
            aria-label="Refresh workspace"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        {composer ? (
          <Composer
            key={composer.post?.id || composer.date || "new"}
            post={composer.post}
            initialDate={composer.date}
            defaultClient={client}
            data={data}
            onClose={() => setComposer(null)}
            onSaved={async (message) => {
              await refresh(message);
              setComposer(null);
            }}
          />
        ) : (
          <div
            className={`page-layout ${page === "Calendar" ? "with-rail" : ""}`}
          >
            <main className="main-content">
              <header className="page-header">
                <div>
                  <h1>{page}</h1>
                  <p>{descriptions[page]}</p>
                </div>
                <AddButton onClick={() => newPost()} />
              </header>
              {!["Settings"].includes(page) && (
                <div className="filters">
                  <select
                    aria-label="Filter by client"
                    value={client}
                    onChange={(e) => {
                      setClient(e.target.value);
                      setAccountIds([]);
                    }}
                  >
                    <option value="">All clients</option>
                    {data.clients.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="client-avatars">
                    {data.clients.map((c) => (
                      <button
                        key={c.id}
                        aria-label={`Filter ${c.name}`}
                        onClick={() => {
                          setClient(client === c.id ? "" : c.id);
                          setAccountIds([]);
                        }}
                        className={client === c.id ? "selected" : ""}
                      >
                        <Avatar client={c} />
                      </button>
                    ))}
                  </div>
                  {["Calendar", "Content", "Approvals", "Analytics"].includes(
                    page,
                  ) && (
                    <details className="account-filter">
                      <summary>
                        {accountIds.length
                          ? `${accountIds.length} accounts`
                          : "All accounts"}
                        <SlidersHorizontal size={14} />
                      </summary>
                      <div className="filter-popover">
                        <button
                          className="text-button"
                          onClick={() => setAccountIds([])}
                        >
                          Show all accounts
                        </button>
                        {accounts.map((a) => (
                          <label key={a.id}>
                            <input
                              type="checkbox"
                              checked={accountIds.includes(a.id)}
                              onChange={() =>
                                setAccountIds(
                                  accountIds.includes(a.id)
                                    ? accountIds.filter((id) => id !== a.id)
                                    : [...accountIds, a.id],
                                )
                              }
                            />
                            <span>
                              {a.name}
                              <small>{networks[a.network]}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                  {["Calendar", "Content", "Approvals"].includes(page) && (
                    <>
                      <select
                        aria-label="Filter by status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="">All statuses</option>
                        {Object.entries(labels).map(([id, name]) => (
                          <option value={id} key={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <label className="search">
                        <Search size={16} />
                        <input
                          aria-label="Search posts"
                          placeholder="Search content"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              {page === "Calendar" && (
                <Calendar
                  posts={filtered}
                  data={data}
                  onOpen={(p) => setDetail(p.id)}
                  onNew={newPost}
                  view={view}
                  setView={setView}
                  anchor={anchor}
                  setAnchor={setAnchor}
                />
              )}
              {page === "Content" && (
                <PostList
                  posts={filtered}
                  data={data}
                  onOpen={(p) => setDetail(p.id)}
                />
              )}
              {page === "Approvals" &&
                (filtered.some((p) => p.status === "in_review") ? (
                  <PostList
                    posts={filtered.filter((p) => p.status === "in_review")}
                    data={data}
                    onOpen={(p) => setDetail(p.id)}
                  />
                ) : (
                  <Empty title="All caught up">
                    There are no posts awaiting approval in this view.
                  </Empty>
                ))}
              {page === "Accounts" && (
                <Accounts data={data} clientId={client} />
              )}{" "}
              {page === "Media library" && (
                <Media
                  key={client}
                  data={data}
                  clientId={client}
                  onRefresh={refresh}
                />
              )}{" "}
              {page === "Analytics" && (
                <Analytics
                  posts={filtered}
                  data={data}
                  clientId={client}
                  accountIds={accountIds}
                />
              )}{" "}
              {page === "Settings" && <Team data={data} onRefresh={refresh} />}
            </main>
            {page === "Calendar" && (
              <AttentionRail
                posts={filtered}
                data={data}
                onOpen={(p) => setDetail(p.id)}
                onPage={go}
              />
            )}
          </div>
        )}
      </div>
      {detail && !composer && (
        <Detail
          key={detail.id}
          post={detail}
          data={data}
          onClose={() => setDetail(null)}
          onEdit={(post) => {
            setDetail(null);
            setComposer({ post });
          }}
          onRefresh={refresh}
        />
      )}{" "}
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
