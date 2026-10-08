'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { partyTypeOf } from '@/lib/domain';
import { templateFor, type Templates } from '@/lib/templates';
import type { ChecklistItem } from '@/lib/types';

// Las listas se leen una vez y se comparten entre pantallas (el formulario rápido, la fiesta y la sección de listas).
let cache: Templates | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const load = () => loading ??= (async () => {
  const { data } = await supabaseBrowser().from('content_templates').select('party_type, items');
  cache = Object.fromEntries(((data ?? []) as { party_type: string; items: unknown }[]).map(r => [r.party_type, Array.isArray(r.items) ? r.items.filter((x): x is string => typeof x === 'string') : []]));
  emit();
})().catch(() => { loading = null; });

/** Las listas de contenido de Dafne (null mientras cargan) y cómo guardar una. */
export function useContentTemplates() {
  const templates = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => cache, () => null);
  useEffect(() => { if (!cache) void load(); }, []);
  const save = async (type: string, items: string[]) => {
    const clean = items.map(x => x.trim()).filter(Boolean);
    const sb = supabaseBrowser();
    const { error } = clean.length
      ? await sb.from('content_templates').upsert({ party_type: type, items: clean, updated_at: new Date().toISOString() }, { onConflict: 'owner_id,party_type' })
      : await sb.from('content_templates').delete().eq('party_type', type);
    if (error) throw new Error('No se pudo guardar la lista. Probá de nuevo.');
    cache = { ...(cache ?? {}), [type]: clean }; emit();
  };
  return { templates, save };
}

/** Los contenidos con los que arranca una fiesta de ese tipo (vacío si no hay lista). */
export function startingChecklist(templates: Templates | null, partyType: string, id: () => string): ChecklistItem[] {
  return templateFor(templates ?? {}, partyTypeOf(partyType)).items.map(text => ({ id: id(), text, done: false, stage: 'pendiente' }));
}
