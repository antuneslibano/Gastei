# Gastei 💸

Controle de gastos completo e o mais automático possível, com leitura de **contracheque em PDF**.

> **Versão de testes (0.x)**: os dados ficam salvos apenas no aparelho. Login, nuvem (Supabase) e assinatura vêm nas próximas etapas. Veja o [roteiro](#roteiro).

## O que já funciona

### 📄 Leitura automática de contracheque (PDF)
- Identifica **competência**, tipo (mensal, férias, 13º, adiantamento, PLR, rescisão), **empresa/CNPJ**, **funcionário**, **cargo** e **matrícula**.
- Lê todas as **rubricas** (código, descrição, referência e valor) e classifica em **proventos** e **descontos**:
  - pelas colunas da tabela (Vencimentos/Proventos/Vantagens × Descontos), inclusive em layouts com as duas colunas lado a lado (comum em contracheques de servidor público);
  - sem cabeçalho, pela posição dos valores e por palavras-chave (INSS, IRRF, vale-transporte, consignado, horas extras…).
- Lê o rodapé: total de proventos, total de descontos, líquido, salário base, base INSS, base FGTS, FGTS do mês e base IRRF.
- Abre PDFs **protegidos por senha**.
- Tudo é processado **localmente** (pdf.js); o arquivo não sai do aparelho.

### 🔍 Cálculos e conferência
- Confere se as somas das rubricas batem com os totais e o líquido do documento.
- Recalcula **INSS** (tabela progressiva 2025/2026), **IRRF** (deduções legais × desconto simplificado, dependentes, pensão e o **redutor da isenção até R$ 5 mil** de 2026) e **FGTS** (8%), e aponta divergências.
- Mostra % de descontos, valor da hora, para onde vai o salário bruto, o que mudou em relação ao mês anterior e a evolução salarial do ano.
- Ao salvar, lança o **líquido como receita** automaticamente.

### 🧾 Controle de gastos
- Gastos e receitas com categoria (sugerida automaticamente pela descrição), forma de pagamento, status pago/pendente e observações.
- **Compras parceladas** (gera as parcelas nos meses seguintes).
- **Contas fixas** (aluguel, internet, assinaturas, salário) lançadas automaticamente todo mês.
- **Orçamentos** por categoria com alertas de estouro.
- Painel com saldo, a pagar/a receber, gráfico por categoria, últimos 6 meses, projeção de gastos do mês e resumo inteligente.
- Busca e filtros, modo escuro, ocultar valores.
- Backup/restauração (JSON) e exportação para planilha (CSV).

## Tecnologia

| Camada | Escolha | Por quê |
| --- | --- | --- |
| App | React + TypeScript + Vite | Uma base de código para Android, web e (se quiser) iOS |
| Android | Capacitor | Gera APK/AAB para a Play Store a partir do mesmo código |
| PDF | pdf.js | Leitura local, sem servidor |
| Dados (agora) | `localStorage` (`src/lib/storage.ts`) | Isolado para ser trocado pelo Supabase |
| Dados (depois) | Supabase (Auth + Postgres + RLS) | Multiusuário, 2FA, sincronização |

```
src/
  lib/
    payslip/      leitura do PDF (pdfLines), interpretação (parse) e cálculos (analyze)
    taxes.ts      tabelas de INSS/IRRF — atualizar a cada ano
    store.tsx     estado do app (lançamentos, contas fixas, parcelas…)
    storage.ts    persistência local (ponto de troca para o Supabase)
  screens/        Início, Lançamentos, Contracheque, Planejar, Ajustes
  components/
tests/            testes do leitor de contracheque e dos impostos (gera PDFs de teste)
android/          projeto Android (Capacitor)
```

## Desenvolvimento

```bash
npm install
npm run dev        # abre no navegador
npm test           # testes
WRITE_SAMPLES=1 npm test   # gera samples/contracheque-exemplo.pdf para testar no app
```

Android (precisa do Android Studio):

```bash
npm run android:sync
npm run android:open
```

## Releases e atualização automática

O app, ao abrir (e ao voltar para a tela), consulta o último Release do GitHub. Se houver versão mais nova, mostra o aviso **"Nova versão disponível"** com o botão para baixar o APK, que instala por cima mantendo os dados. Também dá para verificar manualmente em **Ajustes → Verificar atualizações**.

Para lançar uma versão: **Actions → Release Android → Run workflow**, informando a versão (ex.: `0.2.0`). O workflow testa, compila, assina o APK e publica o Release `v0.2.0`.

Secrets necessários (Settings → Secrets and variables → Actions):

| Secret | Conteúdo |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore em base64 |
| `ANDROID_KEYSTORE_PASSWORD` | senha do keystore e da chave |
| `ANDROID_KEY_ALIAS` | opcional; se omitido, usa a primeira chave do keystore |

> Todas as versões precisam ser assinadas com a **mesma chave**, senão o Android não instala a atualização. Guarde o keystore em local seguro: ele também será a chave de upload da Play Store.

## Roteiro

- [x] **0.1** — versão de testes local: contracheque em PDF, lançamentos, parcelas, contas fixas, orçamentos, backup
- [ ] **0.2** — OCR para contracheques escaneados (imagem); importação de extrato bancário (OFX/CSV) e fatura de cartão em PDF
- [ ] **0.3** — contas de usuário no Supabase: cadastro, login com senha, verificação em duas etapas (e-mail/SMS), sincronização entre aparelhos
- [ ] **0.4** — cartões de crédito (fechamento/vencimento da fatura), metas de economia, lembretes de contas por notificação
- [ ] **1.0** — assinatura mensal/anual (Google Play Billing), publicação na Play Store
