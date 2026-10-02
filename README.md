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
- Ingreso con email y contraseña, y datos guardados en Supabase desde `src/lib/repository.ts`.

## Datos y cuenta (Supabase)

Los datos viven en tablas: `salons`, `cms`, `coverages`, `assignments`, `expenses`, `checklist_items`, `collections`, `cm_payments` y `payment_allocations` (cómo se reparte cada pago entre honorarios y reintegros). Cada fila tiene dueña (`owner_id`) y las políticas de seguridad hacen que cada cuenta vea solo lo suyo. Las claves foráneas impiden borrar algo que tiene cobros o pagos asociados.

La app sigue trabajando con un único objeto en memoria (`Db`). Al guardar, `src/lib/rows.ts` calcula qué filas cambiaron y las manda a la función `save_changes`, que las aplica en una sola transacción: se guarda todo o nada. Al volver a la pestaña, la app recarga los datos para ver lo cargado desde otro dispositivo.

**Roles.** Hay una coordinadora (Dafne) y las CM. La coordinadora usa las tablas directamente. Las CM nunca las tocan: ven sus fechas, el contenido a cubrir y sus pagos a través de la función `cm_home`, y solo pueden confirmar o rechazar sus fechas (`cm_set_confirmation`) y tildar contenido (`cm_set_checklist`). No ven el acordado con el salón, los honorarios de otras ni las ganancias. Una CM se reconoce porque el email con el que ingresa es el de su ficha en Equipo.

Configuración, una sola vez:

1. En Supabase, abrí **SQL Editor** y ejecutá completos, en orden, `supabase/migrations/0001_schema.sql` y `supabase/migrations/0002_roles.sql`.
2. En **Authentication > Sign In / Providers > Email**, desactivá **Allow new users to sign up**, para que nadie pueda crearse una cuenta.
3. En **Authentication > Users > Add user**, creá el usuario de Dafne con email y contraseña, y marcá **Auto Confirm User**.
4. Marcá a Dafne como coordinadora desde el **SQL Editor** (con su email real):
   ```sql
   insert into public.coordinators (user_id)
   select id from auth.users where email = 'email-de-dafne@ejemplo.com';
   ```
5. Copiá `.env.example` como `.env.local` y completá las tres variables (**Project Settings > API Keys**). `SUPABASE_SECRET_KEY` es secreta: solo la usa el servidor para crear los accesos de las CM.
6. En Vercel, cargá las mismas tres variables en **Settings > Environment Variables** y volvé a desplegar.

La primera vez que Dafne entra, la cuenta arranca vacía. Para crear coberturas hace falta cargar al menos un salón (en Equipo). Para darle acceso a una CM, Dafne carga su email en la ficha y toca **Acceso**: la app genera una contraseña provisoria para pasarle por WhatsApp.
