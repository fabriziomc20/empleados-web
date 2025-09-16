<script>
/* Loader global: crea overlay una vez y expone helpers */
(function(){
  const backdrop = document.createElement('div');
  backdrop.className = 'app-loader-backdrop';
  backdrop.innerHTML = `
    <div class="app-loader" role="status" aria-live="polite" aria-label="Cargando">
      <div class="spin" aria-hidden="true"></div>
      <div class="txt">Cargando…</div>
    </div>
  `;
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(backdrop);
  });

  let pending = 0;
  let hideTimer = null;
  function open(){ clearTimeout(hideTimer); backdrop.classList.add('is-open'); }
  function close(){ hideTimer = setTimeout(()=>backdrop.classList.remove('is-open'), 120); } // evita “parpadeo”

  const AppLoader = {
    show(){ pending++; open(); },
    hide(){ pending = Math.max(0, pending-1); if(pending===0) close(); },
    /** Envuelve una promesa y muestra el loader hasta que resuelva */
    async wrap(promise){
      AppLoader.show();
      try { return await promise; }
      finally { AppLoader.hide(); }
    }
  };

  // Opcional: interceptar fetch automáticamente (descomenta si lo prefieres)
  // const _fetch = window.fetch.bind(window);
  // window.fetch = async (...args) => AppLoader.wrap(_fetch(...args));

  window.AppLoader = AppLoader;
})();
</script>
