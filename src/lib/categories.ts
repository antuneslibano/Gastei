import type { Category } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'alimentacao', name: 'Alimentação', icon: '🍽️', color: '#ef6c00', type: 'expense' },
  { id: 'mercado', name: 'Mercado', icon: '🛒', color: '#f9a825', type: 'expense' },
  { id: 'moradia', name: 'Moradia', icon: '🏠', color: '#6d4c41', type: 'expense' },
  { id: 'contas', name: 'Contas (luz, água, internet)', icon: '💡', color: '#00897b', type: 'expense' },
  { id: 'transporte', name: 'Transporte', icon: '🚗', color: '#1e88e5', type: 'expense' },
  { id: 'saude', name: 'Saúde', icon: '🩺', color: '#e53935', type: 'expense' },
  { id: 'educacao', name: 'Educação', icon: '📚', color: '#5e35b1', type: 'expense' },
  { id: 'lazer', name: 'Lazer', icon: '🎉', color: '#d81b60', type: 'expense' },
  { id: 'compras', name: 'Compras', icon: '🛍️', color: '#8e24aa', type: 'expense' },
  { id: 'assinaturas', name: 'Assinaturas', icon: '📺', color: '#3949ab', type: 'expense' },
  { id: 'pets', name: 'Pets', icon: '🐾', color: '#7cb342', type: 'expense' },
  { id: 'impostos', name: 'Impostos e taxas', icon: '🧾', color: '#546e7a', type: 'expense' },
  { id: 'dividas', name: 'Dívidas e empréstimos', icon: '💳', color: '#c62828', type: 'expense' },
  { id: 'outros-gastos', name: 'Outros', icon: '📦', color: '#757575', type: 'expense' },
  { id: 'salario', name: 'Salário', icon: '💼', color: '#0f9d58', type: 'income' },
  { id: 'extra', name: 'Renda extra', icon: '💰', color: '#43a047', type: 'income' },
  { id: 'investimentos', name: 'Investimentos', icon: '📈', color: '#00acc1', type: 'income' },
  { id: 'reembolso', name: 'Reembolso', icon: '↩️', color: '#26a69a', type: 'income' },
  { id: 'outras-receitas', name: 'Outras receitas', icon: '➕', color: '#9e9d24', type: 'income' },
];

export const PAYMENT_METHODS: { id: import('./types').PaymentMethod; label: string }[] = [
  { id: 'pix', label: 'Pix' },
  { id: 'debito', label: 'Débito' },
  { id: 'credito', label: 'Crédito' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'boleto', label: 'Boleto' },
  { id: 'transferencia', label: 'Transferência' },
  { id: 'outro', label: 'Outro' },
];

/** Sugestão automática de categoria a partir da descrição digitada. */
const KEYWORDS: [RegExp, string][] = [
  [/ifood|rappi|restaurante|lanche|pizza|hamburg|padaria|caf[eé]|almo[cç]o|jantar|bar\b/i, 'alimentacao'],
  [/mercado|supermerc|atacad|hortifruti|a[cç]ougue|feira/i, 'mercado'],
  [/aluguel|condom[ií]nio|iptu|financiamento (da )?casa|reforma/i, 'moradia'],
  [/luz|energia|enel|cemig|copel|light|[aá]gua|sabesp|internet|vivo|claro|tim\b|oi\b|g[aá]s|telefone/i, 'contas'],
  [/uber|99|combust|gasolina|etanol|posto|estaciona|ped[aá]gio|[oô]nibus|metr[oô]|ipva|oficina/i, 'transporte'],
  [/farm[aá]cia|drogaria|m[eé]dic|consulta|exame|dentista|plano de sa[uú]de|academia|hospital/i, 'saude'],
  [/escola|faculdade|curso|livro|mensalidade escolar|udemy|alura/i, 'educacao'],
  [/cinema|show|viagem|hotel|passeio|ingresso|jogo|steam/i, 'lazer'],
  [/netflix|spotify|amazon prime|disney|youtube|hbo|max\b|globoplay|icloud|google one|assinatura/i, 'assinaturas'],
  [/pet|ra[cç][aã]o|veterin/i, 'pets'],
  [/shopee|shein|mercado livre|magalu|amazon|roupa|loja|presente/i, 'compras'],
  [/empr[eé]stimo|fatura|juros|consignado|parcela do carro/i, 'dividas'],
  [/imposto|taxa|darf|multa|tarifa/i, 'impostos'],
  [/sal[aá]rio|contracheque|holerite|pagamento mensal/i, 'salario'],
  [/freela|freelance|bico|venda/i, 'extra'],
  [/rendimento|dividendo|cdb|tesouro|juros sobre/i, 'investimentos'],
  [/reembolso|estorno|devolu[cç][aã]o/i, 'reembolso'],
];

export function suggestCategory(description: string, type: import('./types').TxType): string | null {
  for (const [re, id] of KEYWORDS) {
    if (re.test(description)) {
      const cat = DEFAULT_CATEGORIES.find((c) => c.id === id);
      if (cat && cat.type === type) return id;
    }
  }
  return null;
}
