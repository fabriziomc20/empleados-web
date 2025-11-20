// =========================
// js/config.js (robusto y encapsulado)
// =========================

// 1) Solo corre en config.html
const IS_CONFIG_PAGE = /\/config\.html(\?|$)/.test(location.pathname);

// ===== Menú lateral (seguro en cualquier página) =====
function closeMenu(){
  document.body.classList.remove('menu-open');
  const btn = document.getElementById('menuBtn');
  btn && btn.setAttribute('aria-expanded','false');
}
document.addEventListener('DOMContentLoaded', ()=>{
  const btn=document.getElementById('menuBtn');
  const backdrop=document.getElementById('backdrop');
  btn?.addEventListener('click',()=>{
    const open=document.body.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded',open);
  });
  backdrop?.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeMenu(); });

  // Botón cerrar sesión (solo en config.html)
  document.getElementById('btnSidebarLogout')?.addEventListener('click', async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // sincroniza logout entre pestañas
      localStorage.setItem('force-logout', String(Date.now()));
      location.href = 'login.html';
    }
  });

  // Si otra pestaña cerró sesión, esta también vuelve a login
  window.addEventListener('storage', (e)=>{
    if (e.key === 'force-logout' && e.newValue) {
      location.href = 'login.html';
    }
  });
});

// =========================
// Todo lo que toca BD, solo en config.html
// =========================
if (IS_CONFIG_PAGE) {

  // ---- Helpers UI ----
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
  // Banner de errores JS (solo aquí)
  window.addEventListener('error', (e)=>{ showMsg('err', `JS Error: ${e.message}`); });

  // ---- Helpers de fecha ----
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function normalizeDateInput(inputEl){
    const v = inputEl?.value?.trim();
    if(!v) return null;
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m){ const [_, d, mm, y] = m; return `${y}-${mm}-${d}`; }
    return v; // navegadores modernos ya dan yyyy-mm-dd
  }

  // ---- Estado global de la compañía activa ----
  window._currentCompanyId = null;

  async function getCurrentUserId(){
    const { data:{ user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user?.id || null;
  }

  // ---- EMPRESA (companies) ----
  async function loadEmployer(){
    clearMsg();
    const uid = await getCurrentUserId();
    if (!uid) throw new Error('No hay sesión activa.');

    // Busca la empresa donde el usuario tiene membresía aceptada y habilitada
    const { data, error } = await supabase
      .from('company_memberships')
      .select(`
        company:companies ( id, ruc, name, logo_url )
      `)
      .eq('user_id', uid)
      .eq('is_enabled', true)
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const emp = data?.company || null;

    const empRuc  = document.getElementById('empRuc');
    const empName = document.getElementById('empName');
    const empLogo = document.getElementById('empLogo');

    if(!emp){
      window._currentCompanyId = null;
      if(empRuc)  empRuc.value  = '';
      if(empName) empName.value = '';
      if(empLogo) empLogo.value = '';
      showMsg('ok','No tienes empresa asociada aún.');
      return;
    }

    window._currentCompanyId = emp.id;
    if(empRuc)  empRuc.value  = emp.ruc || '';
    if(empName) empName.value = emp.name || '';
    if(empLogo) empLogo.value = emp.logo_url || '';
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
    const { data, error } = await supabase
      .from('companies')
      .upsert(payload, { onConflict: 'ruc' })
      .select('id')
      .maybeSingle();
    if(error) throw error;

    if (data?.id) window._currentCompanyId = data.id;
    showMsg('ok','Empresa guardada/actualizada.');
  }

  // ---- RÉGIMEN (company_tax_history) ----
  async function loadTaxRegimes(){
    const { data, error } = await supabase
      .from('regimes_tax')
      .select('code,name')
      .order('name', { ascending: true });
    if(error) throw error;

    const taxRegime = document.getElementById('taxRegime');
    if (taxRegime) {
      taxRegime.innerHTML = (data||[])
        .map(r => `<option value="${r.code}">${r.name}</option>`)
        .join('');
    }
  }

  async function loadCurrentTax(){
    const out = document.getElementById('taxCurrent');
    if (!window._currentCompanyId){
      if(out) out.textContent = 'Sin régimen vigente.';
      return;
    }
    const { data, error } = await supabase
      .from('company_tax_history')
      .select('valid_from, valid_to, regimes_tax ( code, name )')
      .eq('company_id', window._currentCompanyId)
      .is('valid_to', null)
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
    if (cur && taxValidFrom) taxValidFrom.value = cur.valid_from || todayISO();
  }

  async function loadTaxHistory(){
    if (!window._currentCompanyId) return [];
    const { data, error } = await supabase
      .from('company_tax_history')
      .select('id, valid_from, valid_to, regimes_tax ( code, name )')
      .eq('company_id', window._currentCompanyId)
      .order('valid_from', { ascending: false });
    if(error) throw error;

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
    if (!window._currentCompanyId) throw new Error('No hay empresa activa.');

    const taxRegime    = document.getElementById('taxRegime');
    const taxValidFrom = document.getElementById('taxValidFrom');
    const v = normalizeDateInput(taxValidFrom);

    // Intentar nueva RPC; si no existe, fallback a la anterior
    let err = null;
    const args = { company_id: window._currentCompanyId, regime_code: taxRegime?.value, vfrom: v };
    let rpc = await supabase.rpc('set_company_regime', args);
    if (rpc.error){
      // fallback
      rpc = await supabase.rpc('set_employer_regime', { regime_code: taxRegime?.value, vfrom: v, company_id: window._currentCompanyId });
    }
    err = rpc.error;

    if(err) throw err;

    showMsg('ok', 'Régimen actualizado.');
    await loadCurrentTax();
  }

  // ---- Listados (Sedes / Proyectos / Turnos) ----
  async function reloadSites(){
    if (!window._currentCompanyId){ window._sitesCached = []; return; }
    const { data, error } = await supabase
      .from('sites')
      .select('id, code, name')
      .eq('company_id', window._currentCompanyId)
      .order('id', { ascending: true });
    if(error) throw error;
    window._sitesCached = data || [];
  }
  async function reloadProjects(){
    if (!window._currentCompanyId){ window._projectsCached = []; return; }
    const { data, error } = await supabase
      .from('projects')
      .select('id, code, name')
      .eq('company_id', window._currentCompanyId)
      .order('id', { ascending: true });
    if(error) throw error;
    window._projectsCached = data || [];
  }
  async function reloadShifts(){
    if (!window._currentCompanyId){ window._shiftsCached = []; return; }
    const { data, error } = await supabase
      .from('shifts')
      .select('id, name, start_time, end_time')
      .eq('company_id', window._currentCompanyId)
      .order('id', { ascending: true });
    if(error) throw error;
    window._shiftsCached = data || [];
  }

  // ---- Modal genérico ----
  let modalState = { items:[], page:1, perPage:10, kind:"", columns:[] };

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

  function viewRecord(kind, id){
    const src = modalState.items || [];
    const row = src.find(r => r.id === id);
    if(!row){ alert('No se encontró el registro.'); return; }
    const pretty = JSON.stringify(row, null, 2);
    alert(pretty);
  }
  window.viewRecord = viewRecord;

  async function modalEdit(kind, id){
    if(kind==="sites"){
      const row = (window._sitesCached||[]).find(x=>x.id===id);
      const nuevo = prompt("Nuevo nombre de sede:", row?.name || "");
      if(nuevo===null) return;
      const { error } = await supabase.from('sites').update({ name: nuevo }).eq('id', id).eq('company_id', window._currentCompanyId);
      if(!error){ await reloadSites(); await openSitesModal(); }
      else alert(error.message);
    }else if(kind==="projects"){
      const row = (window._projectsCached||[]).find(x=>x.id===id);
      const nuevo = prompt("Nuevo nombre de proyecto:", row?.name || "");
      if(nuevo===null) return;
      const { error } = await supabase.from('projects').update({ name: nuevo }).eq('id', id).eq('company_id', window._currentCompanyId);
      if(!error){ await reloadProjects(); await openProjectsModal(); }
      else alert(error.message);
    }else if(kind==="shifts"){
      const row = (window._shiftsCached||[]).find(x=>x.id===id);
      const nuevo = prompt("Nuevo nombre del turno:", row?.name || "");
      if(nuevo===null) return;
      const { error } = await supabase.from('shifts').update({ name: nuevo }).eq('id', id).eq('company_id', window._currentCompanyId);
      if(!error){ await reloadShifts(); await openShiftsModal(); }
      else alert(error.message);
    }
  }
  window.modalEdit = modalEdit;

  async function modalDelete(kind, id){
    if(kind==='tax'){ return; }
    if(!confirm("¿Eliminar?")) return;
    let table = null;
    if(kind==="sites")    table = 'sites';
    if(kind==="projects") table = 'projects';
    if(kind==="shifts")   table = 'shifts';
    const { error } = await supabase.from(table).delete().eq('id', id).eq('company_id', window._currentCompanyId);
    if(error){ alert("No se pudo eliminar: " + error.message); return; }
    if(kind==="sites"){ await reloadSites(); await openSitesModal(); }
    if(kind==="projects"){ await reloadProjects(); await openProjectsModal(); }
    if(kind==="shifts"){ await reloadShifts(); await openShiftsModal(); }
  }
  window.modalDelete = modalDelete;

  async function openSitesModal(){
    if (!window._currentCompanyId){ alert('Primero carga/crea tu empresa.'); return; }
    const { data, error } = await supabase
      .from('sites')
      .select('id,code,name')
      .eq('company_id', window._currentCompanyId)
      .order('id',{ascending:true});
    if (error) { alert(error.message); return; }
    window._sitesCached = data || [];
    openModal("Sedes", window._sitesCached, [
      { header:"ID", field:"id" },
      { header:"Código", field:"code" },
      { header:"Nombre", field:"name" },
    ], "sites");
  }
  async function openProjectsModal(){
    if (!window._currentCompanyId){ alert('Primero carga/crea tu empresa.'); return; }
    const { data, error } = await supabase
      .from('projects')
      .select('id,code,name')
      .eq('company_id', window._currentCompanyId)
      .order('id',{ascending:true});
    if (error) { alert(error.message); return; }
    window._projectsCached = data || [];
    openModal("Proyectos", window._projectsCached, [
      { header:"ID", field:"id" },
      { header:"Código", field:"code" },
      { header:"Nombre", field:"name" },
    ], "projects");
  }
  async function openShiftsModal(){
    if (!window._currentCompanyId){ alert('Primero carga/crea tu empresa.'); return; }
    const { data, error } = await supabase
      .from('shifts')
      .select('id,name,start_time,end_time')
      .eq('company_id', window._currentCompanyId)
      .order('id',{ascending:true});
    if (error) { alert(error.message); return; }
    window._shiftsCached = data || [];
    openModal("Turnos", window._shiftsCached, [
      { header:"ID", field:"id" },
      { header:"Nombre", field:"name" },
      { header:"Inicio", field:"start_time" },
      { header:"Fin", field:"end_time" },
    ], "shifts");
  }
  window.openSitesModal    = openSitesModal;
  window.openProjectsModal = openProjectsModal;
  window.openShiftsModal   = openShiftsModal;

  // =========================
  // USUARIOS & PERMISOS (solo invitación por correo)
  // =========================

  const usersState = {
    items: [],
    page: 1,
    perPage: 10,
    filter: ''
  };

  function getCompanyIdOrWarn(){
    const cid = window._currentCompanyId;
    if(!cid){
      showMsg('err','Primero crea/selecciona la empresa y guarda.');
      throw new Error('Sin company_id');
    }
    return cid;
  }

  function readAdvancedPerms(){
    const d = {
      empleados: { read: false, write: false },
      contratos: { read: false, write: false },
      nomina:    { read: false, write: false },
      enabled: false
    };
    const permOpt = document.getElementById('permOpt');
    if (!permOpt || !permOpt.open) return d;
    const $ = (id)=>document.getElementById(id);
    d.empleados.read = !!$('permEmpRead')?.checked;
    d.empleados.write= !!$('permEmpWrite')?.checked;
    d.contratos.read = !!$('permCtrRead')?.checked;
    d.contratos.write= !!$('permCtrWrite')?.checked;
    d.nomina.read    = !!$('permNomRead')?.checked;
    d.nomina.write   = !!$('permNomWrite')?.checked;
    d.enabled        = true;
    return d;
  }

  async function inviteUser(){
    clearMsg();
    const $ = (id)=>document.getElementById(id);

    const full_name = $('userName')?.value?.trim();
    const email     = $('userEmail')?.value?.trim();
    const role      = $('userRole')?.value;

    if(!full_name || !email || !role){ showMsg('err','Completa nombre, correo y rol.'); return; }
    const company_id = getCompanyIdOrWarn();
    const perms = readAdvancedPerms();

    try{
      // Enviar ambos nombres por compatibilidad con tu función actual
      const { data, error } = await supabase.functions.invoke('admin_invite_user', {
        body: { mode:'invite', company_id, org_id: company_id, email, full_name, role, perms }
      });
      if(error) throw error;
      showMsg('ok', data?.message || 'Invitación enviada.');
      // Limpiar formulario
      $('userName') && ( $('userName').value = '' );
      $('userEmail') && ( $('userEmail').value = '' );
      // Recargar
      await reloadUsers();
      renderUsers();
    }catch(e){
      showMsg('err', e?.message || 'No se pudo enviar la invitación. Verifica la Edge Function admin_invite_user.');
    }
  }

  async function reloadUsers(){
  const company_id = getCompanyIdOrWarn();

  // 1) membership rows
  const { data: mems, error: e1 } = await supabase
    .from('company_memberships')
    .select('user_id, role, status, is_enabled')
    .eq('company_id', company_id)
    .order('role', { ascending: true });

  if (e1) {
    showMsg('err', 'Error cargando usuarios: ' + e1.message);
    usersState.items = [];
    return;
  }

  if (!mems || !mems.length){
    usersState.items = [];
    return;
  }

  // 2) fetch profiles for those user_ids
  const ids = Array.from(new Set(mems.map(m => m.user_id))).filter(Boolean);
  let profById = {};
  if (ids.length){
    const { data: profs, error: e2 } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', ids);

    if (!e2 && profs) {
      profById = Object.fromEntries(
        profs.map(p => [p.user_id, { full_name: p.full_name, email: p.email }])
      );
    }
  }

  // 3) merge
  usersState.items = mems.map(row => ({
    user_id: row.user_id,
    full_name: profById[row.user_id]?.full_name ?? '(sin nombre)',
    email:     profById[row.user_id]?.email     ?? '(sin correo)',
    role: row.role,
    status: row.status || 'accepted',
    is_enabled: row.is_enabled !== false
  }));
}


  function renderUsers(){
    const list = document.getElementById('usersList');
    if(!list) return;
    const q = (document.getElementById('userFilter')?.value || '').trim().toLowerCase();

    // Filtrar
    const filtered = usersState.items.filter(u =>
      [u.full_name, u.email, u.role, u.status].join(' ').toLowerCase().includes(q)
    );

    // Paginar
    const total = filtered.length;
    const maxPage = Math.max(1, Math.ceil(total / usersState.perPage));
    if(usersState.page > maxPage) usersState.page = maxPage;
    const start = (usersState.page - 1) * usersState.perPage;
    const pageItems = filtered.slice(start, start + usersState.perPage);

    // Pintar
    const rows = pageItems.map(u => `
      <div class="list-row" role="row" data-user-id="${u.user_id}">
        <div class="cell name" role="cell">${u.full_name}</div>
        <div class="cell email" role="cell">${u.email}</div>
        <div class="cell role" role="cell">
          <select data-user-id="${u.user_id}" class="user-role" aria-label="Cambiar rol">
            <option value="admin"   ${u.role==='admin'?'selected':''}>admin</option>
            <option value="manager" ${u.role==='manager'?'selected':''}>manager</option>
            <option value="employee"${u.role==='employee'?'selected':''}>employee</option>
          </select>
        </div>
        <div class="cell status" role="cell">
          ${u.is_enabled
            ? '<span class="badge">Activo</span>'
            : '<span class="badge badge--pending">Inactivo</span>'}
          ${u.status==='pending' ? '<span class="badge badge--pending" style="margin-left:6px">Pendiente</span>':''}
        </div>
        <div class="cell actions" role="cell">
          <button class="small" data-act="resend" data-user-id="${u.user_id}">Reenviar</button>
          <button class="small" data-act="toggle" data-user-id="${u.user_id}">${u.is_enabled?'Desactivar':'Activar'}</button>
          <button class="small danger" data-act="remove" data-user-id="${u.user_id}">Quitar</button>
        </div>
      </div>
    `).join('');

    list.innerHTML = rows || '<div class="small">No hay usuarios con acceso aún.</div>';

    const info = document.getElementById('usersPageInfo');
    if(info) info.textContent = `Página ${usersState.page} / ${maxPage} — ${total} usuarios`;

    const prev = document.getElementById('usersPrev');
    const next = document.getElementById('usersNext');
    if(prev) prev.onclick = ()=>{ if(usersState.page>1){ usersState.page--; renderUsers(); } };
    if(next) next.onclick = ()=>{ if(usersState.page<maxPage){ usersState.page++; renderUsers(); } };
  }

  // Delegación: acciones por fila
  document.addEventListener('click', async (ev)=>{
    const t = ev.target;
    if (!t) return;

    // Botón invitar
    if (t.id === 'btnInviteUser'){
      ev.preventDefault();
      inviteUser().catch(e=>showMsg('err', e.message));
    }

    // Recargar usuarios
    if (t.id === 'btnUsersReload'){
      try{ await reloadUsers(); renderUsers(); }catch(e){ showMsg('err', e.message); }
    }

    // Acciones de la lista
    if (t.matches('[data-act]')){
      const act = t.getAttribute('data-act');
      const user_id = t.getAttribute('data-user-id');
      if(!user_id) return;

      if (act === 'resend'){
        try{
          const company_id = getCompanyIdOrWarn();
          const { data, error } = await supabase.functions.invoke('admin_manage_user', {
            body: { action:'resend', company_id, org_id: company_id, user_id }
          });
          if(error) throw error;
          showMsg('ok', data?.message || 'Invitación reenviada.');
        }catch(e){ showMsg('err', e.message || 'Error al reenviar invitación.'); }
      }

      if (act === 'toggle'){
        try{
          const company_id = getCompanyIdOrWarn();
          const { data, error } = await supabase.functions.invoke('admin_manage_user', {
            body: { action:'toggle', company_id, org_id: company_id, user_id }
          });
          if(error) throw error;
          showMsg('ok', data?.message || 'Estado actualizado.');
          await reloadUsers(); renderUsers();
        }catch(e){ showMsg('err', e.message || 'Error al cambiar estado.'); }
      }

      if (act === 'remove'){
        if(!confirm('¿Quitar acceso de este usuario?')) return;
        try{
          const company_id = getCompanyIdOrWarn();
          const { data, error } = await supabase.functions.invoke('admin_manage_user', {
            body: { action:'remove', company_id, org_id: company_id, user_id }
          });
          if(error) throw error;
          showMsg('ok', data?.message || 'Membresía eliminada.');
          await reloadUsers(); renderUsers();
        }catch(e){ showMsg('err', e.message || 'Error al quitar acceso.'); }
      }
    }
  });

  // Cambiar rol desde el select
  document.addEventListener('change', async (ev)=>{
    const el = ev.target;
    if (el && el.classList.contains('user-role')){
      const user_id = el.getAttribute('data-user-id');
      const newRole = el.value;
      try{
        const company_id = getCompanyIdOrWarn();
        const { data, error } = await supabase.functions.invoke('admin_manage_user', {
          body: { action:'set_role', company_id, org_id: company_id, user_id, role:newRole }
        });
        if(error) throw error;
        showMsg('ok', data?.message || 'Rol actualizado.');
        await reloadUsers(); renderUsers();
      }catch(e){ showMsg('err', e.message || 'Error al actualizar rol.'); }
    }
  });

  // Filtro de usuarios
  document.addEventListener('input', (ev)=>{
    if (ev.target && ev.target.id === 'userFilter'){
      usersState.page = 1;
      renderUsers();
    }
  });

  // ---- Init SOLO en config.html ----
  window.addEventListener('DOMContentLoaded', async () => {
    // activar link activo
    document.querySelectorAll('.nav a').forEach(a=>{
      const href=a.getAttribute('href'); if(!href) return;
      if (location.pathname.endsWith(href)) {
        a.classList.add('active');
        a.setAttribute('aria-current','page');
      }
    });

    const $ = (id)=>document.getElementById(id);

    // Botones empresa
    $('btnEmpCargar')  && $('btnEmpCargar').addEventListener('click', ()=> loadEmployer().catch(e=>showMsg('err', e.message)));
    $('btnEmpGuardar') && $('btnEmpGuardar').addEventListener('click', ()=> saveEmployer().catch(e=>showMsg('err', e.message)));

    // Guardar régimen
    $('btnTaxSave')    && $('btnTaxSave').addEventListener('click', ()=> saveEmployerTax().catch(e=>showMsg('err', e.message)));

    // Ver historial
    const btnHist = $('btnTaxHistory');
    if (btnHist){
      btnHist.addEventListener('click', async ()=>{
        try{
          const data = await loadTaxHistory();
          openModal("Histórico de Régimen Tributario", data, [
            { header:"ID", field:"id" },
            { header:"Régimen", field:"name" },
            { header:"Desde", field:"valid_from" },
            { header:"Hasta", field:"valid_to" },
          ], "tax");
        }catch(e){ showMsg('err',`Error cargando historial: ${e.message}`); }
      });
    }

    // Crear sede / proyecto / turno (inyecta company_id)
    $('btnSiteAdd') && $('btnSiteAdd').addEventListener('click', async ()=>{
      try{
        clearMsg();
        const name = $('siteName')?.value?.trim();
        const company_id = getCompanyIdOrWarn();
        const { error } = await supabase.from('sites').insert({ company_id, name });
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
        const company_id = getCompanyIdOrWarn();
        const { error } = await supabase.from('projects').insert({ company_id, name });
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
        const company_id = getCompanyIdOrWarn();
        const { error } = await supabase.from('shifts').insert({ company_id, name, start_time:start, end_time:end });
        if(error) throw error;
        if($('shiftName')) $('shiftName').value='';
        showMsg('ok','Turno creado.'); await reloadShifts();
      }catch(e){ showMsg('err',`Error al crear turno: ${e.message}`); }
    });

    // === Invitaciones (solo por correo) ===
    $('btnInviteUser') && $('btnInviteUser').addEventListener('click', (e)=>{
      e.preventDefault();
      inviteUser().catch(err=>showMsg('err', err.message));
    });

    $('btnInviteReset') && $('btnInviteReset').addEventListener('click', ()=>{
      const fields = ['userName','userEmail'];
      fields.forEach(id=>{ const el=$(id); if(el) el.value=''; });
      const msg = $('inviteMsg'); if(msg) msg.textContent = '';
    });

    // Init
    try{
      const taxValidFrom = $('taxValidFrom');
      if(taxValidFrom) taxValidFrom.value = todayISO();

      // Cargar empresa por membresía (fija _currentCompanyId)
      await loadEmployer();

      await loadTaxRegimes();
      await loadCurrentTax();
    }catch(e){ showMsg('err', e.message); }

    await reloadSites();
    await reloadProjects();
    await reloadShifts();

    // Cargar equipo si el bloque existe en la página
    if ($('usersList')){
      try{ await reloadUsers(); renderUsers(); }catch(e){ /* ya mostramos arriba si falla */ }
    }
  });
} // fin IS_CONFIG_PAGE







