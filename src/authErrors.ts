// A rejected request from before sign-in must not invalidate the new session.
let revision = 0;
export const authenticationRevision = () => revision;
export const advanceAuthentication = () => {
  revision++;
};
export function errorStatus(error: unknown): number | null {
  return error instanceof Error &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : null;
}
export function staleAuthenticationError(error: unknown) {
  return (
    errorStatus(error) === 401 &&
    error instanceof Error &&
    "authenticationRevision" in error &&
    typeof error.authenticationRevision === "number" &&
    error.authenticationRevision < revision
  );
}

const expiryListeners = new Set<()=>void>();
export function onSessionExpired(callback:()=>void) { expiryListeners.add(callback);return ()=>{expiryListeners.delete(callback);}; }
export function notifySessionExpired(requestRevision:number) {
  if(requestRevision === revision) expiryListeners.forEach(fn=>fn());
}
