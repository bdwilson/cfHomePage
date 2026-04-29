import { ACCOUNT_ID, TITLE, EXCLUDE, DASH_ICON_OVERRIDES, LOCAL_ICONS } from './config.js';
const API_CACHE_TTL    = 300;
const DASHBOARD_ICONS  = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png';

// ─── Icon resolution ──────────────────────────────────────────────────────────

function dashIconUrl(name) {
  const lower = name.toLowerCase();
  for (const [key, slug] of Object.entries(DASH_ICON_OVERRIDES)) {
    if (lower.includes(key)) return slug ? `${DASHBOARD_ICONS}/${slug}.png` : null;
  }
  const slug = lower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return `${DASHBOARD_ICONS}/${slug}.png`;
}

function localIconUrl(name) {
  const lower = name.toLowerCase();
  for (const [key, file] of LOCAL_ICONS) {
    if (lower.includes(key)) return `/icons/${file}`;
  }
  return null;
}

function letterAvatar(name) {
  const letter  = name.charAt(0).toUpperCase();
  const palette = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e'];
  const bg      = palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42">` +
    `<rect width="42" height="42" rx="8" fill="${bg}"/>` +
    `<text x="21" y="29" font-family="system-ui,sans-serif" font-size="22" ` +
    `font-weight="bold" text-anchor="middle" fill="white">${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Resolves the auto-detected icon (ignoring any user custom override).
// Priority: logo_url → explicit DASH_ICON_OVERRIDES → local file → auto-slug dashboardicons → avatar
// Local icons beat auto-slugs to avoid firing 404 requests for guessed dashboardicons filenames.
function resolveAutoIcon(app) {
  const avatar = letterAvatar(app.name);
  if (app.logo_url) return { primary: app.logo_url, fallback: avatar };

  // Explicit dashboardicons override (including null entries that opt out)
  const lower = app.name.toLowerCase();
  for (const [key, slug] of Object.entries(DASH_ICON_OVERRIDES)) {
    if (lower.includes(key)) {
      const url = slug ? `${DASHBOARD_ICONS}/${slug}.png` : null;
      return { primary: url || avatar, fallback: url ? avatar : null };
    }
  }

  // Local icon wins over auto-slug to avoid unnecessary 404s
  const local = localIconUrl(app.name);
  if (local) return { primary: local, fallback: avatar };

  // Auto-slug to dashboardicons as best-effort last resort
  const slug = lower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const autoDash = `${DASHBOARD_ICONS}/${slug}.png`;
  return { primary: autoDash, fallback: avatar };
}

// Custom icon (from KV) takes top priority; falls back to auto-detected chain.
function resolveIcon(app) {
  if (app.customIcon) return { primary: app.customIcon, fallback: letterAvatar(app.name) };
  return resolveAutoIcon(app);
}

// ─── CF API fetch (cached) ────────────────────────────────────────────────────

async function fetchApps(env) {
  const cache    = caches.default;
  const cacheKey = new Request('https://cf-homepage-cache/api-apps-v2');
  const cached   = await cache.match(cacheKey);
  if (cached) return cached.json();

  const authHeaders = env.CF_API_TOKEN
    ? { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
    : { 'X-Auth-Email': env.CF_API_EMAIL, 'X-Auth-Key': env.CF_API_KEY };

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/access/apps`,
    { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error(`CF API ${res.status} ${res.statusText}`);

  const { result } = await res.json();
  const apps = result.filter(app =>
    app.app_launcher_visible &&
    !EXCLUDE.has(app.name) &&
    app.type !== 'warp' &&
    app.type !== 'app_launcher'
  );

  cache.put(cacheKey, new Response(JSON.stringify(apps), {
    headers: { 'Cache-Control': `public, max-age=${API_CACHE_TTL}` },
  })).catch(() => {});

  return apps;
}

// ─── Layout application ───────────────────────────────────────────────────────

function applyLayout(apps, layout) {
  const { order = [], hidden = [], names = {}, icons = {}, custom = [] } = layout;
  const hiddenSet = new Set(hidden);
  const orderIdx  = Object.fromEntries(order.map((id, i) => [id, i]));

  const enrich = app => ({
    ...app,
    displayName: names[app.id] || app.name,
    cfName:      app.name,
    customIcon:  icons[app.id] || (app.custom ? (app.icon || null) : null),
  });

  const customApps = custom.map(c => ({
    id:     c.id,
    name:   c.name,
    url:    c.url,
    icon:   c.icon || null,
    custom: true,
  }));

  const allApps = [...apps, ...customApps];

  const visible = allApps
    .filter(a => !hiddenSet.has(a.id))
    .map(enrich)
    .sort((a, b) => {
      const ia = orderIdx[a.id] ?? Infinity;
      const ib = orderIdx[b.id] ?? Infinity;
      return ia !== ib ? ia - ib : a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
    });

  const hiddenApps = allApps
    .filter(a => hiddenSet.has(a.id))
    .map(enrich)
    .sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));

  return { visible, hiddenApps };
}

// ─── HTML rendering ───────────────────────────────────────────────────────────

function renderCard(app, isHidden) {
  const { primary, fallback } = resolveIcon(app);
  const { primary: autoIcon }  = resolveAutoIcon(app);   // for Reset in edit mode
  const fb       = fallback ? ` data-fb="${fallback}"` : '';
  const custAttr = app.customIcon ? ` data-custom-icon="${app.customIcon.replace(/"/g, '&quot;')}"` : '';

  if (app.custom) {
    const href = app.url.replace(/"/g, '&quot;');
    return `<div class="card${isHidden ? ' hidden-card' : ''}" data-id="${app.id}" data-href="${href}" data-custom="true" data-cfname="${app.displayName.replace(/"/g, '&quot;')}" data-auto-icon="${autoIcon.replace(/"/g, '&quot;')}"${custAttr}>
      <button class="action-btn delete-btn" title="Delete" aria-label="Delete">✕</button>
      <img src="${primary}" alt="" width="42" height="42"${fb} onerror="var f=this.dataset.fb;this.onerror=null;if(f){this.removeAttribute('data-fb');this.src=f;}">
      <span class="card-name">${app.displayName}</span>
    </div>`;
  }

  const btnIcon  = isHidden ? '+' : '✕';
  const btnCls   = isHidden ? 'show-btn' : 'hide-btn';
  const btnTitle = isHidden ? 'Show' : 'Hide';
  return `<div class="card${isHidden ? ' hidden-card' : ''}" data-id="${app.id}" data-href="https://${app.domain}" data-cfname="${app.cfName.replace(/"/g, '&quot;')}" data-auto-icon="${autoIcon.replace(/"/g, '&quot;')}"${custAttr}>
      <button class="action-btn ${btnCls}" title="${btnTitle}" aria-label="${btnTitle}">${btnIcon}</button>
      <img src="${primary}" alt="" width="42" height="42"${fb} onerror="var f=this.dataset.fb;this.onerror=null;if(f){this.removeAttribute('data-fb');this.src=f;}">
      <span class="card-name">${app.displayName}</span>
    </div>`;
}

function renderPage(visible, hiddenApps) {
  const activeCards = visible.map(a => renderCard(a, false)).join('\n    ');
  const hiddenCards = hiddenApps.map(a => renderCard(a, true)).join('\n    ');
  const hiddenCount = hiddenApps.length;

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${TITLE}</title>
  <link id="favicon" rel="icon" href="/favicon.ico">
  <style>
    :root {
      --bg: #f4f6f9; --surface: #ffffff; --text: #1a1a2e;
      --subtext: #666; --border: #e0e4ea; --hover-bg: #eef2ff;
      --shadow: 0 1px 4px rgba(0,0,0,.08);
      --danger: #e74c3c; --success: #2ecc71;
    }
    [data-theme="dark"] {
      --bg: #12131a; --surface: #1e2030; --text: #e8eaf6;
      --subtext: #9fa8c7; --border: #2d3050; --hover-bg: #272a40;
      --shadow: 0 1px 4px rgba(0,0,0,.4);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui,-apple-system,sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding-bottom: 2rem; }

    /* ── Header ── */
    header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; background: var(--surface); border-bottom: 1px solid var(--border); box-shadow: var(--shadow); gap: 1rem; }
    .header-title { display: flex; align-items: center; gap: .6rem; }
    #header-icon { width: 36px; height: 36px; border-radius: 6px; object-fit: contain; flex-shrink: 0; }
    header h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: -.02em; }
    .header-btns { display: flex; gap: .5rem; align-items: center; }
    .btn { background: none; border: 1px solid var(--border); border-radius: 6px; color: var(--subtext); cursor: pointer; font-size: .85rem; padding: .4rem .8rem; transition: background .15s, color .15s; white-space: nowrap; }
    .btn:hover { background: var(--hover-bg); color: var(--text); }
    .btn-primary { background: #4a6cf7; border-color: #4a6cf7; color: #fff; font-weight: 600; }
    .btn-primary:hover { background: #3a5ce6; color: #fff; }
    .btn-danger { border-color: var(--danger); color: var(--danger); }
    .btn-danger:hover { background: var(--danger); color: #fff; }
    #edit-actions { display: none; align-items: center; gap: .5rem; }
    body.editing #edit-actions { display: flex; }
    body.editing #edit-btn { display: none; }

    /* ── Grid ── */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
    section.active-section { padding-top: 2rem; }

    /* ── Cards ── */
    .card { position: relative; display: flex; flex-direction: column; align-items: center; gap: .6rem; padding: 1.2rem .8rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); cursor: pointer; color: var(--text); text-decoration: none; transition: background .15s, transform .12s, box-shadow .12s, opacity .15s; user-select: none; }
    body:not(.editing) .card:hover { background: var(--hover-bg); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.12); }
    body.editing .card { cursor: grab; border-style: dashed; }
    body.editing .card:active { cursor: grabbing; }
    body.editing .card.sortable-ghost { opacity: .35; }
    body.editing .card.sortable-chosen { box-shadow: 0 8px 24px rgba(0,0,0,.18); transform: scale(1.03); }
    .card img { border-radius: 6px; object-fit: contain; pointer-events: none; }
    body.editing .card img { pointer-events: all; cursor: pointer; transition: opacity .15s; }
    body.editing .card img:hover { opacity: .75; outline: 2px dashed #4a6cf7; outline-offset: 2px; }

    /* ── Icon popover ── */
    .icon-popover { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 200; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: .75rem; box-shadow: 0 8px 24px rgba(0,0,0,.25); width: 240px; display: flex; flex-direction: column; gap: .5rem; }
    .icon-popover-preview { display: flex; align-items: center; gap: .6rem; }
    .icon-popover-preview img { width: 36px; height: 36px; border-radius: 6px; object-fit: contain; flex-shrink: 0; background: var(--bg); }
    .icon-popover-preview span { font-size: .75rem; color: var(--subtext); word-break: break-all; line-height: 1.3; }
    .icon-popover input[type="url"] { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: .35rem .6rem; font-size: .8rem; background: var(--bg); color: var(--text); outline: none; }
    .icon-popover input[type="url"]:focus { border-color: #4a6cf7; }
    .icon-popover-btns { display: flex; gap: .4rem; justify-content: flex-end; }
    .icon-popover-btns button { font-size: .78rem; padding: .3rem .6rem; border-radius: 5px; border: 1px solid var(--border); cursor: pointer; background: none; color: var(--text); }
    .icon-popover-btns .apply-btn { background: #4a6cf7; border-color: #4a6cf7; color: #fff; font-weight: 600; }
    .icon-popover-btns .reset-btn { color: var(--danger); border-color: var(--danger); }

    /* ── Card name ── */
    .card-name { font-size: .88rem; font-weight: 500; text-align: center; line-height: 1.3; pointer-events: none; }
    body.editing .card-name { pointer-events: all; cursor: text; border-bottom: 1px dashed var(--border); padding-bottom: 1px; min-width: 60px; outline: none; }
    body.editing .card-name:focus { border-bottom-color: #4a6cf7; color: var(--text); }

    /* ── Action buttons (hide/show) ── */
    .action-btn { display: none; position: absolute; top: 5px; right: 5px; width: 22px; height: 22px; border-radius: 50%; border: none; font-size: .75rem; font-weight: 700; cursor: pointer; align-items: center; justify-content: center; line-height: 1; transition: transform .1s; z-index: 2; }
    body.editing .action-btn { display: flex; }
    .hide-btn { background: var(--danger); color: #fff; }
    .hide-btn:hover { transform: scale(1.15); }
    .show-btn { background: var(--success); color: #fff; }
    .show-btn:hover { transform: scale(1.15); }
    .delete-btn { background: var(--danger); color: #fff; }
    .delete-btn:hover { transform: scale(1.15); }

    /* ── Add-entry modal ── */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 500; }
    .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; width: 320px; display: flex; flex-direction: column; gap: .8rem; box-shadow: 0 12px 40px rgba(0,0,0,.3); }
    .modal h3 { font-size: 1rem; font-weight: 700; }
    .modal label { display: flex; flex-direction: column; gap: .3rem; font-size: .8rem; color: var(--subtext); }
    .modal input[type="text"], .modal input[type="url"] { width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: .4rem .6rem; font-size: .85rem; background: var(--bg); color: var(--text); outline: none; }
    .modal input:focus { border-color: #4a6cf7; }
    .modal-icon-row { display: flex; align-items: center; gap: .6rem; }
    .modal-icon-row img { width: 36px; height: 36px; border-radius: 6px; object-fit: contain; background: var(--bg); display: none; flex-shrink: 0; }
    .modal-btns { display: flex; gap: .5rem; justify-content: flex-end; margin-top: .2rem; }
    .modal-btns button { font-size: .85rem; padding: .4rem .8rem; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; background: none; color: var(--text); }
    .modal-btns .modal-add-btn { background: #4a6cf7; border-color: #4a6cf7; color: #fff; font-weight: 600; }

    /* ── Hidden section ── */
    .hidden-section { max-width: 1100px; margin: 2rem auto 0; padding: 0 1.5rem; display: none; }
    body.editing .hidden-section { display: block; }
    .hidden-section h2 { font-size: .9rem; font-weight: 600; color: var(--subtext); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 1rem; padding-bottom: .5rem; border-bottom: 1px solid var(--border); }
    .hidden-card { opacity: .55; }
    body.editing .hidden-card:hover { opacity: .8; }

    /* ── Hidden count badge (non-edit mode) ── */
    .hidden-hint { text-align: center; font-size: .75rem; color: var(--subtext); margin-top: 1.5rem; }
    .hidden-hint a { color: var(--subtext); text-decoration: underline; cursor: pointer; }
    body.editing .hidden-hint { display: none; }

    /* ── Empty drop zone ── */
    .empty-drop { min-height: 80px; border: 2px dashed var(--border); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--subtext); font-size: .85rem; }

    /* ── Save status ── */
    #save-status { font-size: .8rem; color: var(--subtext); }

    .updated { text-align: center; font-size: .75rem; color: var(--subtext); margin-top: 1.5rem; }
  </style>
</head>
<body>
  <header>
    <div class="header-title">
      <img id="header-icon" src="/favicon-whitebg.ico" alt="">
      <h1>${TITLE}</h1>
    </div>
    <div class="header-btns">
      <button class="btn" id="theme-toggle">Dark mode</button>
      <button class="btn" id="edit-btn">✎ Edit</button>
      <div id="edit-actions">
        <span id="save-status"></span>
        <button class="btn" id="add-custom-btn">+ Add</button>
        <button class="btn" id="cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="save-btn">Save</button>
      </div>
    </div>
  </header>

  <section class="active-section">
    <div class="grid" id="active-grid">
    ${activeCards}
    </div>
  </section>

  ${hiddenCount > 0 ? `<p class="hidden-hint">${hiddenCount} app${hiddenCount > 1 ? 's' : ''} hidden &mdash; <a onclick="document.getElementById('edit-btn').click()">Edit</a> to manage</p>` : ''}

  <div class="hidden-section">
    <h2>Hidden apps</h2>
    <div class="grid" id="hidden-grid">
      ${hiddenCards || '<p class="empty-drop">Drag apps here to hide them</p>'}
    </div>
  </div>

  <p class="updated">Updated every 5 minutes from Cloudflare Zero Trust</p>

  <script src="/app.js" defer></script>
</body>
</html>`;
}

// ─── Worker entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Static assets
    if (url.pathname !== '/' && url.pathname !== '/save-layout') {
      return env.ASSETS.fetch(request);
    }

    // Save layout
    if (request.method === 'POST' && url.pathname === '/save-layout') {
      if (!env.LAYOUT) return new Response('KV not configured', { status: 501 });
      const { order = [], hidden = [], names = {}, icons = {}, custom = [] } = await request.json();
      await env.LAYOUT.put('layout', JSON.stringify({ order, hidden, names, icons, custom }));
      return new Response('OK', { status: 200 });
    }

    // Render page
    let apps;
    try {
      apps = await fetchApps(env);
    } catch (err) {
      return new Response(`Cloudflare API error: ${err.message}`, { status: 502 });
    }

    const layoutJson = env.LAYOUT ? await env.LAYOUT.get('layout') : null;
    const layout     = layoutJson ? JSON.parse(layoutJson) : {};
    const { visible, hiddenApps } = applyLayout(apps, layout);

    return new Response(renderPage(visible, hiddenApps), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  },
};
