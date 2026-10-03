'use client';
import { Check, CheckCheck, Circle } from 'lucide-react';
import { nextStage, STAGE_LABEL, type Stage } from '@/lib/content';

/** Los tildes de WhatsApp: ○ pendiente, ✓ enviado por WhatsApp, ✓✓ subido al Drive. Un toque avanza un paso. */
export function StageButton({ stage, text, onChange, disabled }: { stage: Stage; text: string; onChange: (next: Stage) => void; disabled?: boolean }) {
  const Icon = stage === 'drive' ? CheckCheck : stage === 'whatsapp' ? Check : Circle;
  return <button type="button" className={`stage-row stage-${stage}`} disabled={disabled} onClick={() => onChange(nextStage(stage))}
    aria-label={`${text}: ${STAGE_LABEL[stage]}. Tocá para pasar a ${STAGE_LABEL[nextStage(stage)].toLowerCase()}.`}>
    <span className="stage-tick" aria-hidden="true"><Icon size={18} strokeWidth={2.4}/></span>
    <span className="min-w-0 flex-1 text-left">{text}</span>
    <span className="stage-label">{stage === 'pendiente' ? '' : stage === 'whatsapp' ? 'WhatsApp' : 'Drive'}</span>
  </button>;
}
