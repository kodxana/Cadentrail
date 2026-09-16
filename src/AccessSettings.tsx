import { useEffect, useRef, useState } from "react";
import { ShieldCheck, ShieldOff, X } from "lucide-react";

export function AccessNotice({ onSetup }: { onSetup: () => void }) {
  return <aside className="access-notice" aria-label="Workstation access">
    <ShieldOff size={15} /><span><strong>Open access.</strong> Anyone who can reach this address can use the app and its API.</span>
    <button onClick={event => { event.currentTarget.focus(); onSetup(); }}>Set up password</button>
  </aside>;
}

export function AccessSettings({ protectedAccess, close, onSignOut }: { protectedAccess: boolean; close: () => void; onSignOut?:()=>Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [signOutError,setSignOutError]=useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const finish = () => { dialog.current?.close(); close(); };
  return <dialog ref={dialog} className="access-dialog" aria-labelledby="access-title" onCancel={event => { event.preventDefault(); finish(); }} onKeyDown={e => e.stopPropagation()}>
    <div className="modal-title"><h2 id="access-title">Access settings</h2><button autoFocus aria-label="Close access settings" onClick={finish}><X size={18}/></button></div>
    <p className="access-state">{protectedAccess ? <ShieldCheck size={19}/> : <ShieldOff size={19}/>}<strong>{protectedAccess ? "Password protection is on" : "Password protection is off"}</strong></p>
    <p>{protectedAccess ? "Sign-in is required for your projects, jobs, media, exports and live updates." : "This workstation starts without a password. Anyone who can reach its address can read projects and files, change them, or start jobs."}</p>
    <h3>{protectedAccess ? "Change your password on Runpod" : "Set a password on Runpod"}</h3>
    <ol>
      <li>Save your project and wait for active jobs to finish.</li>
      <li>Open your Pod in the Runpod console. Choose the three-dot menu, then <strong>Edit Pod</strong>.</li>
      <li>In environment variables, add <code>DAW_PASSWORD</code> and enter your own long, unique password as its value. Keep other settings unchanged.</li>
      <li>Save the configuration and let the Pod restart. If it does not restart automatically, restart it.</li>
      <li>Reload this app and sign in with your password.</li>
    </ol>
    <p className="access-detail">Keep your project storage mounted at <code>/workspace</code>. Your password is configured by the Pod owner; this guide does not collect or store it in the browser.</p>
    <details><summary>What does the password protect?</summary><p>Project, generation, model, audio, visual and export API routes require a browser session or an agent token with the right permissions. The job WebSocket uses browser sign-in; agents poll job status. Manage agent tokens in API & Integrations. Only sign-in, session status, health checks and the static application UI are public. HTTPS encrypts the connection; it does not replace a password.</p></details>
    {signOutError&&<p role="alert">{signOutError}</p>}<footer>{protectedAccess && onSignOut && <button onClick={()=>void onSignOut().catch(error=>setSignOutError(error.message))}>Sign out</button>}<a href="https://docs.runpod.io/pods/manage-pods#update-a-pod" target="_blank" rel="noreferrer">Runpod setup documentation</a><button className="primary" onClick={finish}>Done</button></footer>
  </dialog>;
}
