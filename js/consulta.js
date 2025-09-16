/* ====== Helpers básicos ====== */
const API_BASE = "https://empleados-api-o6yy.onrender.com";
const API_CANDIDATOS = `${API_BASE}/api/candidatos`;

const $ = (id)=>document.getElementById(id);
function showMsg(type, text){ const box=$('msg'); box.className=type==='ok'?'ok':'err'; box.textContent=text; box.style.display='block'; }
function clearMsg(){ const box=$('msg'); box.style.display='none'; box.textContent=''; box.className=''; }
function tagEstado(estado){
  const s=(estado||'').toUpperCase();
  if (s==='APROBADO') return `<span class="tag apr">Aprobado</span>`;
  if (s==='CANCELADO') return `<span class="tag can">Cancelado</span>`;
  return `<span class="tag rev">En revisión</span>`;
}
function iconoDot(url){ return `<span class="dot ${url?'ok':'miss'}" title="${url?'cargado':'faltante'}"></span>`; }

/* ====== Estado de UI / Resultados ====== */
let RAW = [];            // resultados crudos
let FILTERED = [];       // tras búsqueda rápida y orden
let page = 1;
let pageSize = 25;
let sortKey = 'fecha';
let sortDir = 'desc';    // 'asc' | 'desc'
let SERVER_TOTAL = 0; // NEW: total devuelto por backend

/* ====== URL <-> Estado ====== */
function readURL(){
  const u = new URL(location.href);
  const get = (k,def='') => u.searchParams.get(k) ?? def;

  const modo = get('modo','fecha');
  document.querySelector(`input[name="modo"][value="${modo}"]`).checked = true;
  $('filtroAno').value = get('ano','TODOS');
  $('filtroMes').value = get('mes','TODOS');
  $('filtroEstado').value = get('estado','');
  $('grupoInicio').value = get('gini','');
  $('grupoFin').value = get('gfin','');
  $('q').value = get('q','');
  page = parseInt(get('p','1')) || 1;
  pageSize = parseInt(get('ps','25')) || 25;
  $('pageSize').value = String(pageSize);
  applyModeDisable();
}
function writeURL(){
  const u = new URL(location.href);
  const modo = document.querySelector('input[name="modo"]:checked').value;
  const ano = $('filtroAno').value;
  const mes = $('filtroMes').value;
  const estado = $('filtroEstado').value;
  const gini = $('grupoInicio').value.trim();
  const gfin = $('grupoFin').value.trim();
  const q = $('q').value.trim();

  u.searchParams.set('modo', modo);
  u.searchParams.set('ano', ano);
  u.searchParams.set('mes', mes);
  u.searchParams.set('estado', estado);
  if(gini) u.searchParams.set('gini', gini); else u.searchParams.delete('gini');
  if(gfin) u.searchParams.set('gfin', gfin); else u.searchParams.delete('gfin');
  if(q) u.searchParams.set('q', q); else u.searchParams.delete('q');
  u.searchParams.set('p', String(page));
  u.searchParams.set('ps', String(pageSize));
  history.replaceState(null, '', u.toString());
}

/* ====== Filtros ====== */
function applyModeDisable(){
  const modo = document.querySelector('input[name="modo"]:checked').value;
  const byFecha = (modo === 'fecha');
  ['filtroAno','filtroMes','filtroEstado'].forEach(id=>$(id).disabled = !byFecha);
  ['grupoInicio','grupoFin'].forEach(id=>$(id).disabled = byFecha);
}

/* ====== Fetch de datos ====== */
async function consultar(){
  clearMsg();
  applyModeDisable();
  writeURL();

  const modo = document.querySelector('input[name="modo"]:checked').value;
  const estado = $('filtroEstado').value;
  let url = new URL(API_CANDIDATOS);

  if(modo === "fecha"){
    const ano = $('filtroAno').value;
    const mes = $('filtroMes').value;
    if (mes !== "TODOS" && ano === "TODOS"){
      showMsg('err', "Si seleccionas un mes específico, el año no puede ser TODOS.");
      return;
    }
    if (ano !== "TODOS") url.searchParams.set("ano", ano);
    if (mes !== "TODOS") url.searchParams.set("mes", mes);
  } else {
    const ini = $('grupoInicio').value.trim();
    const fin = $('grupoFin').value.trim();
    if (ini && !fin) { url.searchParams.set("grupoInicio", ini); url.searchParams.set("grupoFin", ini); }
    if (ini && fin)  { url.searchParams.set("grupoInicio", ini); url.searchParams.set("grupoFin", fin); }
  }
  if (estado) url.searchParams.set("estado", estado);

  // NEW: paginación en servidor
  const limit = pageSize;
  const offset = (page - 1) * pageSize;
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  renderSkeleton();

  try{
    const res = await fetch(url.toString());
    if(!res.ok){
      const clone=res.clone(); let detalle="";
      try{ const d=await clone.json(); detalle=d?.error||JSON.stringify(d) }catch{ try{ detalle=await clone.text(); }catch{} }
      throw new Error(`HTTP ${res.status} – ${detalle||'Error'}`);
    }

    const payload = await res.json();
    // Compat: si el backend viejo devuelve array, seguimos funcionando
    RAW = Array.isArray(payload) ? payload : (payload.items || []);
    SERVER_TOTAL = Array.isArray(payload) ? RAW.length : (payload.total || RAW.length);

    // Nota: al consultar cambiamos a página 1 sólo si venimos de otra búsqueda.
    // Si quieres siempre resetear página, descomenta:
    // page = 1;

    applySearchSortPaginate();

    if (SERVER_TOTAL === 0) showMsg('ok','Sin resultados con los filtros seleccionados.');
  }catch(e){
    console.error(e);
    showMsg('err', `Error al consultar: ${e.message}`);
    renderTabla([]);
    SERVER_TOTAL = 0;
    $('resume').textContent = '0 resultados';
    $('pageInfo').textContent = '1 / 1';
  }
}


/* ====== Búsqueda + orden + paginación ====== */
function applySearchSortPaginate(){
  const q = $('q').value.trim().toLowerCase();

  // Filtramos sólo lo que llegó en esta página (búsqueda rápida local)
  FILTERED = RAW.filter(r=>{
    if(!q) return true;
    return (String(r.dni_numero||'').toLowerCase().includes(q) ||
            String(r.nombre_completo||'').toLowerCase().includes(q));
  });

  // Orden local sobre la página actual
  FILTERED.sort((a,b)=>{
    let va = a[sortKey]; let vb = b[sortKey];
    if (sortKey === 'fecha') { va = (a.fecha || a.created_at || a.createdAt || ''); vb = (b.fecha || b.created_at || b.createdAt || ''); }
    const na = Number(va), nb = Number(vb);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return sortDir==='asc' ? na-nb : nb-na;
    if(typeof va === 'string') va = va.toLowerCase();
    if(typeof vb === 'string') vb = vb.toLowerCase();
    if(va < vb) return sortDir==='asc' ? -1 : 1;
    if(va > vb) return sortDir==='asc' ? 1 : -1;
    return 0;
  });

  renderTabla(FILTERED);

  // Info de paginación usando el total del servidor
  const maxPage = Math.max(1, Math.ceil(SERVER_TOTAL / pageSize));
  $('resume').textContent = q
    ? `${FILTERED.length} resultado${FILTERED.length!==1?'s':''} (de ${SERVER_TOTAL})`
    : `${SERVER_TOTAL} resultado${SERVER_TOTAL!==1?'s':''}`;
  $('pageInfo').textContent = `${page} / ${maxPage}`;
}

/* ===== Esto es para desahilitar los botones deretroceso y avance en extremos ===== */
function updatePagerDisabled(){
  const maxPage = Math.max(1, Math.ceil(SERVER_TOTAL / pageSize));
  $('prevPage').disabled = (page <= 1);
  $('nextPage').disabled = (page >= maxPage);
}

/* ====== Render ====== */
function renderSkeleton(){
  const tbody = document.querySelector('#tabla tbody');
  tbody.innerHTML = '';
  for(let i=0;i<6;i++){
    const tr = document.createElement('tr');
    tr.className = 'skeleton';
    tr.innerHTML = '<td colspan="11"></td>';
    tbody.appendChild(tr);
  }
}
function renderTabla(lista){
  const tbody = document.querySelector('#tabla tbody');
  tbody.innerHTML = "";
  if(!lista || lista.length===0){
    tbody.innerHTML = `<tr><td colspan="11">No se encontraron registros</td></tr>`;
    return;
  }
  for(const c of lista){
    const fechaNorm = (c.fecha || c.created_at || c.createdAt || '').slice(0,10);
    const count = Number.isFinite(c.doc_count) ? c.doc_count : null; // puede venir undefined si backend viejo
    const label = Number.isFinite(count) ? `Documentos (${count})` : `Documentos`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${tagEstado(c.estado)}</td>
      <td>${fechaNorm}</td>
      <td>${c.dni_numero || ''}</td>
      <td>${c.nombre_completo || ''}</td>
      <td>${c.sede || ''}</td>
      <td>${c.turno_horario || ''}</td>
      <td>${c.grupo || ''}</td>
      <td style="text-align:center">${iconoDot(c.dni_doc)}</td>
      <td style="text-align:center">${iconoDot(c.cv_doc)}</td>
      <td>
        <button class="btn-doc"
                data-cid="${c.id}"
                ${Number.isFinite(count) ? `data-count="${count}"` : ``}
                onclick="openDocs(${c.id})">${label}</button>
      </td>
      <td>
        ${String(c.estado||'').toUpperCase() !== 'APROBADO'
          ? `<button onclick="aprobar(${c.id})" style="margin-bottom:6px">Aprobar</button><br/>` : ``}
        <a href="formularioweb.html?id=${c.id}">Editar</a>
      </td>
    `;
    tbody.appendChild(tr);
  }
}


/* ====== Modal de Documentos ====== */
let CURRENT_CANDIDATE_ID = null;

function openDocs(id){
  CURRENT_CANDIDATE_ID = id;
  $('docBackdrop').classList.add('open');
  $('docTitle').textContent = `Documentos del candidato #${id}`;
  $('docClose').focus();
  loadDocs(id);
}
function closeDocs(){
  $('docBackdrop').classList.remove('open');
  CURRENT_CANDIDATE_ID = null;
  $('docTbody').innerHTML = `<tr><td colspan="4" class="small">Cargando…</td></tr>`;
}
$('docClose').addEventListener('click', closeDocs);
$('docBackdrop').addEventListener('click', (e)=>{ if(e.target.id==='docBackdrop') closeDocs(); });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDocs(); });

async function loadDocs(id){
  try{
    const res = await fetch(`${API_CANDIDATOS}/${id}`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const docs = Array.isArray(data.documentos) ? data.documentos : [];
    renderDocs(docs);
    
    // NEW: si el botón no tenía count, lo actualizamos aquí
    const btn = document.querySelector(`.btn-doc[data-cid="${id}"]`);
    if (btn) {
      btn.dataset.count = String(docs.length);
      btn.textContent = `Documentos (${docs.length})`;
    }
  }catch(e){
    console.error(e);
    $('docTbody').innerHTML = `<tr><td colspan="4" class="small">Error cargando documentos</td></tr>`;
  }
}

function renderDocs(docs){
  const tbody = $('docTbody');
  if(!docs.length){
    tbody.innerHTML = `<tr><td colspan="4" class="small">Sin documentos</td></tr>`;
    return;
  }
  tbody.innerHTML = docs.map(d=>{
    const fecha = (d.created_at || '').slice(0,19).replace('T',' ');
    const safeURL = encodeURIComponent(d.url || '');
    return `
      <tr>
        <td><span class="pill-tipo">${(d.tipo||'').toUpperCase()}</span></td>
        <td>
          <span class="file-pill">
            📄 <a href="${d.url}" target="_blank" rel="noopener">Abrir</a>
          </span>
        </td>
        <td>${fecha}</td>
        <td>
          <button class="btn-link danger" onclick="deleteDoc('${safeURL}')">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

/* Subir */
$('docForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!CURRENT_CANDIDATE_ID) return;
  const tipo = $('docTipo').value;
  const file = $('docFile').files[0];
  if(!tipo || !file){ return; }

  const fd = new FormData();
  fd.append('tipo', tipo);
  fd.append('file', file);

  try{
    // Ajusta si tu endpoint difiere
    const res = await fetch(`${API_CANDIDATOS}/${CURRENT_CANDIDATE_ID}/documentos`, {
      method:'POST',
      body: fd
    });
    if(!res.ok){
      const txt = await res.text().catch(()=> '');
      throw new Error(`HTTP ${res.status} ${txt}`);
    }
    $('docFile').value = '';
    $('docTipo').value = '';
    await loadDocs(CURRENT_CANDIDATE_ID);
    await consultar(); // refrescar puntos
  }catch(e){
    console.error(e);
    alert('Error subiendo documento: ' + e.message);
  }
});
$('docReset').addEventListener('click', ()=>{
  $('docFile').value = '';
  $('docTipo').value = '';
});

/* Eliminar */
async function deleteDoc(encodedUrl){
  if(!CURRENT_CANDIDATE_ID) return;
  if(!confirm('¿Eliminar este documento?')) return;

  try{
    // Ajusta si tu endpoint difiere
    const res = await fetch(`${API_CANDIDATOS}/${CURRENT_CANDIDATE_ID}/documentos?url=${encodedUrl}`, {
      method:'DELETE'
    });
    if(!res.ok){
      const txt = await res.text().catch(()=> '');
      throw new Error(`HTTP ${res.status} ${txt}`);
    }
    await loadDocs(CURRENT_CANDIDATE_ID);
    await consultar(); // refrescar puntos
  }catch(e){
    console.error(e);
    alert('Error eliminando documento: ' + e.message);
  }
}

/* ====== Eventos UI ====== */
document.querySelectorAll('input[name="modo"]').forEach(r=> r.addEventListener('change', applyModeDisable));
$('btnConsultar').addEventListener('click', consultar);

/* Quick search con debounce */
let t = null;
$('q').addEventListener('input', ()=>{
  clearTimeout(t);
  t = setTimeout(()=>{ page=1; applySearchSortPaginate(); writeURL(); }, 250);
});

/* Orden por columnas */
document.querySelectorAll('#tabla thead th.sortable').forEach(th=>{
  th.addEventListener('click', ()=>{
    const key = th.dataset.key;
    if(sortKey === key){ sortDir = (sortDir==='asc'?'desc':'asc'); }
    else { sortKey = key; sortDir = (key==='fecha'?'desc':'asc'); }
    document.querySelectorAll('#tabla thead th.sortable').forEach(x=>x.classList.remove('asc','desc'));
    th.classList.add(sortDir);
    page = 1;
    applySearchSortPaginate();
    writeURL();
  });
});

/* Paginación */
$('pageSize').addEventListener('change', ()=>{
  pageSize = parseInt($('pageSize').value) || 25;
  page = 1;
  applySearchSortPaginate();
  writeURL();
});
$('prevPage').addEventListener('click', ()=>{
  if(page>1){ page--; applySearchSortPaginate(); writeURL(); }
});
$('nextPage').addEventListener('click', ()=>{
  const maxPage = Math.max(1, Math.ceil(FILTERED.length / pageSize));
  if(page<maxPage){ page++; applySearchSortPaginate(); writeURL(); }
});

/* Aprobar candidato */
async function aprobar(id){
  if(!confirm("¿Marcar candidato como APROBADO?")) return;
  try{
    const res = await fetch(`${API_CANDIDATOS}/${id}/estado`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "Aprobado" })
    });
    if(!res.ok){
      const clone=res.clone(); let detalle="";
      try{ const d=await clone.json(); detalle=d?.error||JSON.stringify(d) }catch{ try{ detalle=await clone.text(); }catch{} }
      throw new Error(`HTTP ${res.status} – ${detalle||'Error'}`);
    }
    showMsg('ok', 'Candidato aprobado.');
    await consultar();
  }catch(e){
    console.error(e);
    showMsg('err', `Error al aprobar: ${e.message}`);
  }
}

/* Inicialización */
document.addEventListener('DOMContentLoaded', ()=>{
  readURL();
  consultar();
});
