# syntax=docker/dockerfile:1.20
FROM python:3.12-slim-bookworm AS core-models
RUN pip install --no-cache-dir huggingface-hub==0.36.2
COPY backend/core_model_manifest.json /build/model_manifest.json
COPY scripts/bake_core_models.py /build/bake_core_models.py
RUN python /build/bake_core_models.py

FROM python:3.12-slim-bookworm AS tool-models
RUN pip install --no-cache-dir huggingface-hub==0.36.2
COPY backend/tool_model_manifest.json /build/tool_model_manifest.json
COPY scripts/bake_tool_models.py /build/bake_tool_models.py
RUN python /build/bake_tool_models.py

FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 HF_HUB_DISABLE_TELEMETRY=1 \
    DAW_STORAGE=/workspace/yue2-daw HF_HOME=/workspace/yue2-daw/models/huggingface \
    TORCH_HOME=/workspace/yue2-daw/cache/torch NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir torch==2.10.0 torchaudio==2.10.0 --index-url https://download.pytorch.org/whl/cu128
COPY scripts/runtime-requirements.txt /opt/cadentrail/runtime-requirements.txt
RUN pip install --no-cache-dir huggingface-hub==0.36.2 \
    && python -c "from huggingface_hub import hf_hub_download; hf_hub_download('m-a-p/YuE2-3B','yue2_infer-0.1.5-py3-none-any.whl',local_dir='/tmp/yue-wheel')" \
    && echo '8801e2c0d969db02df78d2994150b4ccd86077d87c24fdb8509b1f6f31462641  /tmp/yue-wheel/yue2_infer-0.1.5-py3-none-any.whl' | sha256sum -c - \
    && pip install --no-cache-dir /tmp/yue-wheel/*.whl -r /opt/cadentrail/runtime-requirements.txt \
    && rm -rf /tmp/yue-wheel
ARG INSTALL_STEMS=1
RUN if [ "$INSTALL_STEMS" = "1" ]; then pip install --no-cache-dir demucs==4.0.1; fi \
    && pip check
ARG INSTALL_VISUALS=1
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN if [ "$INSTALL_VISUALS" = "1" ]; then pip install --no-cache-dir diffusers==0.35.2 faster-whisper==1.2.1; fi \
    && pip check
# Optional lyric/voice dependencies stay isolated from the YuE2 runtime.
COPY scripts/alignment-requirements.txt scripts/alignment-constraints.txt /opt/cadentrail/
RUN python -m venv --system-site-packages /opt/cadentrail/alignment-runtime \
    && /opt/cadentrail/alignment-runtime/bin/pip install --no-cache-dir -c /opt/cadentrail/alignment-constraints.txt -r /opt/cadentrail/alignment-requirements.txt \
    && /opt/cadentrail/alignment-runtime/bin/python -c "from qwen_asr import Qwen3ASRModel; from nemo.collections.asr.models import SortformerEncLabelModel"

# Assemble small, frequently changing application files in one release layer.
FROM frontend AS application-files
COPY backend /release/app/backend
COPY docs/THIRD-PARTY.md CREDITS.md LICENSE NOTICE pyproject.toml /release/app/
COPY docs/licenses /release/opt/cadentrail/licenses
COPY --from=core-models /opt/cadentrail/core-models/yue2/LICENSE /release/opt/cadentrail/licenses/CC-BY-NC-4.0.txt
COPY --from=core-models /opt/cadentrail/core-models/manifest.json /release/opt/cadentrail/core-models/manifest.json
COPY --from=tool-models /opt/cadentrail/bundled-tools/manifest.json /release/opt/cadentrail/bundled-tools/manifest.json
COPY scripts/entrypoint.sh /release/usr/local/bin/studio-start
RUN cp -a /build/dist /release/app/dist && sed -i 's/\r$//' /release/usr/local/bin/studio-start && chmod +x /release/usr/local/bin/studio-start

# Eight data layers: runtime, six independent model sets, application.
# BuildKit also records an empty WORKDIR layer (nine image layers total).
# No installed packages or model files are recomputed in this final stage.
FROM scratch AS release
COPY --from=runtime --exclude=app --exclude=build --exclude=opt/cadentrail/core-models --exclude=opt/cadentrail/bundled-tools --exclude=opt/cadentrail/licenses --exclude=usr/local/bin/studio-start / /
COPY --from=core-models /opt/cadentrail/core-models/yue2 /opt/cadentrail/core-models/yue2
COPY --from=core-models /opt/cadentrail/core-models/yue2-vae /opt/cadentrail/core-models/yue2-vae
COPY --from=tool-models /opt/cadentrail/bundled-tools/realaudio-v4 /opt/cadentrail/bundled-tools/realaudio-v4
COPY --from=tool-models /opt/cadentrail/bundled-tools/demucs /opt/cadentrail/bundled-tools/demucs
COPY --from=tool-models /opt/cadentrail/bundled-tools/sortformer /opt/cadentrail/bundled-tools/sortformer
COPY --from=tool-models /opt/cadentrail/bundled-tools/instrumental-v1 /opt/cadentrail/bundled-tools/instrumental-v1
COPY --from=application-files /release/ /
ENV PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 HF_HUB_DISABLE_TELEMETRY=1 \
    DAW_STORAGE=/workspace/yue2-daw HF_HOME=/workspace/yue2-daw/models/huggingface \
    TORCH_HOME=/workspace/yue2-daw/cache/torch NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    DAW_CORE_MODELS=/opt/cadentrail/core-models DAW_BUNDLED_TOOLS=/opt/cadentrail/bundled-tools
WORKDIR /app
LABEL org.opencontainers.image.version="0.4.12" \
      org.opencontainers.image.title="Cadentrail — A DAW for YuE2" \
      org.opencontainers.image.description="Independent browser DAW for YuE2, created by Madiator2011 and built for Runpod" \
      org.opencontainers.image.authors="Madiator2011"
EXPOSE 8000
VOLUME ["/workspace"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4)"
ENTRYPOINT ["/usr/bin/tini","--","/usr/local/bin/studio-start"]
