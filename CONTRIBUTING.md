# Contributing to Cadentrail

Cadentrail is an independent browser DAW for YuE2 by Madiator2011. Contributions should preserve the shared project, non-destructive media history and unified desktop/phone experience.

## Start here

Read [development setup](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md) and [model limitations](docs/GENERATION-EXPECTATIONS.md). Use an issue to discuss larger changes before implementing them. For bugs, include the app version, browser, steps, expected behavior and a minimal example. Remove tokens, private URLs, lyrics and personal media from reports.

Keep pull requests focused. Explain the user-visible problem, resulting behavior and relevant validation. Add regression tests for behavior that can lose edits, corrupt projects, expose data or break generation. Use existing theme tokens and controls; check both desktop and phone layouts when changing UI.

## Verify

~~~sh
npm test
npm run build
python -m pytest -q
python -m scripts.changelog --check
python -m scripts.check_source
npm run test:browser
~~~

Browser tests use an isolated local server and synthetic audio, not your workstation projects. See the development guide for installing the browser. GPU changes additionally need measured validation on a suitable NVIDIA GPU; report hardware, settings and limitations. Do not describe a CPU test as GPU qualification.

Maintain one authoritative project format, preserve unknown/custom Studio settings, retain original generation metadata, and keep uncertain timings and model outputs visibly uncertain. Do not add silent model downloads or optional external API dependencies to core workflows.

## Dependencies and licenses

This project's original application code and documentation use Apache-2.0. By intentionally submitting a contribution for inclusion, you provide it under those terms unless explicitly stated otherwise, consistent with section 5 of LICENSE.

Identify the source, exact version and license of any third-party material you add. Preserve required notices and keep model terms separate. Do not include credentials, generated user media, model checkpoints or copied code with incompatible terms.

Update relevant docs and tests. Maintainers add user-facing changes to src/changelog.json and generate CHANGELOG.md when preparing a version; contributors should not invent a release number or publish deployment artifacts.
