/** Lo de arriba de "Mis pagos": lo que ganó en el año hasta hoy y lo que le falta cobrar. */
export type SummaryConcept = {
  coverage_id: string; starts_at: string; kind: 'fee' | 'expense' | 'edit'; amount_cents: number; paid_cents: number;
  /** Ediciones: se le deben recién cuando la entregó. */
  edit_status?: 'pedida' | 'entregada' | null;
};

/** ¿Ya lo hizo? Una cobertura o un Uber, si la fiesta ya pasó; una edición, si la entregó. */
export const isDone = (c: Pick<SummaryConcept, 'kind' | 'starts_at' | 'edit_status'>, today: string) =>
  c.kind === 'edit' ? c.edit_status === 'entregada' : c.starts_at.slice(0, 10) <= today;

export function cmSummary(concepts: SummaryConcept[], today: string) {
  const year = today.slice(0, 4);
  const done = (c: SummaryConcept) => isDone(c, today);
  const owed = (c: SummaryConcept) => Math.max(0, c.amount_cents - c.paid_cents);
  const sum = (xs: SummaryConcept[], f: (c: SummaryConcept) => number) => xs.reduce((s, c) => s + f(c), 0);
  // Ganado: coberturas de fiestas que ya hizo y ediciones que entregó este año (los Ubers son viáticos, no ganancia).
  const earnedFees = concepts.filter(c => c.kind === 'fee' && done(c) && c.starts_at.startsWith(year));
  const earnedEdits = concepts.filter(c => c.kind === 'edit' && done(c) && c.starts_at.startsWith(year));
  const owedFees = sum(concepts.filter(c => c.kind === 'fee' && done(c)), owed);
  const owedUbers = sum(concepts.filter(c => c.kind === 'expense'), owed);
  const owedEdits = sum(concepts.filter(c => c.kind === 'edit' && done(c)), owed);
  return {
    year,
    earned: sum([...earnedFees, ...earnedEdits], c => c.amount_cents),
    parties: new Set(earnedFees.map(c => c.coverage_id)).size,
    collected: sum([...earnedFees, ...earnedEdits], c => Math.min(c.paid_cents, c.amount_cents)),
    owedFees, owedUbers, owedEdits, owed: owedFees + owedUbers + owedEdits,
    // Coberturas de fiestas que todavía no hizo y ediciones sin entregar: no son deuda todavía.
    upcoming: sum(concepts.filter(c => c.kind !== 'expense' && !done(c)), owed),
  };
}
