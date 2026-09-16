# Building and releasing

The current application version is **0.4.11**. Source-only documentation changes do not require rebuilding the Docker image.

## Source package

Keep versions synchronized in package.json/package-lock.json, pyproject.toml, backend/version.py and Docker labels. Update the user-facing release catalogue in src/changelog.json, then generate the Markdown:

~~~sh
python -m scripts.changelog
python -m scripts.check_source
python -m scripts.package_release
~~~

The packager uses reviewed source roots and an explicit documentation allowlist in scripts/check_source.py. Review new guides before adding them to that list. It rejects credentials and unexpected files, normalizes text to LF, writes sorted entries with stable timestamps and includes a SHA-256 file manifest. Output defaults to .runtime/releases and is ignored by Git. Model weights, projects, build caches and Git history are excluded. Use --output-dir to select another destination.

Run tests from an extracted archive before publication. Check installation, production build and source checks without relying on an existing development directory. A packaged source release includes GitHub CI and contribution/security guidance.

## Docker

Full build:

~~~sh
docker build --platform=linux/amd64 -t cadentrail:local .
~~~

Application patch using the pinned qualified runtime:

~~~sh
docker build --platform=linux/amd64 -f Dockerfile.patch -t cadentrail:local .
~~~

The patch recipe reuses the 0.4.5 runtime plus cached instrumental/runtime additions. Runtime, six checkpoint sets and application files are separate layers; the final WORKDIR contributes an empty layer, for nine filesystem layers total. Changes to runtime dependencies or model manifests need a newly qualified build, not an untested base substitution.

Both recipes retain the application LICENSE/NOTICE, third-party notices and model license copies. A full build downloads models and can use tens of gigabytes. Source CI deliberately does not build or push this image.

After building, run CPU regressions against the actual image and verify bundled models with network access disabled. For GPU-dependent changes, use a real NVIDIA GPU and report hardware, workload and measured limitations. Reuse qualified model layers when they have not changed.

## Publish and upgrade

1. Review the clean Git diff, license/notice coverage, changelog and source scan.
2. Run the relevant source and extracted-archive checks.
3. Create the public repository and enable private security reporting. Add the intended remote only after verifying the owner/name.
4. Publish the source commit with tag v0.4.11 and the verified source archive/checksum. The tag should match the application version.
5. If distributing a new container, push the exact tested image under an explicit version and record its registry digest. Do not overwrite an already published immutable version with a different image.
6. Update template examples to the verified digest. Test startup, API access, persistent project preservation and frontend version on the target deployment.

No source CI workflow provisions Pods, reads private deployment credentials or publishes releases automatically. Model and bundled binary redistribution retain their upstream obligations; consult [third-party notices](THIRD-PARTY.md).

## Trailer media

The README currently uses a clickable trailer preview and a direct link to the GitHub-hosted media/cadentrail-trailer-github.mp4. This is a download fallback, not an inline player. GitHub removes the raw HTML video element from the rendered repository README, even when the repository is public. Acceptance by the Markdown API alone does not verify the final README rendering.

For inline playback, upload the prepared MP4 as a GitHub attachment:

1. In the public repository, open a new issue draft and drag the MP4 into its description field.
2. Wait for the attachment upload to finish, then copy the generated https://github.com/user-attachments/assets/... URL. You do not need to submit the issue.
3. Replace the README preview with that real URL on its own line, separated by blank lines. Keep the direct download link if desired.
4. Check the actual repository README while signed out and press Play to verify playback.

Do not invent an attachment URL or use a raw repository URL as a substitute. The prepared H.264 MP4 is under the free-plan 10 MB video attachment limit. See [GitHub attachment documentation](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files).

Local media files remain ignored by Git and excluded from Docker builds and source ZIPs. A video uploaded through GitHub's web interface is already tracked remotely; .gitignore does not remove it. The source audit permits only this named promotional MP4 as an extra tracked file, while leaving it outside the source archive.
