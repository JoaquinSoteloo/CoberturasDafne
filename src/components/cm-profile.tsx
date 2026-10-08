'use client';
import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Avatar } from './avatar';
import { PhotoCropper } from './photo-cropper';

export type Profile = { name: string; email: string; phone: string; alias: string; photo_path: string | null };

/**
 * "Mi perfil" de la CM: su foto, su teléfono y su alias (o CBU/CVU) para que Dafne le transfiera.
 * El nombre y el email los maneja Dafne (con el email entra a la app).
 */
export function CmProfile({ profile, preview, onChange, children }: { profile: Profile; preview: boolean; onChange: () => void; children?: React.ReactNode }) {
  const [phone, setPhone] = useState(profile.phone);
  const [alias, setAlias] = useState(profile.alias);
  const [busy, setBusy] = useState<'' | 'foto' | 'datos'>('');
  const input = useRef<HTMLInputElement>(null);
  const changed = phone.trim() !== profile.phone.trim() || alias.trim() !== profile.alias.trim();

  const [cropping, setCropping] = useState<File | null>(null);
  const savePhoto = async (blob: Blob) => {
    setCropping(null);
    setBusy('foto');
    try {
      const supabase = supabaseBrowser();
      const { data: cmId, error: idError } = await supabase.rpc('my_cm_id');
      if (idError || typeof cmId !== 'string') throw new Error('No se pudo identificar tu cuenta.');
      const path = `cm-${cmId}/${crypto.randomUUID()}.jpg`;
      const { error: upError } = await supabase.storage.from('perfiles').upload(path, blob, { contentType: 'image/jpeg' });
      if (upError) throw new Error('No se pudo subir la foto. Probá de nuevo.');
      const { error } = await supabase.rpc('cm_update_profile', { p_photo_path: path });
      if (error) { await supabase.storage.from('perfiles').remove([path]); throw new Error(error.message); }
      if (profile.photo_path) await supabase.storage.from('perfiles').remove([profile.photo_path]);
      toast.success('Foto actualizada'); onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo cambiar la foto.'); }
    finally { setBusy(''); }
  };

  const removePhoto = async () => {
    if (!profile.photo_path || !confirm('¿Sacar tu foto de perfil?')) return;
    setBusy('foto');
    const supabase = supabaseBrowser();
    const { error } = await supabase.rpc('cm_update_profile', { p_photo_path: '' });
    if (!error) await supabase.storage.from('perfiles').remove([profile.photo_path]);
    setBusy('');
    if (error) toast.error('No se pudo sacar la foto.'); else { toast.success('Foto quitada'); onChange(); }
  };

  const saveData = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('datos');
    const { error } = await supabaseBrowser().rpc('cm_update_profile', { p_phone: phone, p_alias: alias });
    setBusy('');
    if (error) { toast.error('No se pudieron guardar tus datos.'); return; }
    toast.success('Datos guardados'); onChange();
  };

  return <section className="space-y-6" aria-label="Mi perfil">
    <div className="card profile-card">
      <div className="relative">
        <Avatar name={profile.name} photoPath={profile.photo_path} size={96}/>
        <input ref={input} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCropping(f); }}/>
        {cropping && <PhotoCropper file={cropping} onCancel={() => setCropping(null)} onDone={savePhoto}/>}
        <button type="button" className="profile-photo-btn" aria-label="Cambiar foto" disabled={preview || !!busy} onClick={() => input.current?.click()}><Camera size={16}/></button>
      </div>
      <div className="min-w-0 text-center">
        <p className="text-xl font-extrabold">{profile.name}</p>
        <p className="muted text-sm">{profile.email}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-secondary btn-small" disabled={preview || !!busy} onClick={() => input.current?.click()}><Camera size={15}/>{busy === 'foto' ? 'Subiendo…' : profile.photo_path ? 'Cambiar foto' : 'Agregar foto'}</button>
        {profile.photo_path && <button type="button" className="btn btn-quiet btn-small" disabled={preview || !!busy} onClick={() => void removePhoto()}><Trash2 size={15}/> Sacar</button>}
      </div>
    </div>

    <form className="card space-y-4 p-5" onSubmit={e => void saveData(e)}>
      <h2 className="section-title">Mis datos</h2>
      <label className="block"><span className="label">Teléfono</span><input className="field" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="11 1234-5678" disabled={preview}/></label>
      <label className="block"><span className="label">Alias o CBU/CVU</span><input className="field" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={alias} onChange={e => setAlias(e.target.value)} placeholder="tu.alias.mp" disabled={preview}/><span className="muted mt-2 block text-sm">Para que Dafne te transfiera directo.</span></label>
      <p className="muted text-sm">Tu nombre y tu email los cambia Dafne. Con el email entrás a la app.</p>
      <button className="btn btn-primary" disabled={preview || !changed || !!busy}>{busy === 'datos' ? 'Guardando…' : 'Guardar'}</button>
    </form>

    {children}
  </section>;
}
