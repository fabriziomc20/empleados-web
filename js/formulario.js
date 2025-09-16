/* activar link activo */
document.querySelectorAll('.nav a').forEach(a=>{
  const href=a.getAttribute('href');
  if (href && location.pathname.endsWith(href)){
    a.classList.add('active');
    a.setAttribute('aria-current','page');
  }
});

/* mensajes */
function showMsg(type, text){ const box=document.getElementById('msg'); box.className=type==='ok'?'ok':'err'; box.textContent=text; box.style.display='block'; }
function fmtSize(b){ return b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(1)} MB`; }

/* dropzones */
function initDropzone({inputId, dropId, listId, multiple=true}){
  const input=document.getElementById(inputId), drop=document.getElementById(dropId), list=document.getElementById(listId);
  input._dt=new DataTransfer();
  const openPicker=()=>input.click();
  drop.addEventListener('click', openPicker); drop.addEventListener('dblclick', openPicker);
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drop--hover')}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drop--hover')}));
  drop.addEventListener('drop',e=>addFiles(Array.from(e.dataTransfer.files||[])));
  input.addEventListener('change',()=>addFiles(Array.from(input.files||[])));
  function addFiles(files){ for(const f of files){ if(!multiple && input._dt.files.length>0){ input._dt=new DataTransfer(); } input._dt.items.add(f); }
    input.files=input._dt.files; renderList(); }
  function removeAt(idx){ const dt=new DataTransfer(); Array.from(input._dt.files).forEach((f,i)=>{ if(i!==idx) dt.items.add(f); });
    input._dt=dt; input.files=input._dt.files; renderList(); }
  function renderList(){ list.innerHTML=''; Array.from(input._dt.files).forEach((f,i)=>{ const li=document.createElement('li');
    li.innerHTML=`<span class="truncate" title="${f.name}">${f.name}</span><span class="small">${fmtSize(f.size)}</span>`;
    const btn=document.createElement('button'); btn.type='button'; btn.textContent='Quitar'; btn.className='chip';
    btn.addEventListener('click',()=>removeAt(i)); li.appendChild(btn); list.appendChild(li); }); }
  return { clear:()=>{ input._dt=new DataTransfer(); input.files=input._dt.files; list.innerHTML=''; } };
}
const dzDni=initDropzone({inputId:'dniInput',dropId:'dniDrop',listId:'dniList',multiple:true});
const dzCertificados=initDropzone({inputId:'certificadosInput',dropId:'certificadosDrop',listId:'certificadosList',multiple:true});
const dzAntecedentes=initDropzone({inputId:'antecedentesInput',dropId:'antecedentesDrop',listId:'antecedentesList',multiple:true});
const dzMedicos=initDropzone({inputId:'medicosInput',dropId:'medicosDrop',listId:'medicosList',multiple:true});
const dzCapacitacion=initDropzone({inputId:'capacitacionInput',dropId:'capacitacionDrop',listId:'capacitacionList',multiple:true});
const dzCV=initDropzone({inputId:'cvInput',dropId:'cvDrop',listId:'cvList',multiple:false});

/* API */
const API_BASE = "https://empleados-api-o6yy.onrender.com";
const API_CANDIDATOS = `${API_BASE}/api/candidatos`;
const SITES = `${API_BASE}/api/sites`;
const SHIFTS = `${API_BASE}/api/shifts`;

/* Combobox genérico (versión robusta) */
function createCombobox(opts) {
  var input   = document.getElementById(opts.inputId);
  var list    = document.getElementById(opts.listboxId);
  var hidden  = document.getElementById(opts.hiddenId);
  var combo   = input ? input.closest(".combo") : null;
  var toggle  = combo ? combo.querySelector(".combo-toggle") : null;

  var open = false;
  var activeIndex = -1;
  var allItems = Array.isArray(opts.items) ? opts.items.slice() : [];
  var curItems = allItems.slice();

  function setOpen(v){
    open = !!v;
    if (combo) combo.setAttribute("aria-expanded", open ? "true" : "false");
    if (list)  list.style.display = open ? "block" : "none";
  }

  function toLabel(it){ return (opts.toLabel ? String(opts.toLabel(it)) : String(it)); }
  function toValue(it){ return (opts.toValue ? String(opts.toValue(it)) : String(it)); }

  function render(){
    var q = (input.value || "").toLowerCase().trim();
    curItems = allItems.filter(function(it){ return toLabel(it).toLowerCase().indexOf(q) !== -1; });

    if (curItems.length === 0) {
      list.innerHTML = '<li class="combo-empty">Sin resultados</li>';
      return;
    }

    var html = "";
    for (var i=0; i<curItems.length; i++){
      var isAct = (i === activeIndex) ? " is-active" : "";
      html += '<li role="option" id="' + opts.listboxId + '_opt_' + i + '" class="combo-opt' + isAct + '">' +
              toLabel(curItems[i]) + '</li>';
    }
    list.innerHTML = html;
  }

  function commit(it){
    input.value  = toLabel(it);
    hidden.value = toValue(it);
    setOpen(false);
  }

  input.addEventListener("focus", function(){ render(); setOpen(true); });
  input.addEventListener("click", function(){ render(); setOpen(!open); });
  input.addEventListener("input", function(){ activeIndex=-1; render(); setOpen(true); });

  input.addEventListener("keydown", function(e){
    if(!open && (e.key === "ArrowDown" || e.key === "Enter")) { render(); setOpen(true); return; }
    if(e.key === "ArrowDown"){ if(curItems.length){ activeIndex = Math.min(activeIndex+1, curItems.length-1); render(); } e.preventDefault(); }
    if(e.key === "ArrowUp"){ if(curItems.length){ activeIndex = Math.max(activeIndex-1, 0); render(); } e.preventDefault(); }
    if(e.key === "Enter"){
      if(open && curItems[activeIndex]){ commit(curItems[activeIndex]); e.preventDefault(); }
      else setOpen(false);
    }
    if(e.key === "Escape"){ setOpen(false); }
  });

  list.addEventListener("mousedown", function(e){
    var li = e.target.closest('li[role="option"]');
    if(!li) return;
    var i = Array.prototype.indexOf.call(list.children, li);
    if(i>=0 && curItems[i]) commit(curItems[i]);
  });

  if (toggle){
    toggle.addEventListener("click", function(e){
      e.stopPropagation();
      if (list.style.display !== "block") { render(); }
      setOpen(list.style.display !== "block");
      input.focus();
    });
  }

  document.addEventListener("click", function(e){
    if(combo && !combo.contains(e.target)) setOpen(false);
  });

  return {
    updateItems: function(newItems){
      allItems = Array.isArray(newItems) ? newItems.slice() : [];
      if (allItems.length === 0){
        list.innerHTML = '<li class="combo-empty">Sin resultados</li>';
        setOpen(false);
      }
    }
  };
}

/* Combos de Sede y Turno */
let cbSede, cbTurno;

async function populateSites(){
  try{
    const r = await fetch(SITES);
    const data = r.ok ? await r.json() : [];
    const items = data.map(s=>({ id:s.id, code:s.code, name:s.name || s.code || '' }));
    if (cbSede) cbSede.updateItems(items);
  }catch(e){ console.error(e); }
}
async function populateShifts(){
  try{
    const r = await fetch(SHIFTS);
    const data = r.ok ? await r.json() : [];
    const items = data.map(sh=>{
      const label = (sh.start_time && sh.end_time) ? `${sh.name} (${sh.start_time}–${sh.end_time})` : (sh.name || '');
      return { id:sh.id, name:sh.name || '', label };
    });
    if (cbTurno) cbTurno.updateItems(items);
  }catch(e){ console.error(e); }
}

/* ========= NORMALIZACIÓN EN VIVO DEL DNI ========= */
const dniEl = document.getElementById('dni');
const dniHint = document.getElementById('dniHint');
const form = document.getElementById('formEmpleado');
const submitBtn = document.getElementById('btnSubmit');

function sanitizeDNI(v){
  return (v || '').replace(/\D+/g,'').slice(0,10);
}
function updateDNIState(){
  const v = sanitizeDNI(dniEl.value);
  if (dniEl.value !== v) dniEl.value = v;

  const ok = v.length === 8;
  dniEl.setAttribute('aria-invalid', ok ? 'false' : 'true');
  dniEl.setCustomValidity(ok ? '' : 'El DNI debe tener 8 dígitos');
  dniHint.classList.toggle('hint--error', !ok);
  submitBtn.disabled = !ok;
}
dniEl.addEventListener('input', updateDNIState);
dniEl.addEventListener('blur', updateDNIState);

/* ========= NORMALIZACIÓN EN EL SUBMIT =========
   - trim() extremos
   - colapsar espacios internos
   - mayúsculas
   - DNI: solo dígitos (8)
=============================================== */
form.addEventListener('submit', async (ev)=>{
  ev.preventDefault();

  updateDNIState();
  if (!form.checkValidity()) {
    showMsg('err','Revisa los campos resaltados.');
    return;
  }

  const fd = new FormData(form);

  // Normalizar todos los campos de texto
  for (const [key, value] of fd.entries()) {
    if (typeof value === 'string') {
      let v = value.trim().replace(/\s+/g, ' ');
      if (key === 'dni') {
        v = sanitizeDNI(v); // solo dígitos, máx 8
      } else {
        v = v.toUpperCase(); // mayúsculas para strings comunes
      }
      fd.set(key, v);
    }
  }

  try{
    const res = await fetch(API_CANDIDATOS, { method:"POST", body: fd });
    if(!res.ok){
      const clone=res.clone(); let detalle="";
      try{ const d=await clone.json(); detalle=d?.error||JSON.stringify(d) }catch{ try{ detalle=await clone.text(); }catch{} }
      throw new Error(`HTTP ${res.status} – ${detalle||'Error'}`);
    }
    showMsg('ok','Candidato registrado');
    dzDni.clear(); dzCertificados.clear(); dzAntecedentes.clear(); dzMedicos.clear(); dzCapacitacion.clear(); dzCV.clear();
    form.reset();
    submitBtn.disabled = true;
    dniEl.setAttribute('aria-invalid','false');
    dniHint.classList.remove('hint--error');
  }catch(e){
    console.error(e);
    showMsg('err',`Error al enviar: ${e.message}`);
  }
});

document.getElementById('btnReset').addEventListener('click',()=>{
  dzDni.clear(); dzCertificados.clear(); dzAntecedentes.clear(); dzMedicos.clear(); dzCapacitacion.clear(); dzCV.clear();
  form.reset();
  submitBtn.disabled = true;
  dniEl.setAttribute('aria-invalid','true');
  dniHint.classList.remove('hint--error');
});

/* menú móvil + combos */
function closeMenu(){
  document.body.classList.remove('menu-open');
  document.getElementById('menuBtn').setAttribute('aria-expanded','false');
}
document.addEventListener('DOMContentLoaded', async ()=>{
  const btn=document.getElementById('menuBtn');
  const backdrop=document.getElementById('backdrop');
  btn?.addEventListener('click',()=>{
    const open=document.body.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded',open);
  });
  backdrop?.addEventListener('click',closeMenu);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeMenu(); });

  cbSede = createCombobox({
    inputId:'sede_input',
    listboxId:'sede_listbox',
    hiddenId:'sede',
    items:[],
    toLabel:(it)=> it.name,
    toValue:(it)=> it.name
  });

  cbTurno = createCombobox({
    inputId:'turno_input',
    listboxId:'turno_listbox',
    hiddenId:'turno_horario',
    items:[],
    toLabel:(it)=> it.label,
    toValue:(it)=> it.name
  });

  await Promise.all([populateSites(), populateShifts()]);

  // Estado inicial del DNI/submit
  updateDNIState();
});
