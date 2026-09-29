# Guia de prospeção — como usar o template e construir a lista

> A lista de prospeção vive em `prospeccao-template.csv` (abre no Excel ou Google Sheets; na dúvida, importar no Sheets da Nexora). Uma linha = uma empresa. Atualização diária de 10 min — a lista desatualizada é o fim do pipeline.

---

## 1. Campos do template

| Campo | O que escrever | Onde obter |
|---|---|---|
| `empresa` | Nome oficial | Site, LinkedIn, ePortugal |
| `website` | Domínio | Google |
| `setor` | Uma das verticais: Engenharia e construção / Indústria alimentar / Serviços | LinkedIn da empresa |
| `n_pessoas` | Intervalo real (ex.: 45, não "PME") | LinkedIn ("X colaboradores"), site |
| `decisor` | Nome da pessoa | LinkedIn: DG, Diretor de Operações, Qualidade |
| `cargo` | Cargo do decisor | LinkedIn |
| `email` | Email profissional | Padrão da empresa (nome@dominio), Hunter.io, site |
| `linkedin` | URL do perfil | LinkedIn |
| `ferramentas_atuais` | O que usam hoje (email+pastas, SharePoint, Drive, papel, Primavera…) | Site, vagas de emprego (pedem "experiência em X"), pergunta na 1.ª conversa |
| `dor_provavel` | Hipótese concreta antes de falar ("ISO 9001 a decorrer", "obras novas = mais documentos") | Notícias, anúncios de obra, blog da empresa |
| `intencao` | demo / preços / parceiro / outro | — |
| `fase` | Mesma do pipeline na app: Novo, Contactado, Demo, Proposta, Ganho, Perdido | — |
| `proxima_acao` | Uma ação concreta ("enviar email 2", "ligar") | **Obrigatório — nunca vazio** |
| `data_proxima_acao` | Data da ação | **Obrigatório — nunca vazio** |
| `plano_estimado` | Basic/Professional/Business conforme `n_pessoas` | Tabela de preços |
| `fonte` | De onde veio (LinkedIn, indicação, evento, inbound) | — |
| `notas` | Ganchos, respostas, contexto | Cada interação |

## 2. Como construir 100 empresas/semana na vertical de engenharia

1. **Fontes de nomes:** LinkedIn (filtro: Portugal, setor Construção/Engenharia civil, 11–200 colaboradores), diretórios setoriais (Ordem dos Engenheiros, associações de construção), listas de adjudicatários de concursos públicos (portal BASE — obra adjudicada = documentos novos a gerir), anúncios de emprego (empresas a contratar PMs/qualidade estão a crescer).
2. **Critério para entrar na lista:** 15–200 pessoas, Portugal, setor alvo. Sem os 3 = não entra.
3. **Por empresa (≤ 5 min):** nome + website + n.º pessoas + 1 decisor do LinkedIn + email inferido (padrao@dominio) + 1 gancho concreto.
4. **O gancho é o que vale ouro:** obra nova adjudicada, certificação ISO anunciada, vaga de "responsável documental", notícia de expansão. Sem gancho, o email 1 não sai.

## 3. Cadência por empresa

| Dia | Ação |
|---|---|
| 0 | Email 1 (personalizado com o gancho) |
| +1 | Pedido de ligação LinkedIn |
| 3 | Email 2 |
| 5 | Mensagem LinkedIn (se aceitou) |
| 8 | Email 3 |
| 15 | Email 4 (fecho) → fase Perdido, motivo "sem resposta" |
| +90 | Reativação se houver novidade |

Resposta negativa clara → Perdido ("não interessa") e respeitar de imediato (RGPD).

## 4. KPIs semanais (registar no relatório de sexta)

- Contactos feitos · respostas · demos marcadas · propostas abertas (valor) · ganhos/perdidos + motivo
- Metas: 100 primeiros contactos/mês → 15 % resposta → 60 % demo → 40 % fecho

## 5. Leads que chegam pelo site

Entram diretamente em **Administração → Pedidos de contacto** com intenção e tamanho da equipa já preenchidos pelo formulário `/contact`. A lista CSV é só para prospeção outbound — não misturar.
