# Dafne · Coberturas

Prototipo funcional de gestión de coberturas de contenido, con Next.js App Router, TypeScript y Tailwind CSS.

## Ejecutar

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abrí `http://localhost:3000`. Para validar: `pnpm test`, `pnpm lint` y `pnpm build`. Este proyecto usa `pnpm-lock.yaml`; no ejecutes `npm install` sobre el `node_modules` creado por pnpm, porque npm intenta resolver sus enlaces internos como dependencias propias.

## Qué funciona

- Inicio con alertas, próximas coberturas, saldos y resumen mensual.
- Alta y edición de coberturas, asignaciones, confirmaciones, gastos, checklist y entrega.
- Equipo con honorario habitual, historial y saldos.
- Cobros parciales y liquidaciones parciales a CM por conceptos pendientes. Las reglas de importes están en `src/lib/domain.ts`.
- Datos ficticios iniciales y persistencia en `localStorage` del navegador, implementada en `src/lib/repository.ts`.

## Modo demo

Los datos solo están en este dispositivo y navegador. No hay cuentas, sincronización, base de datos, comprobantes reales, notificaciones ni integraciones externas. Para uso real hay que conectar Supabase, incorporar autenticación y políticas de acceso, migrar los datos y revisar el flujo de ajustes o devoluciones de eventos ya cobrados.
