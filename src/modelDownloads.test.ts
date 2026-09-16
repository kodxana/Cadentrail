import { afterEach, expect, it, vi } from "vitest";
import { post } from "./api";
import { downloadPrompt, DownloadCancelled } from "./modelDownloads";

const detail = { code: 'model_download_required', models: [{ id: 'sdxl', name: 'SDXL artwork', missingBytes: 7000 }], freeBytes: 100000, downloadBytes: 7000 };
afterEach(() => { vi.unstubAllGlobals(); while (downloadPrompt.snapshot()) downloadPrompt.answer(false); });

it('Cancel makes no second request and creates no queued action', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({detail}),{status:428}));
  vi.stubGlobal('fetch',fetch);
  const action = post('/jobs',{kind:'artwork'});
  const rejected = expect(action).rejects.toBeInstanceOf(DownloadCancelled);
  await vi.waitFor(() => expect(downloadPrompt.snapshot()?.details.models[0].id).toBe('sdxl'));
  downloadPrompt.answer(false);
  await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('confirmation retries the same job with exactly the approved model IDs', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({detail}),{status:428})).mockResolvedValueOnce(new Response(JSON.stringify({id:'queued'})));
  vi.stubGlobal('fetch',fetch);
  const payload={kind:'artwork',projectId:'project',options:{prompt:'Lighthouse'}};
  const action=post('/jobs',payload);
  await vi.waitFor(() => expect(downloadPrompt.snapshot()).not.toBeNull());
  downloadPrompt.answer(true);
  expect(await action).toEqual({id:'queued'});
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({...payload,approvedDownloads:['sdxl']});
});

it('an installed model proceeds without a dialog',async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'queued'}))));
  expect(await post('/jobs',{kind:'lyrics'})).toEqual({id:'queued'});
  expect(downloadPrompt.snapshot()).toBeNull();
});
