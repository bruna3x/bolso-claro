import type { RecurringItem } from '../types';
import { safeDay, todayISO } from '../lib/format';

function stepMonths(frequency: RecurringItem['frequency']): number { return ({ weekly: 0, fortnightly: 0, monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 } as const)[frequency]; }
export function occurrencesThrough(item: RecurringItem, through = todayISO()): string[] {
  const start = new Date(`${item.startDate}T12:00:00`); const end = item.endDate ? new Date(`${item.endDate}T12:00:00`) : undefined;
  const limit = new Date(`${through}T12:00:00`); const dates: string[] = [];
  for (let i = 0; i < 240; i++) {
    let date: Date;
    if (item.frequency === 'weekly' || item.frequency === 'fortnightly') date = new Date(start.getTime() + i * (item.frequency === 'weekly' ? 7 : 14) * 86_400_000);
    else { const base = new Date(start.getFullYear(), start.getMonth() + i * stepMonths(item.frequency), 1); date = new Date(base.getFullYear(), base.getMonth(), safeDay(item.dueDay || start.getDate(), base.getFullYear(), base.getMonth()), 12); }
    if (date < start) continue; if (date > limit || (end && date > end)) break;
    dates.push(date.toLocaleDateString('en-CA'));
  }
  return dates;
}
export function insightText(category: string, spent: number, budget: number): string | undefined {
  if (budget <= 0 || spent <= budget) return undefined;
  const delta = Math.round((spent - budget) * 100 / budget);
  return `${category} está ${delta}% acima do orçamento.`;
}
export function monthChangeInsight(category: string, current: number, previous: number): string | undefined {
  if (previous <= 0 || current === previous) return undefined;
  const delta = Math.round(Math.abs(current - previous) * 100 / previous);
  return `Você ${current < previous ? 'gastou' : 'gastou'} ${delta}% ${current < previous ? 'menos' : 'mais'} com ${category} que no mês passado.`;
}
export function goalPaceInsight(name: string, target: number, saved: number, monthsLeft: number): string | undefined {
  if (monthsLeft <= 0 || target <= 0 || saved >= target) return undefined;
  const needed = (target - saved) / monthsLeft;
  return needed > 0 ? `Para atingir ${name}, faltam ${monthsLeft} ${monthsLeft === 1 ? 'mês' : 'meses'}; são necessários ${Math.ceil(needed / 100)} por mês.` : undefined;
}
