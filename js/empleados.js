// ===== Config =====
const STATUS = {
  ACTIVO: { label: "Activo", pillCls: "pill--green" },
  EN_OBSERVACION: { label: "En observación", pillCls: "pill--yellow" },
  INACTIVO: { label: "Inactivo", pillCls: "pill--gray" },
};
const PAGE_SIZE = 24; // tamaño de página

// ===== Helpers =====
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function initials(fullName) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

// ===== Mock de servidor (reemplaza por tu API real) =====
// Genera ~96 empleados de ejemplo
const MOCK_DB = (() => {
  const base = [
    ["María Fernanda","Soto Rivas","72653412","Operaria de Producción","Pastelería Rauleti – Línea Tortas","ACTIVO","https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=240&q=60&auto=format&fit=crop"],
    ["Luis Alberto","Quispe Huamán","74811223","Auxiliar de Reparto","Delivery – Turno Mañana","EN_OBSERVACION",""],
    ["Karla","Paredes Silva","70998821","Operaria de Envasado","Pastelería Rauleti – Línea Postres","INACTIVO","https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&q=60&auto=format&fit=crop"],
    ["Miguel Ángel","Ramos Cárdenas","73652190","Operario de Horneado","Pastelería Rauleti – Línea Panadería","ACTIVO",""],
  ];
  const arr = [];
  for (let i=0;i<96;i++){
    const [n,a,d,c,p,s,f] = base[i%base.length];
    arr.push({
      id: `E-${(i+1).toString().padStart(3,"0")}`,
      nombres: n, apellidos: a, documento: `DNI ${parseInt(d)+i}`,
      cargo: c, proyecto: p, status: s, fotoUrl: f
    });
  }
  return arr;
})();

async function apiListEmployees({estado="ALL", q="", limit=PAGE_SIZE, offset=0}){
  // Simula latencia
  await new Promise(r=>setTimeout(r, 280));
  const ql = q.trim().toLowerCase();
  let data = MOCK_DB.filter(e => estado==="ALL" ? true : e.status===estado);
  if (ql){
    data = data.filter(e=>{
      const full = `${e.nombres} ${e.apellidos}`.toLowerCase();
      return full.includes(ql)
        || e.documento.toLowerCase().includes(ql)
        || e.cargo.toLowerCase().includes(ql)
        || e.proyecto.toLowerCase().includes(ql);
    });
  }
  const total = data.length;
  const items = data.slice(offset, offset+limit);
  return { items, total };
}

async function apiPatchStatus(id, nuevo_estado){
  // Simulación rápida
  await new Promise(r=>setTimeout(r, 150));
  const idx = MOCK_DB.findIndex(e=>e.id===id);
  if (idx>=0) MOCK_DB[idx].status = nuevo_estado;
  return { ok:true };
}

// ===== Estado UI =====
const state = {
  filter: "ALL",
  query: "",
  items: [],
  total: 0,
  limit: PAGE_SIZE,
  offset: 0,
  hasMore: true,
  loading: false,
  currentModalId: null,
};

// ===== Refs de UI =====
const grid = $("#grid");
const tplCard = $("#card-tpl");
const tplSkel = $("#skeleton-tpl");
const txtTotal = $("#txt-total");
const inputSearch = $("#input-search");
const btnLoad = $("#btn-load");
const sentinel = $("#sentinel");

// Modal refs
const modal = $("#modal");
const modalClose = $("#modalClose");
const mFoto = $("#mFoto");
const mTitle = $("#modalTitle");
const mDoc = $("#mDoc");
const mPill = $("#mPill");
const mCargo = $("#mCargo");
const mProyecto = $("#mProyecto");
const mVerPerfil = $("#mVerPerfil");

// ===== Render =====
function makeCard(emp){
  const node = tplCard.content.cloneNode(true);
  const img = node.querySelector(".avatar");
  const name = node.querySelector(".name");
  const pill = node.querySelector(".pill");
  const doc = node.querySelector(".doc");
  const cargo = node.querySelector(".cargo");
  const proyecto = node.querySelector(".proyecto");
  const btnView = node.querySelector(".btn-view");
  const buttons = node.querySelectorAll(".btn-chip");

  const fullName = `${emp.nombres} ${emp.apellidos}`;
  if (emp.fotoUrl){
    img.src = emp.fotoUrl; img.alt = fullName;
  } else {
    img.classList.add("avatar--placeholder");
    img.alt = initials(fullName);
    img.setAttribute("data-initials", initials(fullName));
  }

  name.textContent = fullName;
  doc.textContent = emp.documento;
  cargo.textContent = emp.cargo;
  proyecto.textContent = emp.proyecto;

  const st = STATUS[emp.status] ?? STATUS.INACTIVO;
  pill.textContent = st.label;
  pill.classList.add(st.pillCls);

  btnView.addEventListener("click", () => openModal(emp.id));

  buttons.forEach(b=>{
    const ns = b.dataset.status;
    if (ns===emp.status) b.classList.add("btn-chip--active");
    b.addEventListener("click", async ()=>{
      await changeStatus(emp.id, ns);
    });
  });

  const art = node.querySelector(".card");
  art.dataset.id = emp.id;
  return node;
}

function makeSkeleton(){
  return tplSkel.content.cloneNode(true);
}

function renderAppend(items){
  const frag = document.createDocumentFragment();
  items.forEach(emp => frag.appendChild(makeCard(emp)));
  grid.appendChild(frag);
}

function renderEmpty(){
  grid.innerHTML = `<div class="empty">No hay empleados con esos criterios.</div>`;
}

function setBusy(isBusy){
  grid.setAttribute("aria-busy", isBusy ? "true" : "false");
}

// ===== Carga y paginación =====
async function loadPage({reset=false} = {}){
  if (state.loading) return;
  state.loading = true;
  setBusy(true);

  // Skeletons
  const skFrag = document.createDocumentFragment();
  for (let i=0; i<Math.min(6, state.limit); i++) skFrag.appendChild(makeSkeleton());
  grid.appendChild(skFrag);

  if (reset){
    state.offset = 0;
    state.items = [];
    grid.innerHTML = "";
  }

  try{
    const { items, total } = await apiListEmployees({
      estado: state.filter, q: state.query, limit: state.limit, offset: state.offset
    });

    state.total = total;
    state.items = state.items.concat(items);
    state.offset += items.length;
    state.hasMore = state.offset < total;

    txtTotal.textContent = `${total} empleados`;

    if (state.items.length===0){
      renderEmpty();
    } else {
      renderAppend(items);
    }

    btnLoad.hidden = !state.hasMore;
  } finally {
    setBusy(false);
    state.loading = false;
  }
}

// ===== Infinite scroll =====
let io = null;
function setupObserver(){
  if (io) io.disconnect();
  io = new IntersectionObserver((entries)=>{
    const e = entries[0];
    if (e.isIntersecting && state.hasMore && !state.loading){
      loadPage();
    }
  }, {rootMargin: "120px"});
  io.observe(sentinel);
}

// ===== Filtros / búsqueda =====
function bindFilters(){
  $$(".chip").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      state.filter = btn.dataset.filter;
      $$(".chip").forEach(b=>b.classList.remove("chip--active"));
      btn.classList.add("chip--active");
      loadPage({reset:true});
    });
  });
  $('[data-filter="ALL"]').classList.add("chip--active");
}

function bindSearch(){
  let t=null;
  inputSearch.addEventListener("input", ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{
      state.query = inputSearch.value;
      loadPage({reset:true});
    }, 220);
  });
}

// ===== Cambios de estado =====
async function changeStatus(id, newStatus){
  // Optimista en UI (actualiza tarjeta y modal si corresponde)
  const idx = state.items.findIndex(e=>e.id===id);
  if (idx>=0){
    state.items[idx].status = newStatus;
    // Actualiza solo esa tarjeta
    const card = grid.querySelector(`.card[data-id="${id}"]`);
    if (card){
      // pill
      const pill = card.querySelector(".pill");
      pill.className = "pill"; // reset
      pill.textContent = STATUS[newStatus].label;
      pill.classList.add(STATUS[newStatus].pillCls);
      // chips
      card.querySelectorAll(".btn-chip").forEach(b=>{
        b.classList.toggle("btn-chip--active", b.dataset.status===newStatus);
      });
    }
  }
  // Modal
  if (state.currentModalId===id){
    mPill.className = "pill";
    mPill.textContent = STATUS[newStatus].label;
    mPill.classList.add(STATUS[newStatus].pillCls);
  }

  // Llamada a API real
  try{
    await apiPatchStatus(id, newStatus);
  }catch(e){
    alert("No se pudo actualizar el estado en el servidor.");
  }
}

// ===== Modal =====
function openModal(id){
  const emp = state.items.find(e=>e.id===id);
  if (!emp) return;
  state.currentModalId = id;

  const fullName = `${emp.nombres} ${emp.apellidos}`;
  if (emp.fotoUrl){
    mFoto.src = emp.fotoUrl; mFoto.alt = fullName;
    mFoto.classList.remove("avatar--placeholder");
  }else{
    mFoto.removeAttribute("src");
    mFoto.alt = initials(fullName);
    mFoto.classList.add("avatar--placeholder");
    mFoto.setAttribute("data-initials", initials(fullName));
  }

  mTitle.textContent = fullName;
  mDoc.textContent = emp.documento;
  mCargo.textContent = emp.cargo;
  mProyecto.textContent = emp.proyecto;

  mPill.className = "pill";
  mPill.textContent = STATUS[emp.status].label;
  mPill.classList.add(STATUS[emp.status].pillCls);

  // Botones de estado dentro del modal
  modal.querySelectorAll(".btn-chip").forEach(b=>{
    const ns = b.dataset.status;
    b.classList.toggle("btn-chip--active", ns===emp.status);
    b.onclick = ()=> changeStatus(emp.id, ns);
  });

  // Enlace a perfil completo (ajusta a tu ruta real)
  mVerPerfil.href = `empleado.html?id=${encodeURIComponent(emp.id)}`;

  modal.hidden = false;
  modal.dataset.open = "true";
  modalClose.focus();
}

function closeModal(){
  modal.hidden = true;
  modal.dataset.open = "false";
  state.currentModalId = null;
}

// ===== Sidebar toggle =====
function bindSidebarToggle(){
  const menuBtn = $("#menuBtn");
  const sidebar = $("#sidebar");
  const backdrop = $("#backdrop");
  if (!menuBtn || !sidebar || !backdrop) return;

  const open = () => { sidebar.classList.add("open"); backdrop.classList.add("show"); menuBtn.setAttribute("aria-expanded","true"); };
  const close = () => { sidebar.classList.remove("open"); backdrop.classList.remove("show"); menuBtn.setAttribute("aria-expanded","false"); };

  menuBtn.addEventListener("click", ()=>{
    const expanded = menuBtn.getAttribute("aria-expanded")==="true";
    expanded ? close() : open();
  });
  backdrop.addEventListener("click", close);
}

// ===== Eventos base =====
function bindBase(){
  $("#btn-nuevo")?.addEventListener("click", ()=> alert("Abrir formulario de nuevo empleado (pendiente)"));
  btnLoad.addEventListener("click", ()=> loadPage());
  modalClose.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e)=>{
    if (e.key==="Escape" && modal.dataset.open==="true") closeModal();
  });
  modal.addEventListener("click", (e)=>{
    if (e.target===modal) closeModal();
  });
}

// ===== Init =====
(async function init(){
  bindSidebarToggle();
  bindBase();
  bindFilters();
  bindSearch();
  setupObserver();

  await loadPage({reset:true});
})();

  
