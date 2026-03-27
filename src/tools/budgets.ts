import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';

const getBudgetBurnSchema = z.object({
  project_id: z.string().optional().describe('Filter to a specific project ID'),
  limit: z.number().min(1).max(100).default(30).optional().describe('Max number of budgets to analyse'),
  min_burn_pct: z.number().min(0).max(200).default(0).optional().describe('Only show budgets above this burn % (e.g. 70 for at-risk only)'),
});

export const getBudgetBurnTool = {
  name: 'get_budget_burn',
  description: `Analyse budget burn for rb2 projects. Returns budget value, amount spent, burn %, remaining, and RAG status per budget deal. RAG: 🟢 <70% / 🟡 70-90% / 🔴 >90%. Use min_burn_pct=70 to show only at-risk projects.`,
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Filter to a specific project ID' },
      limit: { type: 'number', description: 'Max budgets to analyse (default 30)', default: 30 },
      min_burn_pct: { type: 'number', description: 'Only show budgets above this burn % (default 0 = all)', default: 0 },
    },
  },
};

export async function getBudgetBurnTool_handler(
  client: ProductiveAPIClient,
  args: unknown
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const params = getBudgetBurnSchema.parse(args ?? {});

  try {
    const deals = await client.listDeals({ project_id: params.project_id });

    // Filter to budget deals only (budget: true) and those with a non-zero budget
    const budgetDeals = deals
      .filter((d: any) => d.attributes?.budget === true && (d.attributes?.budget_total ?? 0) > 0)
      .slice(0, params.limit ?? 30);

    if (budgetDeals.length === 0) {
      return { content: [{ type: 'text', text: 'No budget deals found.' }] };
    }

    const lines: string[] = [];
    let totalBudget = 0;
    let totalSpent = 0;
    const atRisk: string[] = [];
    const shown: string[] = [];

    for (const deal of budgetDeals) {
      const attr = deal.attributes ?? {};
      const name = attr.name ?? `Deal ${deal.id}`;
      const budget = (attr.budget_total ?? 0) / 100;       // total budget in EUR
      const spent = (attr.budget_used ?? 0) / 100;         // actual spend in EUR
      const invoiced = (attr.invoiced ?? 0) / 100;         // invoiced in EUR
      const remaining = budget - spent;
      const burnPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;

      totalBudget += budget;
      totalSpent += spent;

      const rag = burnPct >= 100 ? '🔴' : burnPct >= 90 ? '🔴' : burnPct >= 70 ? '🟡' : '🟢';
      if (burnPct >= 70) atRisk.push(`${rag} ${name} (${burnPct}%)`);

      if (burnPct >= (params.min_burn_pct ?? 0)) {
        shown.push(`## ${rag} ${name}`);
        shown.push(`- Budget: €${budget.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`);
        shown.push(`- Spent: €${spent.toLocaleString('nl-NL', { minimumFractionDigits: 0 })} (${burnPct}%)`);
        shown.push(`- Invoiced: €${invoiced.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`);
        shown.push(`- Remaining: €${remaining.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`);
        shown.push('');
      }
    }

    const totalBurnPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    const totalRag = totalBurnPct >= 90 ? '🔴' : totalBurnPct >= 70 ? '🟡' : '🟢';

    lines.push('# Budget Burn Analysis\n');
    lines.push(`${totalRag} **Portfolio: €${totalBudget.toLocaleString('nl-NL')} budgeted | €${totalSpent.toLocaleString('nl-NL')} spent | ${totalBurnPct}% burn**`);
    lines.push(`${atRisk.length} of ${budgetDeals.length} budgets at risk (≥70%)\n`);

    if (atRisk.length > 0) {
      lines.push('## ⚠️ At Risk');
      atRisk.forEach(r => lines.push(`- ${r}`));
      lines.push('');
      lines.push('---\n');
    }

    lines.push(...shown);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error fetching budget data: ${err.message}` }] };
  }
}
