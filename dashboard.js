const el = (id) => document.getElementById(id);
const state = { map: null, marker: null, reports: [], photos: [], hasMedia: false };
function getSession() { try { return JSON.parse(localStorage.getItem('civic_session') || 'null'); } catch (e) { return null; } }

(function () {
  const s = getSession();
  if (!s) { window.location.href = 'Index.html'; return; }
  const w = el('welcomeText');
  if (w) {
    const name = (s.name && s.name.trim()) || s.identifier || 'citizen';
    w.textContent = 'Welcome back, ' + name;
  }
})();

function getPublic() { try { return JSON.parse(localStorage.getItem('civic_public') || '[]'); } catch (e) { return [] } }
function setPublic(arr) { localStorage.setItem('civic_public', JSON.stringify(arr)); }
function getVotes() { try { return JSON.parse(localStorage.getItem('civic_votes') || '{}'); } catch (e) { return {} } }
function setVotes(obj) { localStorage.setItem('civic_votes', JSON.stringify(obj)); }
function getDeviceId() { let id = localStorage.getItem('civic_device'); if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); localStorage.setItem('civic_device', id); } return id; }
function getUsers() { try { return JSON.parse(localStorage.getItem('civic_users') || '[]'); } catch (e) { return [] } }
function getReports() { try { return JSON.parse(localStorage.getItem('civic_reports') || '[]'); } catch (e) { return [] } }
function setReports(arr) { localStorage.setItem('civic_reports', JSON.stringify(arr)); }
function getAssignments() { try { return JSON.parse(localStorage.getItem('civic_assignment') || '{}'); } catch (e) { return {} } }
function nameByUserId(id) { if (!id) return '—'; const u = getUsers().find(x => x.id === id); return (u && (u.name || u.identifier)) || '—'; }
function now() { return Date.now(); }
function updateCounts() {
  const mc = el('myCount');
  const pc = el('pubCount');
  if (mc && typeof getReports === 'function') mc.textContent = String(getReports().length);
  if (pc) pc.textContent = String(getPublic().length);
  refreshOverview();
}

function refreshOverview() {
  const totalEl = el('statTotalIssues');
  if (!totalEl || typeof getReports !== 'function') return;
  const reports = getReports();
  const total = reports.length;
  const pending = reports.filter(r => r.status === 'pending').length;
  const resolved = reports.filter(r => r.status === 'resolved').length;
  const publicCount = getPublic().length;

  totalEl.textContent = String(total);
  const pEl = el('statPending');
  if (pEl) pEl.textContent = String(pending);
  const rEl = el('statResolved');
  if (rEl) rEl.textContent = String(resolved);
  const pubEl = el('statPublic');
  if (pubEl) pubEl.textContent = String(publicCount);

  const recentRoot = el('recentList');
  const recentEmpty = el('recentEmpty');
  if (!recentRoot || !recentEmpty) return;

  recentRoot.innerHTML = '';
  if (!reports.length) {
    recentEmpty.classList.remove('hidden');
    recentRoot.classList.add('hidden');
    return;
  }

  recentEmpty.classList.add('hidden');
  recentRoot.classList.remove('hidden');
  const recent = reports.slice(0, 4);
  for (const r of recent) {
    const li = document.createElement('li');
    li.className = 'recent-item';
    const title = (!r.encrypted && r.details && r.details.title) ? r.details.title : (r.category || 'Issue');
    const time = new Date(r.ts).toLocaleString();
    const status = r.status || 'pending';
    li.innerHTML = `<div class="recent-main">${title}</div><div class="recent-meta">${r.category || ''} • ${status} • ${time}</div>`;
    recentRoot.appendChild(li);
  }
}

function base64ToBuf(b64) { const bin = atob(b64); const len = bin.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i); return bytes.buffer; }

async function deriveKey(pass, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pass), { name: 'PBKDF2' }, false, ['deriveKey']);
  return await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function decryptJSON(payload, pass) {
  const salt = new Uint8Array(base64ToBuf(payload.salt));
  const iv = new Uint8Array(base64ToBuf(payload.iv));
  const key = await deriveKey(pass, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBuf(payload.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

function categoryWeight(cat) {
  const map = {
    'Public Safety': 30,
    'Traffic': 15,
    'Health': 25,
    'Garbage': 25,
    'Infrastructure': 20,
    'Drainage': 20,
    'Water': 22,
    'Electricity': 22,
    'Sanitation': 18,
    'Fire': 18,
    'Environment': 15,
    'Road Damage': 15,
    'Other': 5
  };
  return map[cat] || 10;
}
function recencyScore(ts) {
  const hours = Math.max(0, (now() - ts) / 36e5);
  const v = Math.round(30 * Math.exp(-hours / 72));
  return v;
}
function priorityScore(r) {
  const sev = Number(r.severity || 3);
  const cw = categoryWeight(r.category);
  const rc = recencyScore(r.ts);
  const media = r.hasMedia ? 5 : 0;
  const unresolved = r.status === 'pending' ? 5 : 0;
  let score = sev * 12 + cw + rc + media + unresolved;
  if (score > 100) score = Math.min(100, Math.round(80 + (score - 80) * 0.5));
  return Math.max(0, Math.min(100, Math.round(score)));
}

function updateScorePreview() {
  const catValue = el('category').value;
  if (!catValue) {
    el('scorePreview').textContent = '–';
    return;
  }
  const r = { category: catValue, severity: el('severity').value, ts: now(), hasMedia: state.photos.length > 0, status: 'pending' };
  el('scorePreview').textContent = String(priorityScore(r));
  updateProgressIndicator();
}

function severityPill(sev) {
  const s = Number(sev) || 1;
  const map = {
    1: { bg: 'rgba(148,163,184,.15)', fg: '#cbd5e1', bd: 'rgba(148,163,184,.35)' },
    2: { bg: 'rgba(234,179,8,.12)', fg: '#fde68a', bd: 'rgba(234,179,8,.35)' },
    3: { bg: 'rgba(249,115,22,.12)', fg: '#fdba74', bd: 'rgba(249,115,22,.35)' },
    4: { bg: 'rgba(239,68,68,.12)', fg: '#fca5a5', bd: 'rgba(239,68,68,.35)' },
    5: { bg: 'rgba(190,18,60,.12)', fg: '#fecaca', bd: 'rgba(190,18,60,.35)' }
  };
  const c = map[s] || map[1];
  return `<span class="pill" style="background:${c.bg};color:${c.fg};border-color:${c.bd}">Severity ${s}</span>`;
}

function toggle(section) {
  const sOverview = el('overviewSection');
  const sRep = el('reportSection');
  const sList = el('listSection');
  const sPub = el('publicSection');
  if (!sRep || !sList || !sPub) return;

  if (sOverview) {
    sOverview.classList.toggle('hidden', section !== 'overview');
  }

  sRep.classList.toggle('hidden', section !== 'report');
  sList.classList.toggle('hidden', section !== 'list');
  sPub.classList.toggle('hidden', section !== 'public');

  const links = document.querySelectorAll('[data-section-link]');
  links.forEach(btn => {
    const target = btn.getAttribute('data-section-link');
    btn.classList.toggle('active', target === section);
  });

  if (section === 'list') renderList();
  if (section === 'public') renderFeed();
}

function ensureMap() {
  if (state.map) return;
  el('map').classList.remove('hidden');
  const lat = parseFloat(el('lat').value) || 20.5937; const lng = parseFloat(el('lng').value) || 78.9629;
  state.map = L.map('map').setView([lat, lng], (lat === 20.5937 ? 5 : 15));
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(state.map);
  state.marker = L.marker([lat, lng], { draggable: true }).addTo(state.map);
  state.marker.on('dragend', () => {
    const p = state.marker.getLatLng(); el('lat').value = p.lat.toFixed(6); el('lng').value = p.lng.toFixed(6);
  });
}

function setMarker(lat, lng) { ensureMap(); state.map.setView([lat, lng], 16); state.marker.setLatLng([lat, lng]); el('lat').value = lat.toFixed(6); el('lng').value = lng.toFixed(6); }

function dataURLFromImage(img, maxSize) {
  const canvas = document.createElement('canvas');
  let w = img.naturalWidth, h = img.naturalHeight; const m = maxSize;
  if (w > h && w > m) { h = Math.round(h * (m / w)); w = m } else if (h > m) { w = Math.round(w * (m / h)); h = m }
  canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.7);
}

async function compressFileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => { try { resolve(dataURLFromImage(img, 1280)); } catch (e) { reject(e) } }; img.onerror = reject; img.src = fr.result; };
    fr.onerror = reject; fr.readAsDataURL(file);
  });
}

function clearForm() {
  el('title').value = '';
  el('description').value = '';
  el('category').value = '';
  document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
  const fileInput = el('photoFileInput');
  if (fileInput) fileInput.value = '';
  el('photoPreview').innerHTML = '';
  state.photos = [];
  state.hasMedia = false;
  el('anonymous').checked = false;
  el('contactEmail').value = '';
  el('contactPhone').value = '';
  const ln = el('locationNote');
  if (ln) ln.value = '';
  resetProgressIndicator();
}

function renderPhotoPreview() {
  const root = el('photoPreview'); root.innerHTML = '';
  state.photos.forEach((d, i) => {
    const wrap = document.createElement('div'); wrap.className = 'thumb-wrap';
    const im = new Image(); im.src = d; im.className = 'thumb';
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'thumb-remove'; rm.textContent = '×';
    rm.addEventListener('click', () => { state.photos.splice(i, 1); state.hasMedia = state.photos.length > 0; renderPhotoPreview(); updateScorePreview(); });
    wrap.appendChild(im); wrap.appendChild(rm); root.appendChild(wrap);
  });
}

async function saveReport() {
  const title = el('title').value.trim();
  const category = el('category').value;
  const severity = Number(el('severity').value);
  const description = el('description').value.trim();
  const anonymous = el('anonymous').checked;
  const contact = anonymous ? {} : { email: el('contactEmail').value.trim(), phone: el('contactPhone').value.trim() };
  const lat = parseFloat(el('lat').value) || null; const lng = parseFloat(el('lng').value) || null;
  const locationNote = (el('locationNote') && el('locationNote').value) ? el('locationNote').value.trim() : '';
  if (title.length < 3) { alert('Please enter a longer title (min 3 characters).'); return; }
  const ts = now();
  const assignedTo = (getAssignments()[category]) || undefined;
  const base = { id: (crypto.randomUUID ? crypto.randomUUID() : String(ts)), ts, category, severity, status: 'pending', location: lat && lng ? { lat, lng } : null, anonymous, encrypted: false, hasMedia: state.photos.length > 0, assignedTo, assignedAt: assignedTo ? ts : undefined };
  const details = { title, description, locationNote, photos: state.photos, contact };
  const toSave = { ...base, details };
  const arr = getReports();
  arr.unshift(toSave);
  setReports(arr);
  updateCounts();
  clearForm(); updateScorePreview();
  el('submitMsg').classList.remove('hidden'); setTimeout(() => el('submitMsg').classList.add('hidden'), 1500);
}

function renderList() {
  state.reports = getReports();
  const fc = el('filterCategory').value; const fs = currentStatusFilter || ''; const q = el('searchText').value.toLowerCase(); const sort = el('sortBy').value;
  let items = state.reports.map(r => ({ ...r, score: priorityScore(r) }));
  if (fc) items = items.filter(r => r.category === fc);
  if (fs) items = items.filter(r => r.status === fs);
  if (q) {
    items = items.filter(r => {
      if (!r.encrypted && r.details) { const s = (r.details.title || '') + ' ' + (r.details.description || ''); return s.toLowerCase().includes(q); }
      return false;
    });
  }
  if (sort === 'new') items.sort((a, b) => b.ts - a.ts); else if (sort === 'severity') items.sort((a, b) => b.severity - a.severity); else items.sort((a, b) => b.score - a.score);
  const root = el('list'); root.innerHTML = '';
  for (const r of items) {
    const wrap = document.createElement('div'); wrap.className = 'item';
    const h = document.createElement('h4'); h.textContent = (!r.encrypted && r.details && r.details.title) ? r.details.title : (r.category + " • " + new Date(r.ts).toLocaleString());
    const m = document.createElement('div'); m.className = 'meta'; m.innerHTML = `<span>${r.category}</span>${severityPill(r.severity)}<span>${new Date(r.ts).toLocaleString()}</span><span class="pill ${r.status === 'pending' ? 'pill-pending' : 'pill-resolved'}">${r.status}</span><span>Assignee ${nameByUserId(r.assignedTo)}</span><span class="score">Score ${r.score}</span>`;
    const body = document.createElement('div'); body.style.marginTop = '6px';
    if (!r.encrypted && r.details) {
      const p = document.createElement('p'); p.style.fontSize = '13px'; p.style.color = '#cbd5e1'; p.textContent = r.details.description || ''; body.appendChild(p);
      if (r.details.locationNote) { const loc = document.createElement('p'); loc.style.fontSize = '12px'; loc.style.color = '#9ca3af'; loc.textContent = 'Location: ' + r.details.locationNote; body.appendChild(loc); }
      if (r.details.photos && r.details.photos.length) { const pv = document.createElement('div'); pv.className = 'preview'; for (const d of r.details.photos) { const im = new Image(); im.src = d; im.className = 'thumb'; pv.appendChild(im); } body.appendChild(pv); }
    } else {
      const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Encrypted details'; body.appendChild(p);
    }
    const actions = document.createElement('div'); actions.className = 'inline'; actions.style.marginTop = '8px';
    const btnResolve = document.createElement('button'); btnResolve.textContent = r.status === 'pending' ? 'Mark resolved' : 'Mark pending'; btnResolve.addEventListener('click', () => { r.status = r.status === 'pending' ? 'resolved' : 'pending'; const all = getReports(); const idx = all.findIndex(x => x.id === r.id); if (idx > -1) { all[idx].status = r.status; setReports(all); renderList(); } });
    actions.appendChild(btnResolve);
    if (r.location) { const btnMap = document.createElement('button'); btnMap.className = 'ghost'; btnMap.textContent = 'View map'; btnMap.addEventListener('click', () => { const lat = r.location.lat, lng = r.location.lng; const url = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=16/' + lat + '/' + lng; window.open(url, '_blank'); }); actions.appendChild(btnMap); }
    if (r.encrypted) { const btnDec = document.createElement('button'); btnDec.className = 'ghost'; btnDec.textContent = 'Decrypt'; btnDec.addEventListener('click', async () => { const pass = prompt('Passphrase'); if (!pass) return; try { const d = await decryptJSON(r.payload, pass); body.innerHTML = ''; const p = document.createElement('p'); p.style.fontSize = '13px'; p.style.color = '#cbd5e1'; p.textContent = d.description || ''; body.appendChild(p); if (d.photos && d.photos.length) { const pv = document.createElement('div'); pv.className = 'preview'; for (const s of d.photos) { const im = new Image(); im.src = s; im.className = 'thumb'; pv.appendChild(im); } body.appendChild(pv); } h.textContent = d.title || h.textContent; } catch (e) { alert('Decryption failed'); } }); actions.appendChild(btnDec); }
    if (!r.encrypted) {
      const pubAll = getPublic();
      const isPublished = pubAll.some(p => (p.sourceId || p.id) === r.id);
      const btnPub = document.createElement('button');
      btnPub.className = 'ghost';
      btnPub.textContent = isPublished ? 'Unpublish' : 'Publish';
      btnPub.addEventListener('click', () => {
        let feed = getPublic();
        if (isPublished) {
          feed = feed.filter(p => (p.sourceId || p.id) !== r.id);
          setPublic(feed); renderList(); if (!el('publicSection').classList.contains('hidden')) renderFeed(); updateCounts();
        } else {
          const details = r.details || {};
          const item = { id: r.id, sourceId: r.id, ts: r.ts, category: r.category, severity: r.severity, status: r.status, location: r.location || null, hasMedia: r.hasMedia, title: details.title || '', description: details.description || '', locationNote: details.locationNote || '', photos: details.photos || [], votes: 0 };
          const ids = new Set(feed.map(p => p.sourceId || p.id));
          if (!ids.has(item.sourceId)) { feed.unshift(item); setPublic(feed); renderList(); if (!el('publicSection').classList.contains('hidden')) renderFeed(); updateCounts(); }
        }
      });
      actions.appendChild(btnPub);
    }
    const btnDel = document.createElement('button'); btnDel.className = 'ghost'; btnDel.textContent = 'Delete'; btnDel.addEventListener('click', () => { if (!confirm('Delete this report?')) return; const all = getReports().filter(x => x.id !== r.id); setReports(all); const feed = getPublic().filter(p => (p.sourceId || p.id) !== r.id); setPublic(feed); renderList(); if (!el('publicSection').classList.contains('hidden')) renderFeed(); updateCounts(); }); actions.appendChild(btnDel);
    wrap.appendChild(h); wrap.appendChild(m); wrap.appendChild(body); wrap.appendChild(actions);
    root.appendChild(wrap);
  }
}

function renderFeed() {
  let items = getPublic().slice();
  const fc = el('feedFilterCategory').value; const sort = el('feedSortBy').value; const q = el('feedSearchText').value.toLowerCase();
  if (fc) items = items.filter(r => r.category === fc);
  if (q) items = items.filter(r => (((r.title || '') + ' ' + (r.description || '') + ' ' + (r.locationNote || '')).toLowerCase().includes(q)));
  if (sort === 'new') items.sort((a, b) => b.ts - a.ts); else if (sort === 'score') items.sort((a, b) => priorityScore(b) - priorityScore(a)); else items.sort((a, b) => (b.votes || 0) - (a.votes || 0));
  const root = el('feedList'); root.innerHTML = ''; const votedMap = getVotes();
  for (const r of items) {
    const wrap = document.createElement('div'); wrap.className = 'item';
    const h = document.createElement('h4'); h.textContent = (r.title && r.title.trim()) ? r.title : (r.category + " • " + new Date(r.ts).toLocaleString());
    const m = document.createElement('div'); m.className = 'meta'; m.innerHTML = `<span>${r.category}</span>${severityPill(r.severity)}<span>${new Date(r.ts).toLocaleString()}</span><span class="score">Score ${priorityScore(r)}</span><span>Votes ${(r.votes || 0)}</span>`;
    const body = document.createElement('div'); body.style.marginTop = '6px';
    if (r.description) { const p = document.createElement('p'); p.style.fontSize = '13px'; p.style.color = '#cbd5e1'; p.textContent = r.description; body.appendChild(p); }
    if (r.locationNote) { const loc = document.createElement('p'); loc.style.fontSize = '12px'; loc.style.color = '#9ca3af'; loc.textContent = 'Location: ' + r.locationNote; body.appendChild(loc); }
    if (r.photos && r.photos.length) { const pv = document.createElement('div'); pv.className = 'preview'; for (const s of r.photos) { const im = new Image(); im.src = s; im.className = 'thumb'; pv.appendChild(im); } body.appendChild(pv); }
    const actions = document.createElement('div'); actions.className = 'inline'; actions.style.marginTop = '8px';
    if (r.location) { const btnMap = document.createElement('button'); btnMap.className = 'ghost'; btnMap.textContent = 'View map'; btnMap.addEventListener('click', () => { const lat = r.location.lat, lng = r.location.lng; const url = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=16/' + lat + '/' + lng; window.open(url, '_blank'); }); actions.appendChild(btnMap); }
    const btnVote = document.createElement('button'); btnVote.textContent = votedMap[r.id] ? 'Voted' : 'Vote'; if (votedMap[r.id]) btnVote.disabled = true;
    btnVote.addEventListener('click', () => {
      const votes = getVotes(); if (votes[r.id]) { alert('You already voted for this'); return; }
      votes[r.id] = now(); setVotes(votes);
      const pub = getPublic(); const idx = pub.findIndex(p => p.id === r.id); if (idx > -1) { pub[idx].votes = (pub[idx].votes || 0) + 1; setPublic(pub); }
      renderFeed();
    });
    actions.appendChild(btnVote);
    wrap.appendChild(h); wrap.appendChild(m); wrap.appendChild(body); wrap.appendChild(actions);
    root.appendChild(wrap);
  }
}

// Event wiring
document.querySelectorAll('[data-section-link]').forEach(btn => {
  btn.addEventListener('click', () => toggle(btn.getAttribute('data-section-link')));
});
el('logoutBtn').addEventListener('click', () => { try { localStorage.removeItem('civic_session'); } catch (e) { } window.location.href = 'Index.html'; });

el('severity').addEventListener('input', () => { el('sevVal').textContent = el('severity').value; updateScorePreview(); });
el('title').addEventListener('input', updateProgressIndicator);
el('description').addEventListener('input', updateProgressIndicator);

el('anonymous').addEventListener('change', () => { el('contactFields').classList.toggle('hidden', el('anonymous').checked); });

el('initMapBtn').addEventListener('click', ensureMap);
el('locateBtn').addEventListener('click', () => {
  navigator.geolocation.getCurrentPosition(pos => { const { latitude, longitude } = pos.coords; setMarker(latitude, longitude); }, err => { ensureMap(); alert('Location unavailable'); }, { enableHighAccuracy: true, timeout: 8000 });
});

const photoInput = el('photoFileInput');
if (photoInput) {
  photoInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    if (!files.length) return;
    try { const urls = await Promise.all(files.map(f => compressFileToDataURL(f))); state.photos.push(...urls); state.hasMedia = state.photos.length > 0; renderPhotoPreview(); updateScorePreview(); }
    catch (err) { alert('Could not process photo(s)'); }
  });
}

el('submitBtn').addEventListener('click', saveReport);

document.addEventListener('click', (ev) => {
  if (ev.target && ev.target.id === 'feedExportBtn') {
    const data = JSON.stringify(getPublic());
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'civic_public_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json'; a.click(); URL.revokeObjectURL(a.href);
  }
});
el('feedImportBtn') && el('feedImportBtn').addEventListener('click', () => el('feedImportFile').click());
el('feedImportFile') && el('feedImportFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return; try { const txt = await f.text(); const arr = JSON.parse(txt); if (!Array.isArray(arr)) throw new Error('invalid'); const existing = getPublic(); const ids = new Set(existing.map(r => r.id)); const merged = [...arr.filter(r => !ids.has(r.id)), ...existing]; setPublic(merged); renderFeed(); updateCounts(); alert('Imported'); } catch (err) { alert('Import failed'); }
  e.target.value = '';
});

function goReportWithCategory(cat) {
  toggle('report');
  selectCategory(cat);
}

const qaReport = el('qaReport');
if (qaReport) qaReport.addEventListener('click', () => toggle('report'));
[
  ['qaDrainage', 'Drainage'],
  ['qaGarbage', 'Garbage'],
  ['qaRoad', 'Road Damage'],
  ['qaFire', 'Fire'],
  ['qaElectricity', 'Electricity'],
].forEach(([id, cat]) => {
  function selectCategory(category) {
    const cards = document.querySelectorAll('.category-card');
    cards.forEach(card => {
      if (card.dataset.category === category) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
    el('category').value = category;
    updateScorePreview();
  }

  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      selectCategory(card.dataset.category);
    });
  });

  // Progress indicator functions
  function updateProgressIndicator() {
    const steps = document.querySelectorAll('.progress-step');
    const catValue = el('category').value;
    const titleValue = el('title').value.trim();
    const descValue = el('description').value.trim();

    // Step 1: Category
    if (catValue) {
      steps[0].classList.add('completed');
      steps[0].classList.remove('active');
      steps[0].querySelector('.progress-check').classList.remove('hidden');
      steps[0].querySelector('.progress-number').style.display = 'none';
    } else {
      steps[0].classList.add('active');
      steps[0].classList.remove('completed');
      steps[0].querySelector('.progress-check').classList.add('hidden');
      steps[0].querySelector('.progress-number').style.display = 'block';
    }

    // Step 2: Details
    if (catValue && titleValue && descValue) {
      steps[1].classList.add('completed');
      steps[1].classList.remove('active');
      steps[1].querySelector('.progress-check').classList.remove('hidden');
      steps[1].querySelector('.progress-number').style.display = 'none';
    } else if (catValue) {
      steps[1].classList.add('active');
      steps[1].classList.remove('completed');
      steps[1].querySelector('.progress-check').classList.add('hidden');
      steps[1].querySelector('.progress-number').style.display = 'block';
    } else {
      steps[1].classList.remove('active', 'completed');
      steps[1].querySelector('.progress-check').classList.add('hidden');
      steps[1].querySelector('.progress-number').style.display = 'block';
    }

    // Step 3: Submit
    if (catValue && titleValue && descValue) {
      steps[2].classList.add('active');
    } else {
      steps[2].classList.remove('active');
    }
  }

  function resetProgressIndicator() {
    const steps = document.querySelectorAll('.progress-step');
    steps.forEach((step, idx) => {
      if (idx === 0) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
      step.classList.remove('completed');
      step.querySelector('.progress-check').classList.add('hidden');
      step.querySelector('.progress-number').style.display = 'block';
    });
  }

  // Drag and drop photo upload
  const dropZone = el('photoDropZone');
  if (dropZone) {
    dropZone.addEventListener('click', () => {
      el('photoFileInput').click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');

      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, 4 - state.photos.length);
      if (!files.length) return;

      try {
        const urls = await Promise.all(files.map(f => compressFileToDataURL(f)));
        state.photos.push(...urls);
        state.hasMedia = state.photos.length > 0;
        renderPhotoPreview();
        updateScorePreview();
      } catch (err) {
        alert('Could not process photo(s)');
      }
    });
  }

  updateScorePreview();
  updateCounts();
  toggle('overview');
  resetProgressIndicator();

  // My Reports filters - Status chip filter
  let currentStatusFilter = '';
  document.querySelectorAll('.status-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.status-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStatusFilter = chip.dataset.status;
      renderList();
    });
  });

  // View toggle
  let currentView = 'grid';
  document.querySelectorAll('.view-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      document.querySelectorAll('.view-toggle').forEach(t => t.classList.remove('active'));
      toggle.classList.add('active');
      currentView = toggle.dataset.view;
      const listContainer = el('list');
      if (currentView === 'list') {
        listContainer.classList.remove('reports-grid');
        listContainer.classList.add('reports-list');
      } else {
        listContainer.classList.add('reports-grid');
        listContainer.classList.remove('reports-list');
      }
    });
  });

  // Empty state handling
  function checkEmptyState() {
    const reports = getReports();
    const emptyState = el('emptyState');
    const listContainer = el('list');
    if (reports.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (listContainer) listContainer.classList.add('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      if (listContainer) listContainer.classList.remove('hidden');
    }
  }

  // Update renderList to check empty state
  const originalRenderList = renderList;
  renderList = function () {
    originalRenderList();
    checkEmptyState();
  };
