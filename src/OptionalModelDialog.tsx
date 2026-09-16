import { useEffect, useRef, useSyncExternalStore } from "react";
import { Download, HardDrive, Music2, X } from "lucide-react";
import { downloadPrompt, modelSize } from "./modelDownloads";

export default function OptionalModelDialog() {
  const pending = useSyncExternalStore(downloadPrompt.subscribe, downloadPrompt.snapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (pending) dialog.current?.showModal(); else dialog.current?.close();
  }, [pending]);
  const details = pending?.details;
  const enough = !details || details.freeBytes === null || details.freeBytes >= details.downloadBytes + Math.min(2 * 1024 ** 3, details.downloadBytes / 5);
  return <dialog ref={dialog} className="model-download-dialog" aria-labelledby="model-download-title" onCancel={e => { e.preventDefault(); downloadPrompt.answer(false); }} onKeyDown={e => e.stopPropagation()}>
    {details && <>
      <div className="model-download-heading"><span className="model-download-icon"><Download size={23} /></span><button autoFocus className="icon" aria-label="Cancel model download" onClick={() => downloadPrompt.answer(false)}><X size={19} /></button></div>
      <span className="eyebrow">ONE-TIME SETUP</span>
      <h2 id="model-download-title">Download {details.models.length === 1 ? details.models[0].name : "these creative tools"}?</h2>
      <p>This feature needs {details.models.length === 1 ? "an additional model" : "additional models"}. They run on your workstation and stay in its persistent storage for next time.</p>
      <ul className="model-download-list">{details.models.map(model => <li key={model.id}><div><strong>{model.name}</strong><span>{model.repo}{model.license ? ` · ${model.license}` : ""}</span></div><b>{model.sizeEstimated ? "≈ " : ""}{modelSize(model.missingBytes)}</b></li>)}</ul>
      <div className="model-download-storage"><HardDrive size={17} /><span>{modelSize(details.downloadBytes)} to download · {details.freeBytes === null ? "allocation unavailable" : `${modelSize(details.freeBytes)} available${details.storage?.source === 'configured' ? ' in your allocation' : ''}`}</span></div>
      {details.freeBytes === null && <p className="model-download-warning">This host does not report your volume allowance. Check the Pod's storage allocation before downloading.{details.storage && ` Workspace files use ${modelSize(details.storage.usedBytes)}.`}</p>}
      {!details.models.some(model => model.core) && <p className="model-download-core"><Music2 size={17} /> YuE2 music generation is already included in the Docker image.</p>}
      {!enough && <p role="alert" className="model-download-warning">There isn’t enough storage for this download. Free some space or choose a smaller model.</p>}
      <footer><button onClick={() => downloadPrompt.answer(false)}>Cancel</button><button className="primary" disabled={!enough} onClick={() => downloadPrompt.answer(true)}><Download size={16} /> Download and continue</button></footer>
      <small>Your job starts after confirmation. Follow download progress in the queue.</small>
    </>}
  </dialog>;
}
