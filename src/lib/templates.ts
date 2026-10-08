/** Listas de contenido por tipo de fiesta. "General" es la de los tipos que no tienen la suya. */
export const GENERAL = 'General';
export type Templates = Record<string, string[]>;

/** Para arrancar: Dafne las ajusta a su manera. */
export const SUGGESTED: Templates = {
  '15 años': ['Historias de la entrada', 'Recepción y fotos con invitados', 'Entrada de la quinceañera', 'Vals', 'Torta y velas', 'Carioca', 'Reel resumen'],
  Boda: ['Llegada de los novios', 'Entrada al salón', 'Ceremonia o civil', 'Vals', 'Torta', 'Ramo y liga', 'Carioca', 'Reel resumen'],
  Cumpleaños: ['Llegada y ambientación', 'Entrada', 'Torta y velas', 'Baile', 'Reel resumen'],
  Egresados: ['Entrada de los egresados', 'Fotos grupales', 'Baile', 'Carioca', 'Reel resumen'],
  Bautismo: ['Ceremonia', 'Fotos con la familia', 'Torta', 'Reel resumen'],
  Comunión: ['Ceremonia', 'Fotos con la familia', 'Torta', 'Reel resumen'],
  Corporativo: ['Llegada y acreditación', 'Ambientación y marca', 'Discursos', 'Momentos destacados', 'Reel resumen'],
  [GENERAL]: ['Historias de la entrada', 'Momentos principales', 'Reel resumen'],
};

/**
 * La lista con la que arranca una fiesta. `type` es el tipo ya normalizado (partyTypeOf): si no
 * tiene lista propia, la General; si tampoco hay, vacía.
 */
export const templateFor = (templates: Templates, type: string): { type: string; items: string[] } => {
  if (type && templates[type]?.length) return { type, items: templates[type] };
  return { type: GENERAL, items: templates[GENERAL] ?? [] };
};
