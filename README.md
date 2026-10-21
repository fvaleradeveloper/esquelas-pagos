# Esquelas de Pago - Condominio Puerta de Hierro

Sistema de gestión de lecturas de agua, cobros de mantenimiento y generación de esquelas de pago.

## Despliegue en Vercel

Esta es una aplicación web estática (HTML + JS + CSS). Se despliega directamente en Vercel sin necesidad de build:

1. Sube este repositorio a GitHub.
2. Conecta el repositorio en [Vercel](https://vercel.com).
3. Vercel detectará automáticamente que es un sitio estático y desplegará `index.html`.

## Tecnologías

- HTML5, CSS (Tailwind CSS via CDN), JavaScript vanilla
- jsPDF + AutoTable (generación de PDF)
- SweetAlert2 (notificaciones)
- Font Awesome (iconos)
- Electron (opcional, para versión de escritorio `.exe`)

## Estructura

```
index.html          # Aplicación principal (single-page)
assets/main.js      # Script de Electron (versión escritorio)
vendor/             # Librerías estáticas (CSS, JS, fuentes)
electron.js         # Punto de entrada Electron
vercel.json         # Configuración para despliegue en Vercel
```

## Notas

- Los datos se guardan en `localStorage` del navegador (no hay backend).
- Para usar la versión de escritorio, descarga el `.exe` desde las releases de GitHub.