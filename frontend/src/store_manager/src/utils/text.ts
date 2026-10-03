import type { IssueReport } from '@/types';
import { pad2 } from './date';

/** "Yoghurt Crates", 1 -> "yoghurt crate"; 3 -> "yoghurt crates" */
export function unitName(itemName: string, qty: number) {
  const lower = itemName.toLowerCase();
  if (qty !== 1) return lower;
  return /(x|ch|sh|ss)es$/.test(lower) ? lower.slice(0, -2) : lower.replace(/s$/, '');
}

/** "01 yoghurt crate damaged - crushed / leaking" */
export function describeReport(r: IssueReport) {
  const base = `${pad2(r.quantity)} ${unitName(r.itemName, r.quantity)} ${r.kind}`;
  return r.reasons.length ? `${base} - ${r.reasons.map((x) => x.toLowerCase()).join(' / ')}` : base;
}
