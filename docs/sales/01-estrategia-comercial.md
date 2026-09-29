# Nexora — Estratégia Comercial (v1, setembro 2026)

> Documento interno. Dono: Direção de Vendas. Revisão mensal.

## 1. Situação de partida (números reais da plataforma)

| Indicador | Hoje |
|---|---|
| Clientes pagantes | **0** |
| MRR | **0 €** |
| Produto | Completo para PME: documentos, listas, formulários, tarefas, workflows/aprovações, Docs & Sheets, intranet/sites, IA, SSO, auditoria, 5 idiomas |
| Faturação | Stripe integrado — **falta configurar chaves** (bloqueador) |
| Canal de entrada | Formulário `/contact` → pipeline em *Administração → Pedidos de contacto* |
| Métricas | *Administração → Métricas da plataforma* (MRR, conversão, ativação) |

**Conclusão:** o produto não é o gargalo. O gargalo é distribuição. Os próximos 90 dias são 80 % venda, 20 % produto (só o que os clientes em processo de compra pedirem).

## 2. Posicionamento

**Frase-âncora (usar em tudo):**
> *Nexora é o espaço de trabalho da empresa — documentos, processos e equipas num só sítio, com um preço por organização e não por utilizador.*

**Três provas:**
1. **Preço por organização.** Uma empresa de 40 pessoas paga 69 €/mês no Professional. Suites cobradas por utilizador custam tipicamente 10–15 €/utilizador/mês → 400–600 €/mês só em licenças (estimativa ilustrativa; confirmar com o cliente).
2. **Tudo ligado.** Um formulário gera uma tarefa, que dispara uma aprovação, que arquiva o documento na pasta certa — sem integrar 4 ferramentas.
3. **Europeu e RGPD.** Página pública de segurança, DPA disponível, isolamento entre organizações testado automaticamente.

**O que NÃO dizemos:** "substituímos o Microsoft 365" (perdemos a discussão). Dizemos: "organizamos o trabalho da equipa ao lado do email que já usam".

## 3. Cliente ideal (ICP)

| Critério | Valor |
|---|---|
| Dimensão | **15–200 pessoas** (abaixo disto usam Free; acima exige ciclo enterprise) |
| Geografia | Portugal primeiro (idioma, rede, velocidade); Espanha em seguida |
| Dor | Documentos espalhados (email, pastas partilhadas, pens), aprovações por email, auditorias/certificações (ISO 9001, HACCP), sem histórico de versões |
| Sinal de compra | Certificação ISO a decorrer, crescimento de equipa, nova sede, auditoria recente, saída de pessoa-chave com "o conhecimento na cabeça" |
| Decisor | Diretor-geral / sócio-gerente (≤50 pessoas); Diretor de Operações ou Qualidade (50–200) |
| Utilizador campeão | Responsável de Qualidade, Office Manager, Diretor de Projeto |

### Vertical prioritária (primeiros 90 dias): **Engenharia, Arquitetura e Construção**

Porquê: gerem muitos documentos por projeto (desenhos, pareceres, autos), têm aprovações com várias pessoas, costumam ter ISO 9001, trabalham com subempreiteiros (partilhas externas com password/expiração) e costumam ser 15–150 pessoas. Já existe demo pronta (*Atlântico Engenharia*, 5 idiomas).

**Vertical 2 (a partir do mês 3):** Indústria alimentar e distribuição (HACCP, checklists por formulário, registos de temperatura, rastreabilidade) — demo *FrigoNorte*.

**Vertical 3 (oportunista):** software houses e consultoras — demo *SoftForge*.

## 4. Preços e regras de desconto

| Plano | Mensal | Anual | Público-alvo |
|---|---:|---:|---|
| Free | 0 € | 0 € | Até 5 pessoas — porta de entrada |
| Basic | 29 € | 290 € | Até 15 pessoas |
| Professional | 69 € | 690 € | Até 50 pessoas — **plano a empurrar** |
| Business | 149 € | 1.490 € | Até 200 pessoas |
| Enterprise | desde 399 € | à medida | 200+, SSO, requisitos próprios |

**Regras (não negociáveis sem aprovação do fundador):**
1. Anual = 2 meses grátis (já incluído). Empurrar sempre anual — melhora caixa e retenção.
2. **Design partners** (máx. 10): 50 % no primeiro ano, só em pagamento anual, em troca de testemunho, logótipo e 1 reunião de feedback/mês. Ver `04-programas-design-partners-e-parceiros.md`.
3. Fora disso: desconto máximo 15 %, só com contrato anual e só no fecho — nunca na primeira conversa.
4. Nunca baixar o preço de lista. Dar tempo (trial alargado, onboarding) antes de dar desconto.
5. Enterprise: nunca abaixo de 399 €/mês. Setup/migração faturado à parte (sugestão: 750–2.500 €).

## 5. Processo de venda (fases do pipeline na app)

| Fase na app | Critério de entrada | Ação seguinte | Prazo |
|---|---|---|---|
| **Novo** | Pedido chega pelo site ou é adicionado | Responder e marcar chamada | < 4 h úteis |
| **Contactado** | Houve resposta ou chamada de descoberta | Qualificar (ver §6) e marcar demo | < 5 dias |
| **Demo** | Demo marcada/feita | Enviar resumo + proposta; abrir trial com dados do cliente | < 24 h após demo |
| **Proposta** | Proposta enviada com plano e preço | Follow-up D+2, D+5, D+10 | < 21 dias |
| **Ganho** | Pagamento/contrato | Onboarding em 48 h; pedir testemunho aos 30 dias | — |
| **Perdido** | Recusa ou 30 dias sem resposta | Registar motivo nas notas; recontactar em 90 dias | — |

**Regra de ouro:** cada lead tem **sempre** um próximo passo com data escrito nas notas.

## 6. Qualificação (BANT simplificado — 5 perguntas)

1. Quantas pessoas vão usar? *(define o plano)*
2. Onde vivem hoje os documentos e as aprovações? *(dor)*
3. O que acontece se não resolverem isto nos próximos 3 meses? *(urgência)*
4. Quem mais decide e quem paga? *(decisor)*
5. Têm alguma auditoria, certificação ou projeto com data? *(evento de compra)*

Lead qualificado = responde a 1, 2 e 4, e tem urgência ou evento.

## 7. Canais (por ordem de prioridade)

1. **Prospeção direta** (LinkedIn + email) na vertical prioritária — sequências em `02-sequencias-prospecao.md`.
2. **Rede pessoal do fundador** — 30 mensagens pessoais na semana 1 a pedir apresentações.
3. **Parceiros**: gabinetes de contabilidade, consultoras ISO/qualidade e integradores — comissão recorrente 20 %.
4. **Conteúdo e SEO em PT**: "controlo de documentos ISO 9001", "alternativa ao SharePoint para PME", "gestão documental RGPD".
5. **Eventos**: associações setoriais (engenharia, construção, qualidade), feiras regionais. Levar demo no portátil e one-pager.
6. Diretórios (Capterra, G2) — quando houver 3+ clientes para deixar avaliações.

## 8. Metas a 90 dias

| Métrica | Mês 1 | Mês 2 | Mês 3 | Total |
|---|---:|---:|---:|---:|
| Empresas contactadas (1.º toque) | 100 | 100 | 100 | 300 |
| Conversas / chamadas de descoberta | 10 | 15 | 20 | 45 |
| Demos | 6 | 10 | 14 | 30 |
| Design partners assinados | 3 | 4 | 3 | 10 |
| Clientes pagantes (total acumulado) | 2 | 6 | 12 | 12 |
| MRR no fim do mês | 100 € | 350 € | **800 €** | — |

Conversões assumidas: 15 % resposta → 60 % demo → 40 % fecho. Rever no fim de cada mês com os números reais da página de Métricas e do pipeline.

## 9. Ritmo semanal (fundador + vendas)

| Dia | Bloco |
|---|---|
| Segunda | 25 novos contactos na vertical + revisão do pipeline (todos os leads têm próximo passo?) |
| Terça–Quinta | Demos (manhã), follow-ups (tarde), 10 novos contactos/dia |
| Sexta | Relatório semanal (ver abaixo) + 1 conteúdo (post LinkedIn ou artigo) |

**Relatório semanal (5 linhas):** contactos feitos · respostas · demos · propostas abertas (valor) · ganhos/perdidos e motivo.

## 10. Bloqueadores que só o fundador resolve (antes de vender)

- [ ] Empresa constituída + conta Stripe + `STRIPE_SECRET_KEY` e `STRIPE_PRICE_MAP` configurados
- [ ] Domínio e email profissional (substituir o Gmail nos Termos, Privacidade e página de contacto)
- [ ] Produção alojada na UE com backups (necessário para o DPA)
- [ ] Revisão jurídica do DPA (`docs/legal/DPA-modelo-pt.md`)
- [ ] Rodar a chave de IA exposta no `.env`
- [ ] Calendário de marcação de demos (Calendly/Cal.com) para colocar nas assinaturas e emails
