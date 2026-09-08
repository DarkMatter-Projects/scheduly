import { useEffect, useState } from "react";
import { supabase } from "./auth-client";
export default function AuthGate({ children }) {
  const [ready, setReady] = useState(!supabase),
    [session, setSession] = useState(null),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          setSession(data.session);
          setReady(true);
          if (error) setMessage("Please sign in again.");
        }
      })
      .catch(() => {
        if (active) {
          setReady(true);
          setMessage("Sign-in is temporarily unavailable.");
        }
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  if (!supabase) return children;
  if (!ready)
    return (
      <div className="loading">
        <h1>scheduly</h1>
        <p>Checking your session…</p>
      </div>
    );
  if (session) return children;
  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin + "/workspace.html",
        },
      });
      if (error) throw error;
      setMessage(
        "Check your email for a secure sign-in link. Workspace access is granted separately.",
      );
    } catch {
      setMessage("We could not send your sign-in link. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="loading">
      <form
        onSubmit={signIn}
        style={{ width: "min(360px,90vw)", textAlign: "left" }}
      >
        <h1>scheduly</h1>
        <h2>Welcome to your workspace</h2>
        <p>
          Sign in with your work email to access the clients assigned to you.
        </p>
        <label>
          Work email
          <input
            style={{ width: "100%", margin: "10px 0 20px" }}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
        <p role="status">{message}</p>
        <small>Hosted preview · Live publishing is disabled.</small>
      </form>
    </main>
  );
}
