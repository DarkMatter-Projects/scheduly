import { useEffect, useState } from "react";
import { request } from "./api";
const roles = {
  admin: "Admin",
  editor: "Editor",
  content_creator: "Content Creator",
  viewer: "Viewer",
};
export default function Team({ data, onRefresh }) {
  const [members, setMembers] = useState([]),
    [selected, setSelected] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const isAdmin = data.team?.role === "admin";
  useEffect(() => {
    if (isAdmin)
      request("team")
        .then((d) => setMembers(d.members))
        .catch((e) => setError(e.message));
  }, [isAdmin]);
  const edit = (member) => {
    setSelected(
      member
        ? { ...member, clientIds: member.client_ids }
        : {
            email: "",
            role: "content_creator",
            active: true,
            clientIds: [],
            version: 0,
          },
    );
    setMessage("");
    setError("");
  };
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("team", selected);
      const d = await request("team");
      setMembers(d.members);
      setSelected(null);
      setMessage(
        "Access saved. This person can sign in with their email at the workspace address.",
      );
      await onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function invite(email) {
    setBusy(true);
    setError("");
    try {
      await request("team/invite", { email });
      setMessage(`Sign-in email requested for ${email}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings">
      <section>
        <h2>Team & access</h2>
        <p>
          Your role: <b>{roles[data.team?.role] || "Local rehearsal"}</b>.
          Client assignments control which calendars and content you can access.
        </p>
        {!isAdmin ? (
          <p>An Admin manages team accounts and permissions.</p>
        ) : (
          <>
            <button className="primary" onClick={() => edit(null)}>
              Add team member
            </button>
            <p>
              Grant access by email, then share the workspace address. The
              person confirms their email when signing in. Use Send sign-in email after saving access to invite them.
            </p>
            <div className="team-list">
              {members.map((m) => (
                <div className="team-row" key={m.email}>
                  <div>
                    <b>{m.email}</b>
                    <small>
                      {roles[m.role]} ·{" "}
                      {!m.active
                        ? "Disabled"
                        : m.user_id
                          ? "Active"
                          : "Awaiting first sign-in"}{" "}
                      ·{" "}
                      {m.role === "admin"
                        ? "All clients"
                        : `${m.client_ids.length} clients`}
                    </small>
                  </div>
                  <div>
                    <button disabled={busy} onClick={() => edit(m)}>
                      Manage access
                    </button>
                    {m.active && (
                      <button disabled={busy} onClick={() => invite(m.email)}>
                        Send sign-in email
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {selected && (
              <form onSubmit={save}>
                <fieldset disabled={busy}>
                  <legend>
                    {selected.version ? "Manage access" : "New team member"}
                  </legend>
                  <label>
                    Work email
                    <input
                      type="email"
                      required
                      disabled={selected.version > 0}
                      value={selected.email}
                      onChange={(e) =>
                        setSelected({ ...selected, email: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Role
                    <select
                      value={selected.role}
                      onChange={(e) =>
                        setSelected({ ...selected, role: e.target.value })
                      }
                    >
                      {Object.entries(roles).map(([r, label]) => (
                        <option key={r} value={r}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.active}
                      onChange={(e) =>
                        setSelected({ ...selected, active: e.target.checked })
                      }
                    />{" "}
                    Workspace access enabled
                  </label>
                  {selected.role === "admin" ? (
                    <p>
                      Admins manage the team and have access to all clients.
                    </p>
                  ) : (
                    <div>
                      <b>Assigned clients</b>
                      {data.clients.map((c) => (
                        <label key={c.id}>
                          <input
                            type="checkbox"
                            checked={selected.clientIds.includes(c.id)}
                            onChange={(e) =>
                              setSelected({
                                ...selected,
                                clientIds: e.target.checked
                                  ? [...selected.clientIds, c.id]
                                  : selected.clientIds.filter(
                                      (id) => id !== c.id,
                                    ),
                              })
                            }
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  )}
                  <button className="primary">
                    {busy ? "Saving…" : "Save access"}
                  </button>
                  <button type="button" onClick={() => setSelected(null)}>
                    Cancel
                  </button>
                </fieldset>
              </form>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      <section>
        <h2>Role permissions</h2>
        <p>
          <b>Admin</b>: team, clients, account connections, content, approvals
          and reporting.
        </p>
        <p>
          <b>Editor</b>: content, approvals, scheduling and reporting for
          assigned clients.
        </p>
        <p>
          <b>Content Creator</b>: upload media, create drafts, edit their own
          drafts and submit for approval.
        </p>
        <p>
          <b>Viewer</b>: calendars, approved content and reporting for assigned
          clients.
        </p>
        <p>
          Every edit resets approval. Live publishing remains disabled until
          account connections have been verified.
        </p>
      </section>
    </div>
  );
}
