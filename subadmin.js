const el = (id)=>document.getElementById(id);
function getSession(){ try { return JSON.parse(localStorage.getItem('civic_session')||'null'); } catch(e){ return null; } }
function ensureSubSession(){ const s = getSession(); if(!s || s.role!=='subadmin'){ window.location.href='Index.html'; } return s; }
const session = ensureSubSession();

function getReports(){ try { return JSON.parse(localStorage.getItem('civic_reports')||'[]'); } catch(e){ return [] } }
function setReports(arr){ localStorage.setItem('civic_reports', JSON.stringify(arr)); }

function render(){
  const s = el('searchText').value.toLowerCase();
  const fc = el('filterCategory').value; const fs = el('filterStatus').value;
  let items = getReports().filter(r=>r.assignedTo===session.userId);
  if(fc) items = items.filter(r=>r.category===fc);
  if(fs) items = items.filter(r=>r.status===fs);
  if(s) items = items.filter(r=>{ if(!r.encrypted && r.details){ const t=(r.details.title||'')+' '+(r.details.description||''); return t.toLowerCase().includes(s);} return false; });
  items.sort((a,b)=>b.ts-a.ts);
  const root = el('list'); root.innerHTML='';
  for(const r of items){
    const w = document.createElement('div'); w.className='item';
    const h = document.createElement('h4'); h.textContent = (!r.encrypted && r.details && r.details.title) ? r.details.title : (r.category+" • "+new Date(r.ts).toLocaleString()); w.appendChild(h);
    const m = document.createElement('div'); m.className='meta'; m.innerHTML = `<span>${r.category}</span><span>Severity ${r.severity}</span><span>${new Date(r.ts).toLocaleString()}</span><span>Status ${r.status}</span>`; w.appendChild(m);
    const body = document.createElement('div'); body.style.marginTop='6px';
    if(!r.encrypted && r.details){ const p=document.createElement('p'); p.style.fontSize='13px'; p.style.color='#cbd5e1'; p.textContent=r.details.description||''; body.appendChild(p); }
    const row = document.createElement('div'); row.style.marginTop='8px'; row.style.display='flex'; row.style.gap='8px';
    const btn = document.createElement('button'); btn.textContent = r.status==='pending'?'Mark resolved':'Mark pending';
    btn.addEventListener('click',()=>{ const all=getReports(); const idx=all.findIndex(x=>x.id===r.id); if(idx>-1){ all[idx].status = all[idx].status==='pending'?'resolved':'pending'; setReports(all); render(); } });
    const view = document.createElement('button'); view.className='ghost'; view.textContent='Open in OSM'; if(r.location){ view.addEventListener('click',()=>{ const lat=r.location.lat, lng=r.location.lng; const url='https://www.openstreetmap.org/?mlat='+lat+'&mlon='+lng+'#map=16/'+lat+'/'+lng; window.open(url,'_blank'); }); } else { view.disabled=true; }
    row.appendChild(btn); row.appendChild(view); body.appendChild(row);
    w.appendChild(body);
    root.appendChild(w);
  }
}

el('filterCategory').addEventListener('change', render);
el('filterStatus').addEventListener('change', render);
el('searchText').addEventListener('input', ()=>{ clearTimeout(window._t); window._t=setTimeout(render,200); });

el('exportAssigned').addEventListener('click',()=>{ const items=getReports().filter(r=>r.assignedTo===session.userId); const blob=new Blob([JSON.stringify(items)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='assigned_reports.json'; a.click(); URL.revokeObjectURL(a.href); });
el('logoutBtn').addEventListener('click',()=>{ try{ localStorage.removeItem('civic_session'); }catch(e){} window.location.href='Index.html'; });

render();
