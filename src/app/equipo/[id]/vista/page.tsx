'use client';
import { use } from 'react';
import { CmHome } from '@/components/cm-home';

/** "Ver como": la pantalla de una CM, para que Dafne vea lo mismo que ella. Solo para mirar. */
export default function CmPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <div className="cm-preview"><CmHome previewCmId={id}/></div>;
}
