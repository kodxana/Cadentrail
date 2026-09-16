# Password setup and API access

Cadentrail 0.3.4 starts without a password by default. There is no shared or baked-in password. The app displays **Open access** and a **Set up password** action, including on first launch. **Access settings** remains available from the header after protection is enabled.

Open access means anyone who can reach the app can read or change projects, download files and start jobs. HTTPS encrypts the connection; it does not authenticate visitors. Same-origin checks prevent foreign browser origins from making writes but do not prevent direct HTTP clients from using an open workstation.

## Set your own password on Runpod

1. Save your project and let active jobs finish.
2. Open your Pod's three-dot menu and choose **Edit Pod**.
3. Add `DAW_PASSWORD` under environment variables with your own long, unique value. Keep other variables and the `/workspace` mount unchanged.
4. Save the configuration. Let the Pod restart, or restart it if necessary.
5. Reload Cadentrail and sign in with your new password.

Runpod's [Pod update instructions](https://docs.runpod.io/pods/manage-pods#update-a-pod) explain the menu and configuration update. A [Runpod secret](https://docs.runpod.io/pods/templates/manage-templates#using-secrets-in-templates) can supply the environment value instead of saving a password directly in a shared template. Never distribute your own password with a public template.

Only the Pod owner changes this setting through Runpod. Cadentrail's guide does not accept a password from an anonymous web visitor or store one in browser local storage. To change a password, update the environment value and restart. Removing it or setting it empty restores open access. Existing installations with a configured password keep their protection when upgrading; the image does not clear environment variables.

## Docker and local development

Set `DAW_PASSWORD` in the process environment, or in a private Docker `--env-file`, before starting the server. Recreate the Docker container using the same volume when changing its environment. For local open access, bind the server to `127.0.0.1` if it should only be reachable on the same device.

## What is protected?

| Endpoint/content | Password configured | Open access |
|---|---|---|
| Project/library reads and writes, import/backup/export | Browser session or permitted agent token | Accessible |
| Generation, rendering, downloads, cancellation and retry | Browser session or permitted agent token | Accessible |
| Model inventory and optional-model jobs | Browser session or permitted agent token | Accessible |
| Audio, segments, artwork, video and other project media | Browser session or read token, including range requests | Accessible |
| `/api/events` WebSocket | Valid session and allowed browser origin required | Allowed browser origin required |
| `/api/auth`, `/api/session`, `/health` | Public bootstrap/readiness endpoints | Public |
| Static application HTML/JS/CSS | Public; contains no project files or password | Public |

The authenticated OpenAPI reference is available at `/api/openapi.json`; the API & Integrations page is available from all three experience headers or `/?integrations=1`. MCP at `/api/mcp` always requires a scoped Bearer token, even on an open workstation. All other HTTP `/api/` routes pass through the server authentication middleware; this is not a frontend-only login gate. Optional model downloads still require per-job consent in either mode.

Sessions use a random cookie with HttpOnly and SameSite=Strict; HTTPS cookies also use Secure. Password comparison accepts Unicode and uses constant-time comparison of UTF-8 bytes. Sessions expire after seven days and are invalidated on restart. Incorrect login attempts are rate limited. API and media responses use `Cache-Control: private, no-store`, including authenticated audio range responses, so a shared cache must not reuse private content.

This remains a single-user workstation with a shared password, not separate user accounts or a multi-tenant service. Version 0.4.7 adds scoped agent tokens; see [API & Integrations](API.md).
