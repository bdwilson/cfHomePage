// ── Theme ────────────────────────────────────────────────────────────────────

const themeBtn = document.getElementById('theme-toggle');
const root     = document.documentElement;

function applyTheme(t) {
  root.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
  const iconFile = t === 'dark' ? '/favicon-dark.ico' : '/favicon-whitebg.ico';
  document.getElementById('header-icon').src = iconFile;
  document.getElementById('favicon').href    = iconFile;
}

let savedTheme = 'light';
try { savedTheme = localStorage.getItem('theme') || 'light'; } catch (e) {}
applyTheme(savedTheme);

themeBtn.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch (e) {}
  applyTheme(next);
});

// ── Card navigation (non-edit mode) ─────────────────────────────────────────

document.addEventListener('click', e => {
  if (document.body.classList.contains('editing')) return;
  const card = e.target.closest('.card[data-href]');
  if (card && !e.target.closest('.action-btn')) {
    window.location.href = card.dataset.href;
  }
});

// ── Edit mode ────────────────────────────────────────────────────────────────

let sortableActive, sortableHidden;

document.getElementById('edit-btn').addEventListener('click', () => {
  document.body.classList.add('editing');
  document.querySelectorAll('.card-name').forEach(el => { el.contentEditable = 'true'; });
  ensureEmptyDrop();

  if (window.Sortable) { initSortable(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.4/Sortable.min.js';
  s.onload = initSortable;
  document.head.appendChild(s);
});

function initSortable() {
  const shared = { group: 'cards', animation: 150, ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen' };
  sortableActive = new Sortable(document.getElementById('active-grid'), {
    ...shared,
    onAdd(evt) { setBtn(evt.item, false); ensureEmptyDrop(); },
  });
  sortableHidden = new Sortable(document.getElementById('hidden-grid'), {
    ...shared,
    onAdd(evt) { setBtn(evt.item, true); ensureEmptyDrop(); },
  });
}

function setBtn(card, isHidden) {
  const btn = card.querySelector('.action-btn');
  if (!btn) return;
  if (isHidden) {
    btn.className = 'action-btn show-btn';
    btn.textContent = '+'; btn.title = 'Show'; btn.setAttribute('aria-label', 'Show');
    card.classList.add('hidden-card');
  } else {
    btn.className = 'action-btn hide-btn';
    btn.textContent = '✕'; btn.title = 'Hide'; btn.setAttribute('aria-label', 'Hide');
    card.classList.remove('hidden-card');
  }
}

// Hide / show / delete buttons
document.addEventListener('click', e => {
  if (!document.body.classList.contains('editing')) return;
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  e.stopPropagation();
  const card = btn.closest('.card');
  if (btn.classList.contains('delete-btn')) {
    card.remove();
    ensureEmptyDrop();
  } else if (btn.classList.contains('hide-btn')) {
    removeEmptyDrop('hidden-grid');
    document.getElementById('hidden-grid').appendChild(card);
    setBtn(card, true);
  } else {
    removeEmptyDrop('active-grid');
    document.getElementById('active-grid').appendChild(card);
    setBtn(card, false);
  }
  ensureEmptyDrop();
});

// Prevent drag from stealing focus from card-name
document.addEventListener('mousedown', e => {
  if (e.target.closest('.card-name') && document.body.classList.contains('editing')) {
    e.stopPropagation();
  }
}, true);

// ── Empty drop placeholders ───────────────────────────────────────────────────

function ensureEmptyDrop() {
  ['active-grid', 'hidden-grid'].forEach(id => {
    const grid = document.getElementById(id);
    const hasCards   = grid.querySelector('.card');
    const placeholder = grid.querySelector('.empty-drop');
    if (!hasCards && !placeholder) {
      const p = document.createElement('p');
      p.className = 'empty-drop';
      p.textContent = id === 'active-grid' ? 'No visible apps' : 'Drag apps here to hide them';
      grid.appendChild(p);
    } else if (hasCards && placeholder) {
      placeholder.remove();
    }
  });
}

function removeEmptyDrop(gridId) {
  const p = document.getElementById(gridId).querySelector('.empty-drop');
  if (p) p.remove();
}

// ── Cancel ───────────────────────────────────────────────────────────────────

document.getElementById('cancel-btn').addEventListener('click', () => location.reload());

// ── Save ─────────────────────────────────────────────────────────────────────

document.getElementById('save-btn').addEventListener('click', async () => {
  const saveBtn  = document.getElementById('save-btn');
  const statusEl = document.getElementById('save-status');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  statusEl.textContent = '';

  const order  = [...document.querySelectorAll('#active-grid .card')].map(c => c.dataset.id);
  const hidden = [...document.querySelectorAll('#hidden-grid .card')].map(c => c.dataset.id);
  const names = {}, icons = {}, custom = [];

  document.querySelectorAll('.card').forEach(card => {
    if (card.dataset.custom) {
      custom.push({
        id:   card.dataset.id,
        name: card.querySelector('.card-name').textContent.trim(),
        url:  card.dataset.href,
        icon: card.dataset.customIcon || null,
      });
      return;
    }
    const current = card.querySelector('.card-name').textContent.trim();
    if (current && current !== card.dataset.cfname) names[card.dataset.id] = current;
    if (card.dataset.customIcon) icons[card.dataset.id] = card.dataset.customIcon;
  });

  try {
    const res = await fetch('/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order, hidden, names, icons, custom }),
    });
    if (res.ok) { location.reload(); return; }
    throw new Error(res.statusText);
  } catch (err) {
    statusEl.textContent = 'Save failed';
    saveBtn.textContent = 'Save';
    saveBtn.disabled = false;
  }
});

// ── Icon popover ─────────────────────────────────────────────────────────────

let activePopover = null;

document.addEventListener('click', e => {
  if (!document.body.classList.contains('editing')) return;
  const img = e.target.closest('.card img');
  if (img) { e.stopPropagation(); openIconPopover(img); return; }
  if (activePopover && !e.target.closest('.icon-popover')) closeIconPopover();
}, true);

function openIconPopover(img) {
  closeIconPopover();
  const card    = img.closest('.card');
  const current = card.dataset.customIcon || '';
  const autoSrc = card.dataset.autoIcon   || '';

  const pop = document.createElement('div');
  pop.className = 'icon-popover';

  const preview = document.createElement('div');
  preview.className = 'icon-popover-preview';
  const prevImg = document.createElement('img');
  prevImg.src = current || autoSrc;
  prevImg.onerror = () => { prevImg.src = autoSrc; };
  const hint = document.createElement('span');
  hint.textContent = 'Enter URL, then Apply';
  preview.append(prevImg, hint);

  const input = document.createElement('input');
  input.type = 'url';
  input.placeholder = 'https://example.com/icon.png';
  input.value = current;

  const btns = document.createElement('div');
  btns.className = 'icon-popover-btns';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'reset-btn';
  resetBtn.textContent = 'Reset';
  const applyBtn = document.createElement('button');
  applyBtn.className = 'apply-btn';
  applyBtn.textContent = 'Apply';
  btns.append(resetBtn, applyBtn);

  pop.append(preview, input, btns);
  card.appendChild(pop);
  activePopover = { pop, img, card, prevImg };

  input.addEventListener('input', () => { if (input.value.trim()) prevImg.src = input.value.trim(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyIcon(input.value.trim()); }
    if (e.key === 'Escape') closeIconPopover();
  });
  applyBtn.addEventListener('click', e => { e.stopPropagation(); applyIcon(input.value.trim()); });
  resetBtn.addEventListener('click', e => {
    e.stopPropagation();
    delete card.dataset.customIcon;
    img.src = autoSrc;
    delete img.dataset.fb;
    closeIconPopover();
  });

  input.focus();
  input.select();
}

function applyIcon(url) {
  if (!activePopover) return;
  const { img, card } = activePopover;
  if (url) {
    card.dataset.customIcon = url;
    img.src = url;
    delete img.dataset.fb;
  }
  closeIconPopover();
}

function closeIconPopover() {
  if (activePopover) { activePopover.pop.remove(); activePopover = null; }
}

// ── Add custom entry ──────────────────────────────────────────────────────────

document.getElementById('add-custom-btn').addEventListener('click', openAddModal);

function letterAvatarUrl(name) {
  const letter  = name.charAt(0).toUpperCase() || '?';
  const palette = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e'];
  const bg      = palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42">` +
    `<rect width="42" height="42" rx="8" fill="${bg}"/>` +
    `<text x="21" y="29" font-family="system-ui,sans-serif" font-size="22" ` +
    `font-weight="bold" text-anchor="middle" fill="white">${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function openAddModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML =
    '<h3>Add entry</h3>' +
    '<label>Name<input type="text" id="ae-name" placeholder="My Service" autocomplete="off"></label>' +
    '<label>URL<input type="url" id="ae-url" placeholder="https://service.example.com" autocomplete="off"></label>' +
    '<label>Icon URL (optional)' +
      '<div class="modal-icon-row"><img id="ae-icon-preview" alt=""><input type="url" id="ae-icon" placeholder="https://example.com/icon.png" autocomplete="off"></div>' +
    '</label>' +
    '<div class="modal-btns"><button class="modal-cancel-btn">Cancel</button><button class="modal-add-btn">Add</button></div>';

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const nameInput = modal.querySelector('#ae-name');
  const urlInput  = modal.querySelector('#ae-url');
  const iconInput = modal.querySelector('#ae-icon');
  const iconPrev  = modal.querySelector('#ae-icon-preview');

  iconInput.addEventListener('input', () => {
    const v = iconInput.value.trim();
    iconPrev.style.display = v ? 'block' : 'none';
    if (v) iconPrev.src = v;
  });

  function closeModal() { overlay.remove(); }
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  modal.querySelector('.modal-cancel-btn').addEventListener('click', closeModal);

  modal.querySelector('.modal-add-btn').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const url  = urlInput.value.trim();
    const icon = iconInput.value.trim();
    nameInput.style.borderColor = name ? '' : 'var(--danger)';
    urlInput.style.borderColor  = url  ? '' : 'var(--danger)';
    if (!name || !url) return;
    addCustomCard(name, url, icon || null);
    closeModal();
  });

  nameInput.focus();
}

function addCustomCard(name, url, icon) {
  const id     = `custom-${Date.now()}`;
  const avatar = letterAvatarUrl(name);
  const imgSrc = icon || avatar;
  const fb     = icon ? ` data-fb="${avatar}"` : '';

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id       = id;
  card.dataset.href     = url;
  card.dataset.custom   = 'true';
  card.dataset.cfname   = name;
  card.dataset.autoIcon = icon || avatar;
  if (icon) card.dataset.customIcon = icon;

  const btn = document.createElement('button');
  btn.className = 'action-btn delete-btn';
  btn.title = 'Delete';
  btn.setAttribute('aria-label', 'Delete');
  btn.textContent = '✕';

  const img = document.createElement('img');
  img.src = imgSrc;
  img.alt = '';
  img.width = 42;
  img.height = 42;
  if (icon) img.dataset.fb = avatar;
  img.onerror = function() { const f = this.dataset.fb; this.onerror = null; if (f) { delete this.dataset.fb; this.src = f; } };

  const span = document.createElement('span');
  span.className = 'card-name';
  span.contentEditable = 'true';
  span.textContent = name;

  card.append(btn, img, span);
  removeEmptyDrop('active-grid');
  document.getElementById('active-grid').prepend(card);
  ensureEmptyDrop();
}
