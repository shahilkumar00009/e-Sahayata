const el = (id) => document.getElementById(id);
const CATS = ['Infrastructure','Public Safety','Health','Environment','Traffic','Sanitation','Water','Other'];

function getSession(){ try { return JSON.parse(localStorage.getItem('civic_session')||'null'); } catch(e){ return null; } }
function getUsers(){ try { return JSON.parse(localStorage.getItem('civic_users')||'[]'); } catch(e){ return [] } }
function setUsers(arr){ localStorage.setItem('civic_users', JSON.stringify(arr)); }
function getAssignments(){ try { return JSON.parse(localStorage.getItem('civic_assignment')||'{}'); } catch(e){ return {} } }
function setAssignments(map){ localStorage.setItem('civic_assignment', JSON.stringify(map)); }
function getReports(){ try { return JSON.parse(localStorage.getItem('civic_reports')||'[]'); } catch(e){ return [] } }
function setReports(arr){ localStorage.setItem('civic_reports', JSON.stringify(arr)); }

function uid(){ return (crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)); }

function ensureAdminSession(){ const s = getSession(); if(!s || s.role!=='admin'){ window.location.href = 'Index.html'; } }
ensureAdminSession();

function sha256Hex(str){ const enc=new TextEncoder().encode(str); return crypto.subtle.digest('SHA-256',enc).then(b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')); }

function renderReports(){
  const list = el('reportsList'); list.innerHTML='';
  const users = getUsers(); const subadmins = users.filter(u=>u.role==='subadmin');
  const nameById = (id)=> (users.find(u=>u.id===id)?.name || users.find(u=>u.id===id)?.identifier || '—');
  const fc = el('filterCategory').value; const fs = el('filterStatus').value; const fa = el('filterAssignee').value;
  let items = getReports();
  if(fc) items = items.filter(r=>r.category===fc);
  if(fs) items = items.filter(r=>r.status===fs);
  if(fa==='unassigned') items = items.filter(r=>!r.assignedTo);
  for(const r of items){
    const wrap = document.createElement('div'); wrap.className='item';
    const h = document.createElement('h4'); h.textContent = (r.details?.title || r.title || r.category+" • "+new Date(r.ts).toLocaleString()); wrap.appendChild(h);
    const meta = document.createElement('div'); meta.className='meta'; meta.innerHTML = `<span>${r.category}</span><span>Severity ${r.severity}</span><span>${new Date(r.ts).toLocaleString()}</span><span>Status ${r.status}</span><span>Assignee ${r.assignedTo?nameById(r.assignedTo):'—'}</span>`; wrap.appendChild(meta);
    const row = document.createElement('div'); row.style.marginTop='8px'; row.style.display='flex'; row.style.gap='8px';
    const sel = document.createElement('select');
    const opt0 = document.createElement('option'); opt0.value=''; opt0.textContent='Select sub-admin'; sel.appendChild(opt0);
    for(const s of subadmins){ const o=document.createElement('option'); o.value=s.id; o.textContent=`${s.name||s.identifier} (${(s.categories||[]).join(', ')})`; if(r.assignedTo===s.id) o.selected=true; sel.appendChild(o); }
    const btn = document.createElement('button'); btn.textContent='Assign'; btn.addEventListener('click',()=>{ const v=sel.value||''; const all=getReports(); const idx=all.findIndex(x=>x.id===r.id); if(idx>-1){ all[idx].assignedTo=v||undefined; all[idx].assignedAt=Date.now(); setReports(all); renderReports(); } });
    row.appendChild(sel); row.appendChild(btn); wrap.appendChild(row);
    list.appendChild(wrap);
  }
}

function renderUsers(){
  const list = el('usersList'); list.innerHTML=''; const users = getUsers();
  for(const u of users){
    const wrap = document.createElement('div'); wrap.className='item';
    const h = document.createElement('h4'); h.textContent = `${u.name||u.identifier||'User'} – ${u.role}`; wrap.appendChild(h);
    const meta = document.createElement('div'); meta.className='meta'; meta.innerHTML = `<span>${u.identifier||''}</span><span>Created ${u.createdAt?new Date(u.createdAt).toLocaleString():''}</span>${u.categories?`<span>Categories: ${(u.categories||[]).join(', ')}</span>`:''}`; wrap.appendChild(meta);
    list.appendChild(wrap);
  }
}

function renderSubadminForm(){
  const root = el('catChecks'); root.innerHTML='';
  for(const c of CATS){
    const w = document.createElement('label'); w.style.display='flex'; w.style.alignItems='center'; w.style.gap='6px';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.value=c; w.appendChild(cb); w.appendChild(document.createTextNode(c)); root.appendChild(w);
  }
}

function renderSubadmins(){
  const list = el('subsList'); list.innerHTML=''; const users = getUsers().filter(u=>u.role==='subadmin');
  for(const u of users){
    const wrap = document.createElement('div'); wrap.className='item';
    const h = document.createElement('h4'); h.textContent = `${u.name||u.identifier}`; wrap.appendChild(h);
    const meta = document.createElement('div'); meta.className='meta'; meta.innerHTML = `<span>${u.identifier}</span><span>Categories: ${(u.categories||[]).join(', ')||'—'}</span>`; wrap.appendChild(meta);
    const del = document.createElement('button'); del.className='ghost'; del.textContent='Delete'; del.addEventListener('click',()=>{ if(!confirm('Delete sub-admin?')) return; const all=getUsers().filter(x=>x.id!==u.id); setUsers(all); const as=getAssignments(); for(const k of Object.keys(as)){ if(as[k]===u.id) delete as[k]; } setAssignments(as); renderSubadmins(); renderReports(); });
    wrap.appendChild(del);
    list.appendChild(wrap);
  }
}

el('createSub').addEventListener('click', async ()=>{
  const name = el('subName').value.trim(); const email = el('subEmail').value.trim(); const pass = el('subPass').value;
  if(!name || !email || !pass){ alert('Fill all fields'); return; }
  const cats = Array.from(el('catChecks').querySelectorAll('input[type="checkbox"]:checked')).map(x=>x.value);
  const users = getUsers(); if(users.some(u=>u.identifier===email)){ alert('Email already exists'); return; }
  const id = 'sub-'+uid(); const hash = await sha256Hex(pass);
  users.push({ id, role:'subadmin', name, identifier: email, passwordHash: hash, categories: cats, createdAt: Date.now() }); setUsers(users);
  const as = getAssignments(); for(const c of cats){ as[c]=id; } setAssignments(as);
  el('createMsg').classList.remove('hidden'); setTimeout(()=>el('createMsg').classList.add('hidden'),1200);
  el('subName').value=''; el('subEmail').value=''; el('subPass').value=''; renderSubadmins(); renderReports();
});

// Filters
el('filterCategory').addEventListener('change', renderReports);
el('filterStatus').addEventListener('change', renderReports);
el('filterAssignee').addEventListener('change', renderReports);

// Tabs
el('tabReports').addEventListener('click', ()=>{ el('tabReports').classList.add('active'); el('tabUsers').classList.remove('active'); el('tabSubadmins').classList.remove('active'); el('reportsSec').classList.remove('hidden'); el('usersSec').classList.add('hidden'); el('subsSec').classList.add('hidden'); });
el('tabUsers').addEventListener('click', ()=>{ el('tabUsers').classList.add('active'); el('tabReports').classList.remove('active'); el('tabSubadmins').classList.remove('active'); el('usersSec').classList.remove('hidden'); el('reportsSec').classList.add('hidden'); el('subsSec').classList.add('hidden'); });
el('tabSubadmins').addEventListener('click', ()=>{ el('tabSubadmins').classList.add('active'); el('tabReports').classList.remove('active'); el('tabUsers').classList.remove('active'); el('subsSec').classList.remove('hidden'); el('usersSec').classList.add('hidden'); el('reportsSec').classList.add('hidden'); });

// Export utilities
el('exportUsers').addEventListener('click', ()=>{ const data=JSON.stringify(getUsers()); const blob=new Blob([data],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='users.json'; a.click(); URL.revokeObjectURL(a.href); });
el('exportAssignments').addEventListener('click', ()=>{ const data=JSON.stringify(getAssignments()); const blob=new Blob([data],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='assignments.json'; a.click(); URL.revokeObjectURL(a.href); });

// Logout
el('logoutBtn').addEventListener('click', ()=>{ try{ localStorage.removeItem('civic_session'); }catch(e){} window.location.href='Index.html'; });

// Init UI
(function init(){
  renderSubadminForm();
  const users = getUsers();
  const subadmins = users.filter(u=>u.role==='subadmin');
  const sel = el('filterAssignee');
  for(const sa of subadmins){ const o=document.createElement('option'); o.value=sa.id; o.textContent=sa.name||sa.identifier; sel.appendChild(o); }
  renderSubadmins(); renderUsers(); renderReports();
})();
