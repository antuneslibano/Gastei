export type TxType = 'expense' | 'income';

export type PaymentMethod = 'pix' | 'debito' | 'credito' | 'dinheiro' | 'boleto' | 'transferencia' | 'outro';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TxType;
}

export interface Transaction {
  id: string;
  type: TxType;
  description: string;
  amount: number; // sempre positivo
  date: string; // YYYY-MM-DD
  categoryId: string;
  method: PaymentMethod;
  paid: boolean;
  notes?: string;
  /** Parcelamento: grupo + posição (ex.: 2 de 10) */
  installment?: { groupId: string; index: number; total: number };
  /** Gerado a partir de uma conta fixa */
  recurringId?: string;
  /** Gerado a partir de um contracheque */
  payslipId?: string;
  createdAt: string;
}

export interface Recurring {
  id: string;
  type: TxType;
  description: string;
  amount: number;
  day: number; // dia do mês (1-31)
  categoryId: string;
  method: PaymentMethod;
  active: boolean;
  startMonth: string; // YYYY-MM
}

export interface Budget {
  categoryId: string;
  limit: number; // limite mensal
}

export type PayslipItemKind = 'provento' | 'desconto' | 'informativo';

export interface PayslipItem {
  id: string;
  code?: string;
  description: string;
  reference?: string;
  amount: number;
  kind: PayslipItemKind;
}

export interface PayslipSummary {
  totalProventos?: number;
  totalDescontos?: number;
  liquido?: number;
  salarioBase?: number;
  baseInss?: number;
  baseFgts?: number;
  fgtsMes?: number;
  baseIrrf?: number;
}

export interface Payslip {
  id: string;
  month: string; // YYYY-MM (competência)
  kind: string; // Mensal, Férias, 13º, Adiantamento...
  employer?: string;
  cnpj?: string;
  employee?: string;
  role?: string;
  registration?: string;
  items: PayslipItem[];
  summary: PayslipSummary;
  fileName?: string;
  createdAt: string;
  transactionId?: string;
}

export interface Settings {
  userName: string;
  theme: 'system' | 'light' | 'dark';
  dependents: number;
  hideValues: boolean;
}

export interface AppData {
  version: 1;
  transactions: Transaction[];
  categories: Category[];
  recurring: Recurring[];
  budgets: Budget[];
  payslips: Payslip[];
  settings: Settings;
  /** marca quais contas fixas já foram geradas em cada mês: `${recurringId}:${YYYY-MM}` */
  generated: string[];
}
