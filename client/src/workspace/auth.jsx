import { useEffect, useState } from "react";
import { supabase } from "./auth-client";
export default function AuthGate({ children }) {
  const passwordRoute =
    new URLSearchParams(window.location.search).get("auth") === "password";
  const [ready, setReady] = useState(!supabase),
    [session, setSession] = useState(null),
    [mode, setMode] = useState(passwordRoute ? "password" : "login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setMode("password");
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          setSession(data.session);
          setReady(true);
          if (error)
            setMessage(
              "Your link has expired. Request a new password setup email.",
            );
        }
      })
      .catch(() => {
        if (active) {
          setReady(true);
          setMessage("Sign-in is temporarily unavailable.");
        }
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  if (!supabase) return children;
  if (!ready)
    return (
      <main className="loading">
        <h1 className="brand-heading"><img src="/brand/scheduly-mark.png" alt="" width="44" height="44" />scheduly</h1>
        <p>Checking your session…</p>
      </main>
    );
  if (session && mode !== "password") return children;
  const signingUp = mode === "signup";
  const setting = mode === "password" && session;
  const resetting = mode === "reset" || (mode === "password" && !session);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (signingUp) {
        if (password.length < 12)
          throw new Error("Use at least 12 characters.");
        if (password !== confirm)
          throw new Error("The passwords do not match.");
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/workspace.html",
          },
        });
        if (error) throw error;
        setPassword("");
        setConfirm("");
        setMode("login");
        setMessage(
          "Check your email to confirm your account, then sign in. An Admin must assign your workspace access. Already registered? Use password reset instead.",
        );
      } else if (setting) {
        if (password.length < 12)
          throw new Error("Use at least 12 characters.");
        if (password !== confirm)
          throw new Error("The passwords do not match.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setConfirm("");
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
      } else if (resetting) {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo:
              window.location.origin + "/workspace.html?auth=password",
          },
        );
        if (error) throw error;
        setMessage(
          "If your account exists, a password setup email is on its way. Use it once to choose your password, then sign in with your email and password in any browser.",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error)
          throw new Error(
            "Email or password not recognised. If you previously used an email link, choose Set up or reset password below.",
          );
        setPassword("");
      }
    } catch (e) {
      setMessage(
        e.message || "Unable to complete this request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function change(next) {
    setMode(next);
    setPassword("");
    setConfirm("");
    setMessage("");
  }
  return (
    <main className="loading">
      <form className="auth-form" onSubmit={submit}>
        <h1 className="brand-heading"><img src="/brand/scheduly-mark.png" alt="" width="44" height="44" />scheduly</h1>
        <h2>
          {setting
            ? "Choose your password"
            : resetting
              ? "Set up or reset password"
              : signingUp
                ? "Create your account"
                : "Welcome back"}
        </h2>
        <p>
          {setting
            ? "Use a unique password of at least 12 characters."
            : resetting
              ? "Already used an email link? Set a password for your existing account here."
              : signingUp
                ? "Create your login. Your Admin assigns your role and client access."
                : "Sign in with your work email and password."}
        </p>
        {!setting && (
          <label>
            Email / username
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {!resetting && (
          <label>
            {setting ? "New password" : "Password"}
            <input
              type="password"
              autoComplete={
                setting || signingUp ? "new-password" : "current-password"
              }
              minLength={setting || signingUp ? 12 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {(setting || signingUp) && (
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? "Please wait…"
            : setting
              ? "Save password and open workspace"
              : resetting
                ? "Send password setup email"
                : signingUp
                  ? "Create account"
                  : "Sign in"}
        </button>
        {!setting && (
          <button
            type="button"
            disabled={busy}
            onClick={() => change(resetting ? "login" : "reset")}
          >
            {resetting ? "Back to sign in" : "Set up or reset password"}
          </button>
        )}
        {!setting && (
          <button
            type="button"
            disabled={busy}
            onClick={() => change(signingUp ? "login" : "signup")}
          >
            {signingUp
              ? "Already have an account? Sign in"
              : "Create an account"}
          </button>
        )}
        <p role="status">{message}</p>
        <p>
          <a href="/privacy.html">Privacy notice</a>
        </p>
        <small>
          Your work email is your username. Workspace access is assigned by an
          Admin.
        </small>
      </form>
    </main>
  );
}
