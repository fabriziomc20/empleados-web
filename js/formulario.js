// ===== Helpers UI =====
function showMsg(type, text){
  const box = document.getElementById('msg');
  if(!box) return;
  box.className = type === 'ok' ? 'ok' : 'err';
  box.textContent = text;
  box.style.display = 'block';
}
function clearMsg(){
  const box = document.getElementById('msg');
  if(!box) return;
  box.style.display = 'none';
  box.textContent = '';
  box.className = '';
}
// Mostrar errores JS arriba
window.addEventListener('error', (e)=>{ showMsg('err', `JS Error: ${e.message}`); });

// ===== Helpers Supabase =====
function sbGuard(res){
  if(res.error) throw res.error;
  return res.data ?? null;
}
function todayISO(){ return new Date().toISOString().slice(0,10); }

// Normaliza el valor de un <input type="date"> a YYYY-MM-DD (o null si vacío)
function normalizeDateInput(inputEl){
  const v = inputEl?.value?.trim();
  if(!v) return null; // sin fecha -> deja que la RPC use su default

  // dd/mm/yyyy -> yyyy-mm-dd
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(m){
    const [_, d, mm, y] = m;
    return `${y}-${mm}-${d}`;
  }
  // La mayoría de navegadores ya dan yyyy-mm-dd
  return v;
}

// ===== Data funcs (Supabase) =====

// EMPRESA
async function loadEmployer(){
  clearMsg();
  const { data, error } = await supabase
    .from('employers')
    .select('id,ruc,name,logo_url')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if(error) throw error;

  const empRuc  = document.getElementById('empRuc');
  const empName = document.getElementById('empName');
  const empLogo = document.getElementById('empLogo');

  if(!data){ showMsg('ok','No hay empresa registrada aún.'); return; }
  if(empRuc)  empRuc.value  = data.ruc || '';
  if(empName) empName.value = data.name || '';
  if(empLogo) empLogo.value = data.logo_url || '';
  showMsg('ok','Empresa cargada.');
}

async function saveEmployer(){
  clearMsg();
  const empRuc  = document.getElementById('empRuc');
  const empName = document.getElementById('empName');
  const empLogo = document.getElementById('empLogo');
  const payload = {
    ruc: empRuc?.value?.trim(),
    name: empName?.value?.trim(),
    logo_url: (empLogo?.value?.trim() || null)
  };
  // upsert por RUC (requiere unique en ruc)
  const { error } = await supabase
    .from('employers')
    .upsert(payload, { onConflict: 'ruc' });
  if(error) throw error;
  showMsg('ok','Empresa guardada/actualizada.');
}

// RÉGIMEN TRIBUTARIO (catálogo / actual / historial / guardar vía RPC)
async function loadTaxRegimes(){
  const { data, error } = await supabase
    .from('regimes_tax')
    .select('code,name')
    .order('name', { ascending: true });
  if(error) throw error;

  const taxRegime = document.getElementById('taxRegime');
  if(taxRegime){
    taxRegime.innerHTML = (data||[])
      .map(r => `<option value="${r.code}">${r.name}</option>`)
      .join('');
  }
}

async function loadCurrentTax(){
  const { data, error } = await supabase
    .from('employer_tax_history')
    .select('valid_from, valid_to, regimes_tax ( code, name )')
    .eq('valid_to', null)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if(error) throw error;

  const cur = data
    ? { code: data.regimes_tax?.code, name: data.regimes_tax?.name, valid_from: data.valid_from }
    : null;

  const taxCurrent   = document.getElementById('taxCurrent');
  const taxRegime    = document.getElementById('taxRegime');
  const taxValidFrom = document.getElementById('taxValidFrom');

  if (taxCurrent) {
    taxCurrent.textContent = cur
      ? `Actual: ${cur.name} (desde ${cur.valid_from})`
      : 'Sin régimen vigente.';
  }
  if (cur && taxRegime)    taxRegime.value    = cur.code;
  if (cur && taxValidFrom) taxValidFrom.value = cur.valid_from;  // asegura misma fecha para UPDATE
}

async function loadTaxHistory(){
  const { data, error } = await supabase
    .from('employer_tax_history')
    .select('id, valid_from, valid_to, regimes_tax ( code, name )')
    .order('valid_from', { ascending: false });
  if(error) throw error;

  // aplanar para la tabla del modal
  return (data||[]).map(r => ({
    id: r.id,
    code: r.regimes_tax?.code,
    name: r.regimes_tax?.name,
    valid_from: r.valid_from,
    valid_to: r.valid_to
  }));
}

async function saveEmployerTax(){
  clearMsg();
  const taxRegime    = document.getElementById('taxRegime');
  const taxValidFrom = document.getElementById('taxValidFrom');

  const v = normalizeDateInput(taxValidFrom);

  // Armar args: si no hay fecha, NO la mandamos (la RPC usará current_date)
  const args = { regime_code: taxRegime?.value };
  if (v) args.vfrom = v;

  // RPC con versionado (definida en tu SQL)
  const { data, error } = await supabase.rpc('set_employer_regime', args);
  if(error) throw error;

  showMsg('ok', 'Régimen actualizado.');
  await loadCurrentTax();
}

// ===== List reloads (Sedes / Proyectos / Turnos)
async function reloadSites(){
  const { data, error } = await supabase
    .from('sites')
    .select('id, code, name')
    .order('id', { ascending: true });
  if(error) throw error;
  window._sitesCached = data || [];
}
async function reloadProjects(){
  const { data } = await supabase
    .from('projects')
    .select('id, code, name')
    .order('id', { ascending: true });
  window._projectsCached = data || [];
}
async function reloadShifts(){
  const { data } = await supabase
    .from('shifts')
    .select('id, name, start_time, end_time')
    .order('id', { ascending: true });
  window._shiftsCached = data || [];
}

// ===== Modal genérico =====
let modalState = { items:[], page:1, perPage:10, kind:"", columns:[] };

// Botón de acciones por tipo
function actionButtons(kind, it){
  if(kind === 'tax'){
    return `
      <button class="secondary" title="Ver detalle" aria-label="Ver detalle"
              onclick="viewRecord('${kind}', ${it.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="2" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
        </svg>
      </button>`;
  }
  return `
    <button title="Editar" aria-label="Editar" onclick="modalEdit('${kind}', ${it.id})">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Z" stroke="currentColor" stroke-width="2"/>
        <path d="M14.06 4.94l3.75 3.75" stroke="currentColor" stroke-width="2"/>
      </svg>
    </button>
    <button class="secondary" title="Eliminar" aria-label="Eliminar" onclick="modalDelete('${kind}', ${it.id})">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 6h18" stroke="currentColor" stroke-width="2"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2"/>
        <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2"/>
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2"/>
      </svg>
    </button>`;
}

function openModal(title, items, columns, kind){
  modalState = { items, page:1, perPage:10, kind, columns };
  const titleEl = document.getElementById('modalTitle');
  const searchEl = document.getElementById('modalSearch');
  const wrap = document.getElementById('modalWrap');
  if(titleEl) titleEl.textContent = title;
  if(searchEl) searchEl.value = "";
  renderModal();
  if(wrap) wrap.style.display = "flex";
}
function closeModal(){ const wrap=document.getElementById('modalWrap'); if(wrap) wrap.style.display="none"; }
window.closeModal = closeModal;

function renderModal(){
  const searchEl = document.getElementById('modalSearch');
  const q = (searchEl?.value || "").trim().toLowerCase();
  const filtered = modalState.items.filter(it => JSON.stringify(it).toLowerCase().includes(q));
  const total = filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / modalState.perPage));
  if (modalState.page > maxPage) modalState.page = maxPage;

  const start = (modalState.page - 1) * modalState.perPage;
  const pageItems = filtered.slice(start, start + modalState.perPage);

  const tbl = document.createElement('table');
  tbl.innerHTML = `
    <thead><tr>${modalState.columns.map(c=>`<th>${c.header}</th>`).join("")}<th>Acciones</th></tr></thead>
    <tbody>
      ${pageItems.map(it => `
        <tr>
          ${modalState.columns.map(c=>`<td>${it[c.field] ?? ""}</td>`).join("")}
          <td>${actionButtons(modalState.kind, it)}</td>
        </tr>`).join("")}
    </tbody>`;
  const content = document.getElementById('modalContent');
  if(content){ content.innerHTML = ""; content.appendChild(tbl); }

  const info = document.getElementById('modalPageInfo');
  if(info) info.textContent = `Página ${modalState.page} / ${maxPage} — ${total} registros`;

  const prev = document.getElementById('modalPrev');
  const next = document.getElementById('modalNext');
  if(prev) prev.onclick = () => { if(modalState.page>1){ modalState.page--; renderModal(); } };
  if(next) next.onclick = () => { if(modalState.page<maxPage){ modalState.page++; renderModal(); } };
}
document.addEventListener('input', (ev)=>{
  if(ev.target && ev.target.id === 'modalSearch') renderModal();
});

// Vista simple del registro (historial)
function viewRecord(kind, id){
  const src = modalState.items || [];
  const row = src.find(r => r.id === id);
  if(!row){ alert('No se encontró el registro.'); return; }
  const pretty = JSON.stringify(row, null, 2);
  alert(pretty);
}
window.viewRecord = viewRecord;

// Editar (Sites / Projects / Shifts)
async function modalEdit(kind, id){
  if(kind==="sites"){
    const row = (window._sitesCached||[]).find(x=>x.id===id);
    const nuevo = prompt("Nuevo nombre de sede:", row?.name || "");
    if(nuevo===null) return;
    const { error } = await supabase.from('sites').update({ name: nuevo }).eq('id', id);
    if(!error){ await reloadSites(); await openSitesModal(); }
    else alert(error.message);
  }else if(kind==="projects"){
    const row = (window._projectsCached||[]).find(x=>x.id===id);
    const nuevo = prompt("Nuevo nombre de proyecto:", row?.name || "");
    if(nuevo===null) return;
    const { error } = await supabase.from('projects').update({ name: nuevo }).eq('id', id);
    if(!error){ await reloadProjects(); await openProjectsModal(); }
    else alert(error.message);
  }else if(kind==="shifts"){
    const row = (window._shiftsCached||[]).find(x=>x.id===id);
    const nuevo = prompt("Nuevo nombre del turno:", row?.name || "");
    if(nuevo===null) return;
    const { error } = await supabase.from('shifts').update({ name: nuevo }).eq('id', id);
    if(!error){ await reloadShifts(); await openShiftsModal(); }
    else alert(error.message);
  }
}
window.modalEdit = modalEdit;

// Eliminar
async function modalDelete(kind, id){
  if(kind==='tax'){ return; } // seguridad: no se elimina historial
  if(!confirm("¿Eliminar?")) return;

  let table = null;
  if(kind==="sites")    table = 'sites';
  if(kind==="projects") table = 'projects';
  if(kind==="shifts")   table = 'shifts';

  const { error } = await supabase.from(table).delete().eq('id', id);
  if(error){ alert("No se pudo eliminar: " + error.message); return; }

  if(kind==="sites"){ await reloadSites(); await openSitesModal(); }
  if(kind==="projects"){ await reloadProjects(); await openProjectsModal(); }
  if(kind==="shifts"){ await reloadShifts(); await openShiftsModal(); }
}
window.modalDelete = modalDelete;

// Abrir modales (carga directa desde BD)
async function openSitesModal(){
  const { data } = await supabase.from('sites').select('id,code,name').order('id',{ascending:true});
  window._sitesCached = data || [];
  openModal("Sedes", window._sitesCached, [
    { header:"ID", field:"id" },
    { header:"Código", field:"code" },
    { header:"Nombre", field:"name" },
  ], "sites");
}
async function openProjectsModal(){
  const { data } = await supabase.from('projects').select('id,code,name').order('id',{ascending:true});
  window._projectsCached = data || [];
  openModal("Proyectos", window._projectsCached, [
    { header:"ID", field:"id" },
    { header:"Código", field:"code" },
    { header:"Nombre", field:"name" },
  ], "projects");
}
async function openShiftsModal(){
  const { data } = await supabase.from('shifts').select('id,name,start_time,end_time').order('id',{ascending:true});
  window._shiftsCached = data || [];
  openModal("Turnos", window._shiftsCached, [
    { header:"ID", field:"id" },
    { header:"Nombre", field:"name" },
    { header:"Inicio", field:"start_time" },
    { header:"Fin", field:"end_time" },
  ], "shifts");
}
window.openSitesModal = openSitesModal;
window.openProjectsModal = openProjectsModal;
window.openShiftsModal = openShiftsModal;

// ===== Historial de régimen =====
window.openTaxHistoryModal = async function openTaxHistoryModal(){
  try{
    const data = await loadTaxHistory();
    openModal("Histórico de Régimen Tributario", data, [
      { header:"ID", field:"id" },
      { header:"Régimen", field:"name" },
      { header:"Desde", field:"valid_from" },
      { header:"Hasta", field:"valid_to" },
    ], "tax");
  }catch(e){
    showMsg('err',`Error cargando historial: ${e.message}`);
  }
};

// ===== Init DOM =====
window.addEventListener('DOMContentLoaded', async () => {
  // activar link activo
  document.querySelectorAll('.nav a').forEach(a=>{
    const href=a.getAttribute('href'); if(!href) return;
    if (location.pathname.endsWith(href)) {
      a.classList.add('active');
      a.setAttribute('aria-current','page');
    }
  });

  // botones
  const $ = (id)=>document.getElementById(id);
  $('btnEmpCargar')   && $('btnEmpCargar').addEventListener('click', ()=> loadEmployer().catch(e=>showMsg('err', e.message)));
  $('btnEmpGuardar')  && $('btnEmpGuardar').addEventListener('click', ()=> saveEmployer().catch(e=>showMsg('err', e.message)));
  $('btnTaxSave')     && $('btnTaxSave').addEventListener('click', ()=> saveEmployerTax().catch(e=>showMsg('err', e.message)));
  $('btnTaxHistory')  && $('btnTaxHistory').addEventListener('click', ()=> window.openTaxHistoryModal());

  $('btnSiteAdd') && $('btnSiteAdd').addEventListener('click', async ()=>{
    try{
      clearMsg();
      const name = $('siteName')?.value?.trim();
      const { error } = await supabase.from('sites').insert({ name });
      if(error) throw error;
      if($('siteName')) $('siteName').value='';
      showMsg('ok','Sede creada.'); await reloadSites();
    }catch(e){ showMsg('err',`Error al crear sede: ${e.message}`); }
  });

  $('btnProjAdd') && $('btnProjAdd').addEventListener('click', async ()=>{
    try{
      clearMsg();
      const name = $('projName')?.value?.trim();
      if(!name) throw new Error("Completa el nombre del proyecto");
      const { error } = await supabase.from('projects').insert({ name });
      if(error) throw error;
      if($('projName')) $('projName').value='';
      showMsg('ok','Proyecto creado.'); await reloadProjects();
    }catch(e){ showMsg('err',`Error al crear proyecto: ${e.message}`); }
  });

  $('btnShiftAdd') && $('btnShiftAdd').addEventListener('click', async ()=>{
    try{
      clearMsg();
      const name  = $('shiftName')?.value?.trim();
      const start = $('shiftStart')?.value;
      const end   = $('shiftEnd')?.value;
      const { error } = await supabase.from('shifts').insert({ name, start_time:start, end_time:end });
      if(error) throw error;
      if($('shiftName')) $('shiftName').value='';
      showMsg('ok','Turno creado.'); await reloadShifts();
    }catch(e){ showMsg('err',`Error al crear turno: ${e.message}`); }
  });

  // init
  try{ await loadEmployer(); }catch{}
  try{
    const taxValidFrom = $('taxValidFrom');
    if(taxValidFrom) taxValidFrom.value = todayISO();
    await loadTaxRegimes();
    await loadCurrentTax();
  }catch(e){ showMsg('err', e.message); }
  await reloadSites();
  await reloadProjects();
  await reloadShifts();
});

// ===== Menú lateral =====
function closeMenu(){
  document.body.classList.remove('menu-open');
  document.getElementById('menuBtn').setAttribute('aria-expanded','false');
}
document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.getElementById('menuBtn');
  const backdrop=document.getElementById('backdrop');
  btn?.addEventListener('click',()=>{
    const open=document.body.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded',open);
  });
  backdrop?.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeMenu(); });
});


