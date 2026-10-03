'use client';
import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Modal } from './ui';
import { QuickCoverageForm } from './quick-coverage-form';
import { QuickTransfer } from './quick-transfer';
import { UberFromReceipt } from './uber-from-receipt';

/**
 * El botón "+" de Dafne, en todas las pantallas: nueva cobertura, cargar un comprobante de
 * transferencia o un recibo de Uber. Las opciones quedan montadas aunque el menú esté cerrado,
 * para que lo que abren (el selector de archivo, la revisión del Uber) siga funcionando.
 */
export function QuickActions() {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return <>
    {open && <button type="button" className="fab-backdrop" aria-label="Cerrar" onClick={() => setOpen(false)}/>}
    <div className={`fab-menu ${open ? 'is-open' : ''}`} aria-hidden={!open} onClick={() => setOpen(false)}>
      <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17}/> Nueva cobertura</button>
      <QuickTransfer/>
      <UberFromReceipt label="Cargar recibo de Uber"/>
    </div>
    <button type="button" className={`fab ${open ? 'is-open' : ''}`} aria-label={open ? 'Cerrar' : 'Cargar algo nuevo'} aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? <X size={26}/> : <Plus size={28}/>}</button>
    {creating && <Modal title="Nueva cobertura" onClose={() => setCreating(false)}><QuickCoverageForm onDone={() => setCreating(false)}/></Modal>}
  </>;
}
