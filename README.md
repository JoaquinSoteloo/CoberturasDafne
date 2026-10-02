# BS Marketing · Coberturas

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

**Comprobantes con IA (opcional).** En el detalle de una cobertura, "Cargar Uber desde comprobante" manda la captura o el PDF a OpenAI (`/api/receipt-scan`, solo para la coordinadora), que devuelve total, fecha, horarios y direcciones. Si es de ida o de vuelta lo decide la app (`src/lib/trip.ts`): por la dirección del salón o, si no, por el horario. Dafne siempre revisa y confirma antes de guardar. Requiere `OPENAI_API_KEY` en `.env.local` y en Vercel; sin ella, el botón avisa que falta configurarla.

**Avisos (notificaciones push).** Cada persona los activa desde su celular ("Activar avisos"). En iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o posterior). Hay cuatro: recordatorio 24 horas antes de cada fiesta (Dafne y CM asignadas que no rechazaron), fecha nueva (a la CM), confirmación o rechazo (a Dafne) y pago registrado (a la CM). Los anota la base en `private.notification_outbox` (triggers y `enqueue_due_reminders`) y los manda `/api/push/dispatch`, que Supabase llama cada minuto con `pg_cron` (migración 0007). Requiere `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `CRON_SECRET` en Vercel, y en el Vault de Supabase los secretos `app_url` y `cron_secret`.

**Mapa.** El detalle de la cobertura y las fechas de la CM muestran un mapa de la dirección (vista de Google sin clave) que al tocarlo abre Google Maps.

La primera vez que Dafne entra, la cuenta arranca vacía. Para crear coberturas hace falta cargar al menos un salón (en Equipo). Para darle acceso a una CM, Dafne carga su email en la ficha y toca **Acceso**: la app genera una contraseña provisoria para pasarle por WhatsApp.
