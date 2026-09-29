# Acordo de Tratamento de Dados (DPA) — NEXORA

> **MODELO — requer revisão por advogado antes de assinar.** Campos entre `[ ]` a preencher.
> Base legal: artigo 28.º do Regulamento (UE) 2016/679 (RGPD).

**Entre:**

- **Cliente (Responsável pelo tratamento):** [Denominação], NIPC [ ], com sede em [ ], ("Cliente");
- **Fornecedor (Subcontratante):** [Entidade que explora a NEXORA], NIPC [ ], com sede em [ ], ("NEXORA").

O presente Acordo integra os Termos de Serviço da NEXORA e aplica-se ao tratamento de dados pessoais realizado pela NEXORA por conta do Cliente.

---

## 1. Objeto, natureza e finalidade

1.1. A NEXORA trata dados pessoais exclusivamente para prestar ao Cliente o serviço SaaS NEXORA (gestão documental, listas, formulários, tarefas, workflows, editores Docs/Sheets, colaboração, pesquisa e, se ativadas, funcionalidades de IA).

1.2. Operações de tratamento: alojamento, armazenamento, organização, indexação para pesquisa, consulta, transmissão aos utilizadores autorizados do Cliente, cópia de segurança e eliminação.

## 2. Duração

Vigora enquanto durar a subscrição do Cliente e, após o seu termo, pelo período de exportação e eliminação previsto na cláusula 10.

## 3. Categorias de dados e de titulares

| Categoria de titulares | Categorias de dados |
|---|---|
| Utilizadores do Cliente (colaboradores, prestadores) | Nome, email profissional, cargo, fotografia (opcional), registos de atividade/auditoria, endereço IP |
| Terceiros cujos dados o Cliente carregue (clientes, fornecedores, candidatos…) | Os dados que o Cliente decida incluir em documentos, listas e formulários |

O Cliente não deve carregar categorias especiais de dados (art. 9.º RGPD) sem avaliar a adequação das medidas previstas no Anexo I e, se necessário, acordar medidas adicionais.

## 4. Instruções do Cliente

4.1. A NEXORA trata os dados apenas mediante instruções documentadas do Cliente, que correspondem a este Acordo, aos Termos de Serviço e às configurações feitas pelo Cliente na plataforma.

4.2. A NEXORA informa imediatamente o Cliente se considerar que uma instrução viola o RGPD ou outra lei de proteção de dados.

## 5. Confidencialidade

As pessoas autorizadas pela NEXORA a tratar os dados estão sujeitas a dever de confidencialidade contratual ou legal.

## 6. Segurança (art. 32.º)

A NEXORA aplica as medidas técnicas e organizativas descritas no **Anexo I**, que pode atualizar desde que o nível de proteção não diminua.

## 7. Subcontratantes ulteriores

7.1. O Cliente concede autorização geral para a utilização dos subcontratantes ulteriores listados no **Anexo II**.

7.2. A NEXORA informa o Cliente, com pelo menos **30 dias** de antecedência, de qualquer adição ou substituição; o Cliente pode opor-se por motivos razoáveis de proteção de dados e, não havendo solução, resolver o contrato sem penalização.

7.3. A NEXORA impõe a cada subcontratante ulterior obrigações de proteção de dados equivalentes às deste Acordo e permanece responsável perante o Cliente pelo seu cumprimento.

## 8. Transferências internacionais

Os dados são alojados no Espaço Económico Europeu [confirmar região do alojamento]. Qualquer transferência para fora do EEE (por exemplo, fornecedores de IA ou de email) só ocorre com base numa decisão de adequação (incl. EU-US Data Privacy Framework) ou com Cláusulas Contratuais-Tipo da Comissão Europeia e medidas complementares adequadas.

## 9. Assistência ao Cliente

9.1. **Direitos dos titulares:** a plataforma permite ao Cliente consultar, retificar, exportar e eliminar dados; a NEXORA presta assistência adicional razoável e reencaminha ao Cliente os pedidos que receba diretamente.

9.2. **Violações de dados:** a NEXORA notifica o Cliente **sem demora injustificada e, em qualquer caso, no prazo de 48 horas** após ter conhecimento de uma violação de dados pessoais, com a informação disponível exigida pelo art. 33.º, n.º 3.

9.3. A NEXORA presta assistência razoável em avaliações de impacto (art. 35.º) e consultas prévias (art. 36.º).

## 10. Fim do tratamento

Após o termo da subscrição, os dados ficam disponíveis para exportação durante **30 dias**; depois são eliminados dos sistemas ativos, e das cópias de segurança no ciclo normal de rotação ([ ] dias), salvo obrigação legal de conservação.

## 11. Auditorias

A NEXORA disponibiliza ao Cliente a informação necessária para demonstrar o cumprimento deste Acordo (incluindo relatórios de testes de segurança quando existam) e permite auditorias do Cliente ou de auditor por si mandatado, com aviso prévio de 30 dias, no máximo uma vez por ano, salvo após violação de dados ou exigência de autoridade de controlo.

## 12. Responsabilidade e disposições finais

A responsabilidade das partes rege-se pelos Termos de Serviço, sem prejuízo do art. 82.º RGPD. Em caso de conflito, prevalece este Acordo em matéria de proteção de dados. Lei aplicável: portuguesa.

---

## Anexo I — Medidas técnicas e organizativas

| Área | Medida |
|---|---|
| Isolamento multi-tenant | Todos os registos associados a uma organização; filtragem obrigatória no servidor; testes automáticos de isolamento entre organizações |
| Autenticação | Passwords com Argon2id; token de acesso de curta duração em cookie httpOnly/SameSite; rotação de refresh token com deteção de reutilização; revogação de sessões; SSO OpenID Connect |
| Controlo de acessos | RBAC com 6 perfis e permissões granulares; permissões por pasta/documento; verificação no servidor |
| Registo de auditoria | Ações relevantes registadas e consultáveis pelos administradores do Cliente |
| Ficheiros | Lista de extensões permitidas, validação MIME e assinatura binária, limite de tamanho, armazenamento com chaves separadas por organização |
| Partilhas externas | Links com password e expiração opcionais; revogáveis |
| Aplicação | Rate limiting, cabeçalhos de segurança HTTP, validação de entradas, erros sem detalhes internos, auditoria de dependências |
| Transmissão | Cifragem TLS em trânsito [confirmar configuração do alojamento] |
| Armazenamento | Cifragem em repouso [confirmar com o fornecedor de alojamento/BD] |
| Cópias de segurança | [frequência, retenção, testes de reposição] |
| Organização | Acesso de produção restrito a pessoal autorizado; dever de confidencialidade; procedimento de resposta a incidentes |

## Anexo II — Subcontratantes ulteriores

| Subcontratante | Finalidade | Localização | Garantia de transferência |
|---|---|---|---|
| [Fornecedor de alojamento] | Infraestrutura, base de dados, armazenamento | [EEE — região] | n/a |
| Stripe Payments Europe, Ltd. | Pagamentos (dados de faturação; não dados de conteúdo) | Irlanda / EUA | DPF / CCT |
| [Fornecedor de email] | Envio de emails transacionais | [ ] | [ ] |
| [Fornecedor de IA] — só se o Cliente ativar IA | Processamento de pedidos de IA | [ ] | [ ] |
