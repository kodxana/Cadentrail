import { submissionKey, finishSubmission } from "./jobSubmission";
import { authenticationRevision, notifySessionExpired } from "./authErrors";
import {
  confirmModelDownload,
  DownloadCancelled,
  type DownloadRequest,
} from "./modelDownloads";

export async function api<T>(path:string, options:RequestInit={}):Promise<T> {
  if(options.method !== "POST" || typeof options.body !== "string" || !/^\/jobs(?:\/[^/]+\/retry)?$/.test(path)) return performApi<T>(path,options);
  const submission=await submissionKey(path, options.body);
  const headers=new Headers(options.headers);headers.set("Idempotency-Key",submission.key);
  try {
    let result:T;
    try {result=await performApi<T>(path,{...options,headers});}
    catch(error) {
      if(!(error instanceof TypeError)) throw error;
      // A dropped reply is safe to replay once because the server records the key atomically.
      result=await performApi<T>(path,{...options,headers});
    }
    finishSubmission(submission.fingerprint);return result;
  } catch(error) {
    const status=(error as {status?:number}).status;
    if((status && status < 500) || (error as Error).name === "DownloadCancelled") finishSubmission(submission.fingerprint);
    throw error;
  }
}
async function performApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const requestAuthenticationRevision = authenticationRevision();
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(!(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...Object.fromEntries(new Headers(options.headers).entries()),
    },
  });
  if (!response.ok) {
    if(response.status===401 && path!=="/auth" && path!=="/session") notifySessionExpired(requestAuthenticationRevision);
    let message = response.statusText;
    let detail: DownloadRequest | undefined;
    try {
      const data = await response.json();
      if (
        response.status === 428 &&
        data.detail?.code === "model_download_required"
      )
        detail = data.detail;
      message =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
    } catch {
      /* status fallback */
    }
    if (
      detail &&
      options.method === "POST" &&
      typeof options.body === "string"
    ) {
      if (!(await confirmModelDownload(detail))) throw new DownloadCancelled();
      const data = JSON.parse(options.body);
      return performApi<T>(path, {
        ...options,
        body: JSON.stringify({
          ...data,
          approvedDownloads: [
            ...new Set([
              ...(data.approvedDownloads ?? []),
              ...detail.models.map((model) => model.id),
            ]),
          ],
        }),
      });
    }
    throw Object.assign(new Error(message), {
      status: response.status,
      authenticationRevision: requestAuthenticationRevision,
    });
  }
  return response.json();
}
export const post = <T>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export function download(name: string, data: BlobPart, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function fileApi<T>(path: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return api<T>(path, { method: "POST", body });
}
