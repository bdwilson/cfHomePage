# cf-homepage

A dynamic self-hosted services dashboard built on **Cloudflare Workers**. It reads your [Cloudflare Zero Trust Access](https://www.cloudflare.com/zero-trust/) application list at runtime and renders a clean, responsive homepage — no static config to maintain.

## Features

- **Fully dynamic** — add an app to Zero Trust and it appears on the homepage within 5 minutes, no redeploy needed
- **Custom entries** — add bookmarks for services not in Cloudflare Access (any URL, name, and icon)
- **Automatic icons** — looks up icons from [dashboardicons.com](https://dashboardicons.com) (3,500+ self-hosted app icons) with graceful fallbacks
- **Edit mode** — drag to reorder, hide/show apps, rename labels, set custom icons, add custom entries; layout saved to KV
- **Light / dark mode** — theme preference saved in the browser; favicon and header icon switch automatically
- **Zero cost** — runs on Cloudflare's free Workers tier (100k requests/day included)
- **Auto-deploy** — push to GitHub and it deploys automatically via GitHub Actions

---

## Table of Contents

1. [How it works](#how-it-works)
2. [Prerequisites](#prerequisites)
3. [Cloudflare setup](#cloudflare-setup)
4. [Create your config](#create-your-config)
5. [GitHub setup](#github-setup)
6. [Deploy](#deploy)
7. [Setting runtime secrets](#setting-runtime-secrets)
8. [Customization](#customization)
9. [Custom domain](#custom-domain)
10. [Protect with Cloudflare Access](#protect-with-cloudflare-access)
11. [Local development](#local-development)
12. [Troubleshooting](#troubleshooting)

---

## How it works

```
GitHub push
    └─► GitHub Actions runs `wrangler deploy`
            └─► Cloudflare Worker is updated

User visits homepage
    └─► Worker fetches your Access apps list from the CF API (cached 5 min)
    └─► Worker merges in any custom entries saved in KV
    └─► Worker renders HTML with icon URLs embedded
    └─► Browser fetches each icon (dashboardicons CDN → local file → letter avatar)
```

Icons are resolved with a fallback chain:

| Priority | Source | When used |
|---|---|---|
| 1 | Custom icon URL set in edit mode | You clicked the icon in edit mode and entered a URL |
| 2 | `logo_url` set on the Zero Trust app | You've configured a custom logo in the ZT dashboard |
| 3 | [dashboardicons.com](https://dashboardicons.com) CDN | Auto-matched by app name slug |
| 4 | Local file in `public/icons/` | You've added a PNG for apps not in dashboardicons |
| 5 | Letter avatar (generated SVG) | Nothing else matched |

---

## Prerequisites

You need:

- A **Cloudflare account** with Zero Trust enabled (free plan works)
- At least one **Cloudflare Access application** configured
- **Git** installed on your machine
- A **GitHub account**

You do _not_ need Node.js, npm, or any local build tools — GitHub Actions handles everything. If you want to run it locally for testing, see [Local development](#local-development).

---

## Cloudflare setup

### 1. Find your Account ID

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. On the right sidebar of any zone page (or the main dashboard) you'll see **Account ID**
3. Copy it — you'll need it in the next steps

### 2. Create a KV namespace

The Worker uses KV to persist your layout (drag order, hidden apps, custom entries, icon overrides).

1. Go to **Workers & Pages** → **KV** → **Create namespace**
2. Name it anything (e.g. `cf-homepage-layout`)
3. Copy the **Namespace ID** shown after creation

### 3. Update `wrangler.toml`

Open `wrangler.toml` and fill in your values:

```toml
account_id = "YOUR_ACCOUNT_ID_HERE"   # ← your account ID

[[kv_namespaces]]
binding = "LAYOUT"
id      = "YOUR_KV_NAMESPACE_ID_HERE"  # ← KV namespace ID from step 2
```

Commit and push this change:

```bash
git add wrangler.toml
git commit -m "Set account ID and KV namespace ID"
git push
```

### 4. Get your API credentials

You have two options. **Option B is simpler** for getting started.

#### Option A — Scoped API Token (recommended for production)

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → use the **"Edit Cloudflare Workers"** template
3. Save the token — you'll add it to GitHub as `CLOUDFLARE_API_TOKEN`

You'll also need a separate token for the Worker's runtime API calls. Create another token with:
- **Account** → **Access: Apps and Policies** → Read

#### Option B — Global API Key (simpler)

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Scroll to **Global API Key** → **View**
3. Copy the key

The same email + key is used for both deploying (GitHub Actions) and runtime API calls (the Worker fetching your app list).

---

## Create your config

All personal customization lives in `src/config.js`, which is gitignored so your values stay private.

Copy the example file and edit it:

```bash
cp src/config.example.js src/config.js
```

Then open `src/config.js` and fill in your values:

```js
// Your Cloudflare account ID
export const ACCOUNT_ID = 'abc123...';

// Page title shown in the browser tab and header
export const TITLE = 'My Services';

// Apps to hide entirely from the homepage (exact Zero Trust name match)
export const EXCLUDE = new Set([
  'App Launcher',
  'Warp Login App',
]);

// Overrides when the auto-slug doesn't match a dashboardicons entry
export const DASH_ICON_OVERRIDES = {
  'nodered':       'node-red',
  'homeassistant': 'home-assistant',
  'myapp':         null,   // null = skip dashboardicons, use local/avatar
};

// Local icon fallbacks for apps not in dashboardicons
export const LOCAL_ICONS = [
  ['myapp', 'myapp.png'],   // file must exist in public/icons/
];
```

`src/config.js` is listed in `.gitignore` and will never be committed.

---

## GitHub setup

### 1. Fork or clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/cf-homepage.git
cd cf-homepage
```

Or click **Fork** on GitHub and then clone your fork.

### 2. Add secrets to GitHub

These secrets let GitHub Actions authenticate with Cloudflare to deploy the Worker.

**Via the `gh` CLI:**

```bash
# Option A — API Token
gh secret set CLOUDFLARE_API_TOKEN

# Option B — Global API Key (default workflow uses this)
gh secret set CLOUDFLARE_EMAIL     # your Cloudflare login email
gh secret set CLOUDFLARE_API_KEY   # your Global API Key
```

**Via the GitHub web UI:**

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the same secrets as above.

---

## Deploy

Every push to the `main` branch triggers a deploy automatically via GitHub Actions.

To watch a deploy in progress:

```bash
gh run watch
```

To manually trigger a deploy without making a code change:

```bash
gh workflow run deploy.yml
```

After the first successful deploy, your Worker is live at:

```
https://cf-homepage.YOUR_SUBDOMAIN.workers.dev
```

Check **Workers & Pages** in the Cloudflare dashboard — your Worker will appear there after the first deploy.

---

## Setting runtime secrets

The Worker needs credentials to call the Cloudflare API at runtime (to fetch your Access app list). These are separate from the GitHub Actions deploy credentials.

Set them in the **Cloudflare dashboard**:

1. Go to **Workers & Pages** → **cf-homepage** → **Settings** → **Variables and Secrets**
2. Add secrets:

| Secret name | Value | When to use |
|---|---|---|
| `CF_API_TOKEN` | Scoped API token with Access read permission | Option A |
| `CF_API_EMAIL` | Your CF login email | Option B |
| `CF_API_KEY` | Your Global API Key | Option B |

Use Option A or Option B — not both. The Worker checks for `CF_API_TOKEN` first.

---

## Customization

### Page title and excluded apps

Edit `src/config.js` (see [Create your config](#create-your-config) above).

### Custom icon slugs (dashboardicons overrides)

The Worker auto-slugs app names (e.g. `"Node Red"` → `node-red`) to look up icons at dashboardicons.com. When the auto-slug doesn't match, add an override in `DASH_ICON_OVERRIDES` in `src/config.js`:

```js
export const DASH_ICON_OVERRIDES = {
  'nodered':        'node-red',
  'homeassistant':  'home-assistant',
  'myapp':          null,   // skip dashboardicons entirely
};
```

Browse available icons at [dashboardicons.com](https://dashboardicons.com).

### Local icon files

For apps not in dashboardicons, add PNG files to `public/icons/` and map them in `LOCAL_ICONS` in `src/config.js`:

```js
export const LOCAL_ICONS = [
  ['myapp',    'myapp.png'],
  ['otherapp', 'other.png'],
];
```

Files in `public/icons/` are served at `/icons/filename.png`.

### Custom entries (non-Cloudflare services)

In **edit mode**, click **+ Add** to add a bookmark for any service — enter a name, URL, and optional icon URL. Custom entries are saved to KV alongside your layout and support all the same edit-mode features (drag/drop, rename, custom icon).

### Controlling which apps appear

Only apps with **"Show in App Launcher"** enabled in Zero Trust are shown. To hide an app from the homepage without adding it to `EXCLUDE`, turn off that toggle in the Zero Trust dashboard (Access → Applications → your app → Experience settings).

### Favicon and header icon

The header shows `favicon-whitebg.ico` in light mode and `favicon-dark.ico` in dark mode. The browser tab favicon switches the same way. Replace these files in `public/` with your own icons.

### Cache duration

The Access apps list is cached for 5 minutes by default. To change it, edit `API_CACHE_TTL` at the top of `src/index.js`:

```js
const API_CACHE_TTL = 300; // seconds
```

---

## Custom domain

To use a domain you own (e.g. `home.example.com`) instead of the workers.dev URL:

1. Your domain must be on Cloudflare (free plan works)
2. Go to **Workers & Pages** → **cf-homepage** → **Settings** → **Domains & Routes**
3. Click **Add** → **Custom Domain** → enter your domain
4. Cloudflare handles DNS and the certificate automatically

---

## Protect with Cloudflare Access

To require login before anyone can see your homepage:

1. Go to **Zero Trust** → **Access** → **Applications** → **Add an application** → **Self-hosted**
2. Name: `Homepage` (or anything)
3. Domain: your workers.dev URL or custom domain
4. Add a policy (e.g. allow your email address, or your home IP)
5. Save

Cloudflare will intercept requests and require authentication before the Worker runs.

---

## Local development

You'll need Node.js (v18+) for local dev:

```bash
brew install node   # macOS
```

Or use Docker (no Node install required):

```bash
docker run --rm -it \
  -v $(pwd):/app -w /app \
  -p 8787:8787 \
  node:22-alpine \
  sh -c "npm install && npx wrangler dev --ip 0.0.0.0"
```

Then open [http://localhost:8787](http://localhost:8787).

Create a `.dev.vars` file (gitignored) with your runtime secrets:

```
CF_API_EMAIL=your@email.com
CF_API_KEY=your_global_api_key
```

---

## Troubleshooting

### "Cloudflare API error: 400 Bad Request"

The Worker runtime secrets (`CF_API_EMAIL` / `CF_API_KEY` or `CF_API_TOKEN`) are not set or are incorrect. Go to **Workers & Pages** → **cf-homepage** → **Settings** → **Variables and Secrets** and verify them.

### "Cloudflare API error: 403 Forbidden"

Your API credentials don't have permission to read Access apps. If using a scoped token, make sure it has **Access: Apps and Policies → Read** permission. If using a Global API Key, double-check the email address.

### GitHub Actions deploy fails at "Install dependencies"

Make sure you're using `npm install` (not `npm ci`) — there's no `package-lock.json` in this repo.

### GitHub Actions deploy fails with auth error

Check that `CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL` (or `CLOUDFLARE_API_TOKEN`) are set as repository secrets: **Settings** → **Secrets and variables** → **Actions**.

### App appears in Zero Trust but not on the homepage

Check that **"Show in App Launcher"** is enabled for the app (Access → Applications → your app → Experience settings).

### Icons not loading / showing letter avatars

- Check [dashboardicons.com](https://dashboardicons.com) for the correct slug and add an override in `DASH_ICON_OVERRIDES` in `src/config.js`
- Add a local icon to `public/icons/` and map it in `LOCAL_ICONS`

### Layout not saving

Make sure you've created a KV namespace and set its ID in `wrangler.toml` (see [Cloudflare setup](#cloudflare-setup)). If the Worker logs show "KV not configured", the binding is missing.

### Re-trigger a deploy without pushing code

```bash
gh workflow run "Deploy to Cloudflare Workers"
# or re-run the last run:
gh run rerun --failed
```

---

## License

MIT
