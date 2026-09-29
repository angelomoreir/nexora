# Guião de descoberta, demo de 15 minutos, objeções e fecho

> Documento interno. Regra n.º 1 da demo: **nunca mostrar a app de cima a baixo.** Mostrar o processo do cliente, do problema ao resultado. A app é o suporte, não a estrela.

---

## 1. Descoberta (antes da demo — 10–15 min por chamada ou email)

### Perguntas obrigatórias
1. "Como chega hoje um documento a quem tem de o aprovar? E como sabem que foi aprovado?"
2. "Onde ficam os documentos da empresa — email, pastas partilhadas, computador de alguém?"
3. "Contem-me a última vez que procuraram um documento e não o encontraram / encontraram a versão errada."
4. "Têm alguma certificação ou auditoria (ISO, HACCP, cliente exigente)? Quando é a próxima?"
5. "Se resolvem isto, quem mais precisa de concordar? Quem aprova o orçamento?"

### O que anotar nas notas do lead (na app)
- Ferramentas atuais (email + pastas / SharePoint / Drive / papel / outro SaaS)
- O processo concreto que dói (nomear: "aprovação de desenhos", "registos HACCP", "onboarding de clientes")
- O evento de compra e a data (auditoria em novembro, obra nova em janeiro)
- Decisor + campeão + quem paga
- O que NÃO querem (ex.: "não queremos trocar o email")

### Sinais de lead quente
- Já procuraram ferramentas ou tentaram resolver (SharePoint mal implementado, pastas no Drive a rebentar)
- Auditoria/certificação com data marcada
- Perderam documentos ou versões com custo real
- Decisor presente na primeira conversa

### Sinais de perda de tempo (marcar como *Perdido* cedo)
- "Só quero ver o que existe" sem dor concreta
- Menos de 8 pessoas e sem processos (vão para Free — ok, mas sem demo: enviar vídeo)
- Querem um clone do ERP ou do Teams

---

## 2. Guião da demo — 15 minutos (cronómetro à frente)

Preparação (10 min antes): criar no tenant de demo uma pasta, um documento e um formulário **com o nome e vocabulário do cliente** ("Obra Norte — Memória descritiva", "Registo de temperatura — Câmara 2").

| Min | O que fazes | O que dizes |
|---:|---|---|
| 0–1 | Sem apresentação de slides. Pergunta de enquadramento | "Antes de mostrar: contem-me em 30 segundos como aprova um documento hoje." *(Anota — vais usar as palavras deles.)* |
| 1–4 | **O problema deles, resolvido.** Abrir a pasta do "projeto deles", mostrar um documento, criar versão nova, mostrar histórico | "Isto é a obra Norte. Aqui vive tudo — e cada versão fica registada. Já ninguém pergunta 'qual é o ficheiro final'." |
| 4–7 | **Workflow + aprovação.** Submeter o documento para aprovação, aprovar **no telemóvel em direto** | "O projetista submeteu, vocês aprovam aqui — incluindo do telemóvel, sem instalar nada. Fica registado quem aprovou, quando." |
| 7–10 | **Formulário → tarefa.** Submeter o formulário deles com um valor fora do limite → tarefa criada automaticamente | "Alguém no terreno preenche isto no telemóvel. Se o valor sair do intervalo, nasce uma tarefa para o responsável — ninguém tem de ler relatórios para apanhar o problema." |
| 10–12 | **Partilha externa.** Gerar link de partilha com password e prazo para "o subempreiteiro" | "O subempreiteiro recebe este link — sem conta, sem ver o resto. Expira em 7 dias." |
| 12–13 | **Preço.** Mostrar `/pricing` | "E não pagam por utilizador — pagam por empresa. Para vocês seria o plano {plano}: {preço}/mês, ou {preço anual} no anual." |
| 13–15 | **Fechar o próximo passo.** Nunca acabar sem data | "Faço-vos uma proposta hoje com este cenário. Quinta-feira às 10h falamos 15 minutos para decidir?" |

### Regras da demo
- Um cenário, do princípio ao fim. Se pedirem outro módulo, mostra 30 segundos e volta ao fio.
- Se perguntarem "faz X?" e não fizer: "Não faz — é a coisa certa para vos mostrar a seguir se for importante para vocês? *(anota)* A maioria dos clientes resolve isso assim: {workaround/próximo módulo}."
- Erro ao vivo = não entrar em pânico: "veem? é por isto que testamos 130 cenários automaticamente — este vou registar já." *(Depois regista mesmo.)*
- Nunca usar a palavra "barato". Usar "preço por empresa".

---

## 3. Objeções — resposta padrão (sentir → enquadrar → provar → avançar)

| Objeção | Resposta |
|---|---|
| "É mais uma ferramenta para aprender" | "É exatamente por isso que juntamos 4 numa. A vossa equipa já vive em email e pastas — isto não é 'mais uma', é a que organiza as outras. Em 2 horas a equipa está dentro; a curva é parecida com o Drive." |
| "Já temos SharePoint/Drive" | "Perfeito — então os ficheiros já estão organizados, o que falta são os **processos**: aprovações, formulários que geram tarefas, registo de quem aprovou. É aí que o SharePoint deixa de ajudar. Posso mostrar a diferença em 10 minutos?" |
| "É caro" | "Comparado a quê? Ao SharePoint por utilizador, uma equipa de 40 paga várias centenas por mês. Ao custo de uma auditoria falhada ou de uma versão errada em obra, paga-se sozinho. De qualquer forma, temos o Free para testar com a equipa toda antes de decidirem." |
| "E a segurança dos nossos dados?" | "Temos uma página pública de segurança e RGPD (nexora/security). Dados isolados por organização — testado automaticamente a cada release — passwords com Argon2, e DPA disponível para assinar." |
| "E se vocês fecharem?" | "Pergunta justa. Os vossos dados exportam-se sempre (CSV, XLSX, ficheiros originais) — nunca ficam reféns. E cada licença é mensal ou anual, sem fidelização escondida." |
| "Preciso de falar com o sócio / o IT" | "Claro — quando podem estar os dois numa chamada de 15 minutos? Eu preparo uma versão curta da proposta para levarem." *(Nunca enviar a proposta sem marcar a chamada seguinte.)* |
| "Agora não é altura" | "O que muda daqui a 3 meses?" *(Se houver evento — auditoria, obra — regista a data e agenda follow-up. Se não houver, marca como perdido com motivo e segue em frente.)* |
| "O Teams já faz tarefas" | "As tarefas, sim. O que o Teams não faz: versões de documentos com aprovação registada, formulários que geram trabalho, partilhas externas com prazo. O Nexora vive ao lado do email que já usam." |

---

## 4. Proposta (enviar < 24 h depois da demo — email, não PDF pesado)

**Assunto:** proposta Nexora — {empresa} ({processo deles})

> Olá {nome},
>
> Como combinado, aqui fica a proposta para resolver **{processo na linguagem deles}** na {empresa}.
>
> **O que propomos**
> - Plano **{plano}** — {preço}/mês ({preço anual}/ano, 2 meses incluídos)
> - Configuração inicial: pastas por {projeto/departamento}, workflow de aprovação "{nome}", formulário "{nome}" — feito connosco na 1.ª semana, sem custo
> - {Se design partner: condições em `04` — 50 % no 1.º ano, pagamento anual}
>
> **O que acontece depois de dizerem sim**
> Dia 1: conta e importação dos documentos atuais. Semana 1: formação de 1 h para a equipa. Dia 30: revisão — se não estiver a ser usado, cancelam sem conversa difícil.
>
> A proposta é válida até {data + 10 dias}. Ficou combinada uma chamada de 15 min {dia} às {hora}.
>
> {assinatura}

Regras: proposta **sempre** com data de validade e chamada já marcada. Nunca mais de 2 opções de plano.

---

## 5. Follow-ups depois da proposta

**D+2 — Assunto:** alguma dúvida da proposta?
> {nome}, ficou alguma pergunta depois de falarem internamente? Se ajudar, posso fazer um vídeo curto de 2 minutos a mostrar exatamente o cenário da {empresa}.

**D+5 — Assunto:** {processo deles} sem resolver
> {nome}, não quero ser chato — só registar que o ponto que me disseram ("{frase da dor}") continua a custar {tempo/risco}. A proposta fica até {data}. Se a altura não for esta, digam-me e fecho por aqui, sem problema.

**D+10 — Assunto:** fecho
> {nome}, assumo que não é prioridade agora e fecho a proposta. Se o tema voltar — auditoria, projeto novo, equipa a crescer — respondam a este email. *(Marcar Perdido com motivo: "timing". Recontacto em 90 dias.)*

---

## 6. Depois do "sim" — renovação e expansão

- **Onboarding em 48 h:** criar conta, importar, 1 h de formação. Um cliente não ativado em 7 dias é um churn futuro — a página de Métricas mostra a taxa de ativação.
- **Dia 30:** check-in de uso (nº de documentos/tarefas criados). Pedir testemunho e logótipo.
- **Dia 90:** proposta de expansão — segundo departamento, mais workflows, plano superior se a equipa cresceu. A venda mais barata é a expansão.
- **Antes da renovação anual (D-45):** email com resumo de uso do ano ("foram criados X documentos, Y aprovações") — a renovação defende-se com números, não com boa vontade.
