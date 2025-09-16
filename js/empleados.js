    // ===== Config de endpoints (ajusta a tu backend) =====
    const ENDPOINTS = {
      projects: '/api/catalog/projects', // GET -> [{id, code, name, site_id}]
      sites:    '/api/catalog/sites',    // GET -> [{id, code, name}]
      shifts:   '/api/catalog/shifts',   // GET -> [{id, name}]
      alta:     '/api/empleados/alta'    // POST <- JSON
    };

    const $ = (s, c=document)=>c.querySelector(s);
    const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));

    const form = $('#altaForm');
    const statusEl = $('#status');

    // ===== Cargar catálogos =====
    async function loadCatalogs(){
      try{
        const [projectsRes, sitesRes, shiftsRes] = await Promise.all([
          fetch(ENDPOINTS.projects),
          fetch(ENDPOINTS.sites),
          fetch(ENDPOINTS.shifts)
        ]);
        const [projects, sites, shifts] = await Promise.all([
          projectsRes.ok ? projectsRes.json() : [],
          sitesRes.ok ? sitesRes.json() : [],
          shiftsRes.ok ? shiftsRes.json() : []
        ]);
        fillSelect($('#proyecto'), projects, { placeholder:'Selecciona un proyecto…' });
        fillSelect($('#sede'), sites, { allowEmpty:true });
        fillSelect($('#turno'), shifts, { allowEmpty:true });
      }catch(e){
        console.error(e);
        $('#proyecto').innerHTML = '<option value="">(Error al cargar)</option>';
      }
    }

    function fillSelect(sel, items, opts={}){
      const { allowEmpty=false, placeholder=null } = opts;
      const optsHtml = [];
      if(placeholder) optsHtml.push(`<option value="">${placeholder}</option>`);
      if(allowEmpty && !placeholder) optsHtml.push('<option value="">(opcional)</option>');
      for(const it of items){
        // soporte id+name o code+name
        const val = it.id ?? it.code ?? '';
        const text = it.name ?? it.code ?? String(val);
        optsHtml.push(`<option value="${val}">${text}</option>`);
      }
      sel.innerHTML = optsHtml.join('');
    }

    // ===== Validación ligera =====
    function validate(){
      statusEl.textContent = '';
      const requiredIds = ['dni','genero','apepat','apemat','nombres','fecha_nac','dir1','proyecto'];
      for(const id of requiredIds){
        const el = document.getElementById(id);
        if(!el.value){ el.focus(); return { ok:false, msg:`Completa el campo requerido: ${el.labels?.[0]?.innerText || id}`}; }
      }
      const email = $('#email').value.trim();
      if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        $('#email').focus();
        return { ok:false, msg:'E-mail no válido' };
      }
      return { ok:true };
    }

    // ===== Envío =====
    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const v = validate();
      if(!v.ok){ statusEl.textContent = v.msg; statusEl.className = 'status bad'; return; }

      const payload = collectPayload();
      try{
        statusEl.textContent = 'Guardando…'; statusEl.className = 'status';
        const res = await fetch(ENDPOINTS.alta, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if(!res.ok){
          const err = await res.text();
          throw new Error(err || 'Error al guardar');
        }
        const data = await res.json().catch(()=>({}));
        statusEl.textContent = 'Guardado correctamente'; statusEl.className = 'status ok';
        // opcional: limpiar
        // form.reset();
      }catch(e){
        console.error(e);
        statusEl.textContent = 'No se pudo guardar: ' + e.message;
        statusEl.className = 'status bad';
      }
    });

    function collectPayload(){
      return {
        persona: {
          dni: $('#dni').value.trim(),
          status: 'ACTIVO', // alta inicial
          apellido_paterno: $('#apepat').value.trim(),
          apellido_materno: $('#apemat').value.trim(),
          nombres: $('#nombres').value.trim(),
          genero: $('#genero').value,
          discapacidad: $('#discapacidad').value || 'NINGUNA',
          fecha_nacimiento: $('#fecha_nac').value,
          direccion_1: $('#dir1').value.trim(),
          direccion_2: $('#dir2').value.trim() || null,
          celular: $('#celular').value.trim() || null,
          email: $('#email').value.trim() || null
        },
        asignacion: {
          project_id: selectValue('#proyecto'),
          site_id: selectValue('#sede'), // opcional
          shift_id: selectValue('#turno'), // opcional
          valid_from: $('#inicio_asig').value || null
        }
      };
    }

    function selectValue(sel){ const v = $(sel).value; return v === '' ? null : (isNaN(+v) ? v : +v); }

    // init
    loadCatalogs();
  
