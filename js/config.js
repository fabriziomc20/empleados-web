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

  // ---- EMPRESA ----
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

    if(!data){
      window._currentOrgId = null;
      showMsg('ok','No hay empresa registrada aún.');
      return;
    }
    if(empRuc)  empRuc.value  = data.ruc || '';
    if(empName) empName.value = data.name || '';
    if(empLogo) empLogo.value = data.logo_url || '';

    // Guardar empresa activa para accesos/usuarios
    window._currentOrgId = data.id;
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
    const { data, error } = await supabase.from('employers').upsert(payload, { onConflict: 'ruc' }).select('id').maybeSingle();
    if(error) throw error;
    // Si crea por primera vez, conservar id
    if (data?.id) window._currentOrgId = data.id;
    showMsg('ok','Empresa guardada/actualizada.');
  }

  // ---- RÉGIMEN ----
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
    const { data, error } = await supabase
      .from('employer_tax_history')
      .select('valid_from, valid_to, regimes_tax ( code, name )')
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
    if (cur && taxValidFrom) taxValidFrom.value = cur.valid_from;
  }

  async function loadTaxHistory(){
    const { data, error } = await supabase
      .from('employer_tax_history')
      .select('id, valid_from, valid_to, regimes_tax ( code, name )')
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
    const taxRegime    = document.getElementById('taxRegime');
    const taxValidFrom = document.getElementById('taxValidFrom');

    const v = normalizeDateInput(taxValidFrom);
    const args = { regime_code: taxRegime?.value };
    if (v) args.vfrom = v;             // si está vacío, que la RPC use current_date

    const { error } = await supabase.rpc('set_employer_regime', args);
    if(error) throw error;

    showMsg('ok', 'Régimen actualizado.');
    await loadCurrentTax();
  }

  // ---- Listados (Sedes / Proyectos / Turnos) ----
  async function reloadSites(){
    const { data, error } = await supabase
      .from('sites').select('id, code, name').order('id', { ascending: true });
    if(error) throw error;
    window._sitesCached = data || [];
  }
  async function reloadProjects(){
    const { data, error } = await supabase
      .from('projects').select('id, code, name').order('id', { ascending: true });
    if(error) throw error;
    window._projectsCached = data || [];
  }
  async function reloadShifts(){
    const { data, error } = await supabase
      .from('shifts').select('id, name, start_time, end_time').order('id', { ascending: true });
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

  async function modalDelete(kind, id){
    if(kind==='tax'){ return; }
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

  async function openSitesModal(){
    const { data, error } = await supabase.from('sites').select('id,code,name').order('id',{ascending:true});
    if (error) { alert(error.message); return; }
    window._sitesCached = data || [];
    openModal("Sedes", window._sitesCached, [
      { header:"ID", field:"id" },
      { header:"Código", field:"code" },
      { header:"Nombre", field:"name" },
    ], "sites");
  }
  async function openProjectsModal(){
    const { data, error } = await supabase.from('projects').select('id,code,name').order('id',{ascending:true});
    if (error) { alert(error.message); return; }
    window._projectsCached = data || [];
    openModal("Proyectos", window._projectsCached, [
      { header:"ID", field:"id" },
      { header:"Código", field:"code" },
      { header:"Nombre", field:"name" },
    ], "projects");
  }
  async function openShiftsModal(){
    const { data, error } = await supabase.from('shifts').select('id,name,start_time,end_time').order('id',{ascending:true});
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
  // USUARIOS & PERMISOS (Acceso a la app)
  // =========================

  const usersState = {
    items: [],
    page: 1,
    perPage: 10,
    filter: ''
  };

  function getOrgIdOrWarn(){
    const orgId = window._currentOrgId;
    if(!orgId){
      showMsg('err','Primero crea/selecciona la empresa (org) y guarda.');
      throw new Error('Sin org_id');
    }
    return orgId;
  }

  function readAdvancedPerms(){
    // Si el admin no abrió el details, asumimos permisos por rol (en el server)
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
    const modeInvite   = $('modeInvite');
    const modePassword = $('modePassword');
    const passwordBox  = $('passwordBox');
    const password     = $('userPass')?.value || '';
    const password2    = $('userPass2')?.value || '';
    const forceReset   = !!$('forceReset')?.checked;

    if(!full_name || !email || !role){ showMsg('err','Completa nombre, correo y rol.'); return; }
    const org_id = getOrgIdOrWarn();

    let mode = 'invite';
    if (modePassword?.checked){
      mode = 'password';
      if(!password || !password2){ showMsg('err','Ingresa y repite la contraseña temporal.'); return; }
      if(password !== password2){ showMsg('err','Las contraseñas no coinciden.'); return; }
      if(password.length < 8){ showMsg('err','La contraseña debe tener al menos 8 caracteres.'); return; }
    }

    const perms = readAdvancedPerms();

    // Llamamos a Edge Function para NO exponer service key en el frontend.
    try{
      const { data, error } = await supabase.functions.invoke('admin_invite_user', {
        body: { mode, org_id, email, full_name, role, perms, password, forceReset }
      });
      if(error) throw error;
      showMsg('ok', data?.message || (mode==='invite'
        ? 'Invitación enviada.'
        : 'Usuario creado con contraseña temporal.'));
      // Limpia formulario
      $('userName') && ( $('userName').value = '' );
      $('userEmail') && ( $('userEmail').value = '' );
      if(passwordBox){ 
        $('userPass') && ( $('userPass').value = '' );
        $('userPass2') && ( $('userPass2').value = '' );
      }
      await reloadUsers();
      renderUsers();
    }catch(e){
      // Si no está creada la Function, dejamos mensaje claro
      showMsg('err', e?.message || 'No se pudo invitar/crear usuario. Verifica la Edge Function admin_invite_user.');
    }
  }

  async function reloadUsers(){
    // NOTA: Idealmente tienes una vista que junte memberships + profiles.
    // Aquí intentamos memberships con profile enlazado.
    const org_id = getOrgIdOrWarn();
    const { data, error } = await supabase
      .from('memberships')
      .select(`
        user_id,
        role,
        status,
        is_enabled,
        profiles:user_id ( full_name, email )
      `)
      .eq('org_id', org_id)
      .order('role', { ascending: true });
    if(error){ showMsg('err', 'Error cargando usuarios: ' + error.message); return; }
    usersState.items = (data || []).map(row => ({
      user_id: row.user_id,
      full_name: row.profiles?.full_name || '(sin nombre)',
      email: row.profiles?.email || '(sin correo)',
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
          const org_id = getOrgIdOrWarn();
          const { data, error } = await supabase.functions.invoke('admin_manage_user', {
            body: { action:'resend', org_id, user_id }
          });
          if(error) throw error;
          showMsg('ok', data?.message || 'Invitación reenviada.');
        }catch(e){ showMsg('err', e.message || 'Error al reenviar invitación.'); }
      }

      if (act === 'toggle'){
        try{
          const org_id = getOrgIdOrWarn();
          const { data, error } = await supabase.functions.invoke('admin_manage_user', {
            body: { action:'toggle', org_id, user_id }
          });
          if(error) throw error;
          showMsg('ok', data?.message || 'Estado actualizado.');
          await reloadUsers(); renderUsers();
        }catch(e){ showMsg('err', e.message || 'Error al cambiar estado.'); }
      }

      if (act === 'remove'){
        if(!confirm('¿Quitar acceso de este usuario?')) return;
        try{
          const org_id = getOrgIdOrWarn();
          const { data, error } = await supabase.functions.invoke('admin_manage_user', {
            body: { action:'remove', org_id, user_id }
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
        const org_id = getOrgIdOrWarn();
        const { data, error } = await supabase.functions.invoke('admin_manage_user', {
          body: { action:'set_role', org_id, user_id, role:newRole }
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

    // Ver historial (sin usar global window.*)
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

    // Crear sede / proyecto / turno
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

    // === UI: Mostrar/Ocultar caja de contraseña según modo elegido ===
    const modeInvite   = $('modeInvite');
    const modePassword = $('modePassword');
    const passwordBox  = $('passwordBox');
    function refreshPasswordBox(){
      if(passwordBox){
        passwordBox.style.display = (modePassword && modePassword.checked) ? 'block' : 'none';
      }
    }
    modeInvite && modeInvite.addEventListener('change', refreshPasswordBox);
    modePassword && modePassword.addEventListener('change', refreshPasswordBox);
    refreshPasswordBox();

    // === Botón invitar (si existe en la página) ===
    $('btnInviteUser') && $('btnInviteUser').addEventListener('click', (e)=>{
      e.preventDefault();
      inviteUser().catch(err=>showMsg('err', err.message));
    });
    $('btnInviteReset') && $('btnInviteReset').addEventListener('click', ()=>{
      const fields = ['userName','userEmail','userPass','userPass2'];
      fields.forEach(id=>{ const el=$(id); if(el) el.value=''; });
      $('inviteMsg') && ( $('inviteMsg').textContent = '' );
      if(modeInvite) modeInvite.checked = true;
      refreshPasswordBox();
    });

    // Init
    try{
      const taxValidFrom = $('taxValidFrom');
      if(taxValidFrom) taxValidFrom.value = todayISO();
      await loadEmployer();           // ← fija _currentOrgId si hay empresa
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







