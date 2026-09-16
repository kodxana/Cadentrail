"""Resident GPU process. Only stdout JSON is protocol; library progress goes to stderr."""
from __future__ import annotations
import contextlib
import json
import os
import sys
import time
import traceback
from pathlib import Path


def emit(**data):
    print(json.dumps(data),file=sys.__stdout__,flush=True)


def main():
    pipe = None
    loaded_adapters = None
    for line in sys.stdin:
        try:
            task = json.loads(line)
            root = Path(task["root"])
            os.environ["HF_HOME"] = str(root / "models" / "huggingface")
            os.environ["TORCH_HOME"] = str(root / "cache" / "torch")
            os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
            from .download_progress import install_download_progress
            install_download_progress(emit)
            with contextlib.redirect_stdout(sys.stderr):
                import torch
                from filelock import FileLock
                from yue2 import YuE2Pipeline
                from yue2.pipeline import SongResult
                from yue2.storage import identity
            if not torch.cuda.is_available():
                raise RuntimeError("YuE2 requires an NVIDIA CUDA GPU; editing and playback remain available")
            if not torch.cuda.is_bf16_supported():
                raise RuntimeError("This GPU does not support BF16 YuE2 inference")
            from .model_runtime import prepare_models, core_options
            from .schema import JobRequest, Generation
            from .music_adapters import adapter_keys, configure_pipeline, generation_kwargs
            gen = task['generation']
            keys = tuple(adapter_keys(gen))
            request = JobRequest.model_validate(task['request']).model_copy(update={'generation': Generation.model_validate(gen)})
            prepare_models(root,None,request,emit)
            if pipe is not None and loaded_adapters != keys:
                emit(state='Preparing', message='Switching music engine; restoring original weights')
                pipe.close()
                if hasattr(pipe, 'hum_projections'): del pipe.hum_projections
                pipe = None
                import gc
                gc.collect()
                torch.cuda.empty_cache()
            if pipe is None:
                emit(state="Preparing", message="Loading included YuE2 music models")
                with FileLock(str(root / "models" / "download.lock")), contextlib.redirect_stdout(sys.stderr):
                    pipe = YuE2Pipeline.from_pretrained(**core_options(root), device="cuda", quantization="none", backend=("torch" if keys else os.getenv("YUE_BACKEND", "torch")), progress=True)
                from .progress import install_pipeline_progress
                install_pipeline_progress(pipe,emit)
                with contextlib.redirect_stdout(sys.stderr):
                    adapters = configure_pipeline(pipe, root, keys)
                loaded_adapters = keys
                pipe.weights['adapters'] = adapters
            from dataclasses import replace
            pipe.generation_config = replace(pipe.generation_config, ode_steps=gen.get('odeSteps', 32), semantic=replace(pipe.generation_config.semantic, temperature=gen.get('temperature', 1), top_p=gen.get('topP', .95), top_k=gen.get('topK', 100)))
            kwargs = generation_kwargs(gen, task['seed'])
            output = Path(task["output"])
            output.mkdir(parents=True, exist_ok=True)
            torch.cuda.reset_peak_memory_stats()
            start = time.perf_counter()
            emit(state="Planning", message="Planning melody and harmony" if gen["cot"] == "full" else "Preparing composition")
            hum = None
            carrier = None
            with contextlib.redirect_stdout(sys.stderr):
                if gen.get('hum'):
                    from .hum_song import check_source, prepare_hum, plan_hum
                    from .storage import Store
                    source = check_source(Store(root), request.projectId, request.generation.hum)
                    carrier, hum_abc, hum = prepare_hum(source, gen['hum'], output, emit)
                    plan = plan_hum(pipe, kwargs, hum_abc, gen['hum']['mode'])
                else:
                    plan = pipe.plan(**kwargs)
                plan.save(output)
            emit(state="Planning", abc=plan.abc or "", message="Score ready")
            if task["kind"] == "plan":
                emit(done=True, abc=plan.abc or "", timing={"seconds": time.perf_counter()-start}, adapters=pipe.weights.get('adapters', []), hum=hum)
                continue
            emit(state="Generating", message="Generating musical performance")
            with contextlib.redirect_stdout(sys.stderr):
                semantic = pipe.generate_semantic(plan)
            nar_start = time.perf_counter()
            emit(state="Rendering", message="Synthesizing full-quality acoustic latents")
            with contextlib.redirect_stdout(sys.stderr):
                if hum is not None:
                    from .hum_song import synthesize_hum
                    latents = synthesize_hum(pipe, semantic, carrier, gen['hum']['influence'], emit)
                else:
                    latents = pipe.synthesize(semantic)
            nar_seconds = time.perf_counter() - nar_start
            decode_start = time.perf_counter()
            emit(state="Rendering", message="Decoding 48 kHz stereo audio")
            with contextlib.redirect_stdout(sys.stderr):
                audio = pipe.decode(latents)
                torch.cuda.synchronize()
                timing = {"abc": plan.timing, "semantic": semantic.timing, "nar_seconds": nar_seconds, "vae_seconds": time.perf_counter()-decode_start, "load": dict(pipe.load_timing), "e2e_seconds": time.perf_counter()-start, "peak_vram_gib": torch.cuda.max_memory_allocated()/2**30, "reserved_vram_gib": torch.cuda.max_memory_reserved()/2**30, "gpu": torch.cuda.get_device_name()}
                config = pipe.effective_config(plan.request)
                if hum is not None: config['hum'] = hum
                result = SongResult(audio, 48000, semantic, latents, config, pipe.weights, timing, identity({"request": plan.request.to_dict(), "config": config, "weights": pipe.weights}))
                result.save_artifacts(output)
            emit(done=True, abc=plan.abc or "", timing=timing, truncated=result.truncated, file=str(output / "audio.flac"), adapters=pipe.weights.get('adapters', []), hum=hum)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            message = str(exc)
            if "out of memory" in message.lower():
                message = "GPU memory exhausted. Retry after freeing GPU memory or use a larger Pod."
            # A failed merge or cancelled phase must never poison the next request.
            if pipe is not None:
                pipe.close()
                if hasattr(pipe, 'hum_projections'): del pipe.hum_projections
                pipe = None
                import gc
                gc.collect()
                torch.cuda.empty_cache()
            loaded_adapters = None
            emit(error=message[:1000])


if __name__ == "__main__":
    main()
