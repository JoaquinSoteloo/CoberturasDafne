/** Lo que ganó una CM: solo sus honorarios (los reintegros de Uber no son ganancia), por fecha de la fiesta. */
export type EarningConcept = { coverage_id: string; starts_at: string; kind: 'fee' | 'expense'; amount_cents: number };

export function cmEarnings(concepts: EarningConcept[], month: string) {
  const fees = concepts.filter(c => c.kind === 'fee');
  const inMonth = fees.filter(c => c.starts_at.startsWith(month));
  return {
    parties: new Set(inMonth.map(c => c.coverage_id)).size,
    monthCents: inMonth.reduce((s, c) => s + c.amount_cents, 0),
    yearCents: fees.filter(c => c.starts_at.startsWith(month.slice(0, 4))).reduce((s, c) => s + c.amount_cents, 0),
  };
}
