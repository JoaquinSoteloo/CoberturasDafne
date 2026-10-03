import type { SupabaseClient } from '@supabase/supabase-js';

/** Comprobantes de gastos: archivos privados en "<id del gasto>/<archivo>". */
const BUCKET = 'comprobantes';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1600;

/** Achica una foto antes de subirla (una captura de Uber queda en unos 200 KB). Los PDF van tal cual. */
export async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // por ejemplo, una HEIC en un navegador que no la abre: se sube como está
  }
}

const extension = (blob: Blob, name: string) =>
  blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/jpeg' ? 'jpg' : (name.split('.').pop() || 'img').toLowerCase();

/** Sube el comprobante y lo vincula al gasto. Si había otro, lo borra. Devuelve la ubicación nueva. */
export async function attachReceipt(supabase: SupabaseClient, expenseId: string, file: File, previous?: string | null) {
  const blob = await shrink(file);
  if (blob.size > MAX_BYTES) throw new Error('El archivo pesa más de 5 MB. Probá con una captura de pantalla.');
  const path = `${expenseId}/${crypto.randomUUID()}.${extension(blob, file.name)}`;
  const storage = supabase.storage.from(BUCKET);
  const { error: uploadError } = await storage.upload(path, blob, { contentType: blob.type || undefined, upsert: false });
  if (uploadError) throw new Error('No se pudo subir el archivo. Revisá la conexión y probá de nuevo.');
  const { error } = await supabase.rpc('set_expense_receipt', { p_expense: expenseId, p_path: path });
  if (error) { await storage.remove([path]); throw new Error(error.message || 'No se pudo guardar el comprobante.'); }
  if (previous) await storage.remove([previous]);
  return path;
}

export async function removeReceipt(supabase: SupabaseClient, expenseId: string, path: string) {
  const { error } = await supabase.rpc('set_expense_receipt', { p_expense: expenseId, p_path: null });
  if (error) throw new Error(error.message || 'No se pudo quitar el comprobante.');
  await supabase.storage.from(BUCKET).remove([path]);
}

/** La CM borra un Uber que cargó ella (y no está pago). El archivo lo limpia después el despachador. */
export async function deleteCmUber(supabase: SupabaseClient, expenseId: string) {
  const { error } = await supabase.rpc('cm_delete_uber', { p_expense: expenseId });
  if (error) throw new Error(error.message || 'No se pudo borrar el Uber.');
}

/** Abre el comprobante con un link que vence a los 5 minutos. */
export async function openReceipt(supabase: SupabaseClient, path: string) {
  // La ventana se abre antes de esperar el link: si no, el celular la bloquea como ventana emergente.
  const tab = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) { tab?.close(); throw new Error('No se pudo abrir el comprobante.'); }
  if (tab) tab.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}
