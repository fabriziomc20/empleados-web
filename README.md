# Empleados Web

Interfaz HTML para la gestión de recursos humanos.

## Desarrollo

Este proyecto no utiliza un sistema de build. Para probar las interacciones dinámicas basadas en [HTMX](https://htmx.org) y [Alpine.js](https://alpinejs.dev), sirve el sitio con un servidor local, por ejemplo:

```bash
python -m http.server
```

Luego abre `html/config.html` en tu navegador.

## Estructura

- `html/`: plantillas HTML (formularios, consultas, paneles y parciales).
- `css/`: hojas de estilo compartidas.
- `js/`: scripts JavaScript para cada pantalla.
