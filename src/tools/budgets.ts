import { z } from 'zod';
import { ProductiveAPIClient } from '../api/client.js';

const getBudgetBurnSchema = z.object({
  project_id: z.string().optional().describe('Filter to a specific project ID'),
  status: z.enum(['active', 'all']).default('active').optional().describe('Project status filter'),
  limit: z.number().min(1).max(50).default(20).optional().describe('Max number of deals to analyse'),
});

export const getBudgetBurnTool = {
  name: 'get_budget_burn',
  description: `Analyse budget burn for rb2 projects. Returns budget value, invoiced amount, burn %, remaining budget, and over/under status. Use this to identify projects at risk of overrun. Each deal shows: total budget, spent (invoiced), burn rate, and a RAG status (🟢 <70% / 🟡 70-90% / 🔴 >90% or over budget).`,
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Filter to a specific project ID' },
      status: { type: 'string', enum: ['active', 'all'], description: 'Project status filter', default: 'active' },
      limit: { type: 'number', description: 'Max deals to analyse (default 20)', default: 20 },
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

    const budgetDeals = deals.filter((d: any) => {
      const bt = d.attributes?.budget_type;
      return bt === 1 || bt === 2; // 1=deal, 2=budget
    }).slice(0, params.limit ?? 20);

    if (budgetDeals.length === 0) {
      return { content: [{ type: 'text', text: 'No deals/budgets found for the given filters.' }] };
    }

    const lines: string[] = ['# Budget Burn Analysis\n'];

    let totalBudget = 0;
    let totalSpent = 0;
    const atRisk: string[] = [];

    for (const deal of budgetDeals) {
      const attr = deal.attributes ?? {};
      const name = attr.name ?? `Deal ${deal.id}`;
      const budget = (attr.budget_total ?? 0) / 100; // cents → EUR
      const invoiced = (attr.invoiced_amount ?? attr.total_invoiced ?? 0) / 100;
      const remaining = budget - invoiced;
      const burnPct = budget > 0 ? Math.round((invoiced / budget) * 100) : 0;

      totalBudget += budget;
      totalSpent += invoiced;

      const rag = burnPct >= 100 ? '🔴' : burnPct >= 90 ? '🔴' : burnPct >= 70 ? '🟡' : '🟢';
      if (burnPct >= 70) atRisk.push(`${rag} ${name} (${burnPct}%)`);

      lines.push(`## ${rag} ${name} (Deal ${deal.id})`);
      lines.push(`- Budget: €${budget.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`);
      lines.push(`- Invoiced/Spent: €${invoiced.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`);
      lines.push(`- Remaining: €${remaining.toLocaleString('nl-NL', { minimumFractionDigits: 0 })}`);
      lines.push(`- Burn: ${burnPct}%`);
      lines.push('');
    }

    const totalBurnPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
    lines.unshift(`**Portfolio total: €${totalBudget.toLocaleString('nl-NL')} budgeted | €${totalSpent.toLocaleString('nl-NL')} spent | ${totalBurnPct}% burn**\n`);

    if (atRisk.length > 0) {
      lines.push('---');
      lines.push('## ⚠️ At Risk (≥70% burned)');
      atRisk.forEach(r => lines.push(`- ${r}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error fetching budget data: ${err.message}` }] };
  }
}
