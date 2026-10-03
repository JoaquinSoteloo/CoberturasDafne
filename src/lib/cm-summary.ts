/** Lo de arriba de "Mis pagos": lo que ganó en el año hasta hoy y lo que le falta cobrar. */
export type SummaryConcept = { coverage_id: string; starts_at: string; kind: 'fee' | 'expense'; amount_cents: number; paid_cents: number };

export function cmSummary(concepts: SummaryConcept[], today: string) {
  const year = today.slice(0, 4);
  const done = (c: SummaryConcept) => c.starts_at.slice(0, 10) <= today;
  const owed = (c: SummaryConcept) => Math.max(0, c.amount_cents - c.paid_cents);
  const sum = (xs: SummaryConcept[], f: (c: SummaryConcept) => number) => xs.reduce((s, c) => s + f(c), 0);
  // Ganado: coberturas de fiestas que ya hizo este año (los Ubers son viáticos, no ganancia).
  const earnedFees = concepts.filter(c => c.kind === 'fee' && done(c) && c.starts_at.startsWith(year));
  const owedFees = sum(concepts.filter(c => c.kind === 'fee' && done(c)), owed);
  const owedUbers = sum(concepts.filter(c => c.kind === 'expense'), owed);
  return {
    year,
    earned: sum(earnedFees, c => c.amount_cents),
    parties: new Set(earnedFees.map(c => c.coverage_id)).size,
    collected: sum(earnedFees, c => Math.min(c.paid_cents, c.amount_cents)),
    owedFees, owedUbers, owed: owedFees + owedUbers,
    // Coberturas de fiestas que todavía no hizo: no son deuda todavía.
    upcoming: sum(concepts.filter(c => c.kind === 'fee' && !done(c)), owed),
  };
}
