import { useState } from "react";
import { Dialog } from "./Dialog";
import { post } from "./api";
import { acceptAuthenticatedSession } from "./store";
export function SessionDialog({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog titleId="session-expired-title">
      <div className="modal-title">
        <h2 id="session-expired-title">Sign back in</h2>
      </div>
      <p>
        Your project and open editors are kept here. Sign in to reconnect and
        save.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          void post("/auth", { password })
            .then(() => {
              acceptAuthenticatedSession();
              setPassword("");
              onSignedIn();
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label className="field">
          <span>Workstation password</span>
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Reconnect"}
        </button>
      </form>
    </Dialog>
  );
}
