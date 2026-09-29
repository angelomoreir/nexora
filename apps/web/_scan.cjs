// Scan a file for string literals that look like hard-coded Portuguese UI text.
const fs = require('fs');
const file = process.argv[2];
const lines = fs.readFileSync(file, 'utf8').split('\n');
const ptWord = /(á|é|í|ó|ú|â|ê|ô|ã|õ|ç|\b(o|a|os|as|ao|aos|à|às|de|do|da|dos|das|em|no|na|nos|nas|para|por|com|sem|este|esta|estes|estas|seu|sua|seus|suas|todos|todas|novo|nova|eliminar|renomear|partilhar|criar|editar|mover|copiar|guardar|selecionar|enviar|submeter|iniciar|arquivar|restaurar|voltar|utilizador|registos?|campos|itens|pasta|documento|tarefa|equipa|workflow|lista|membro|passo|passos|estado|prioridade|limite|destino|propriedades|construtor|detalhe|pesquisa|resultados|permiss|metadados|favorito|comentário|reciclagem)\b)/i;
lines.forEach((l, i) => {
  if (/^\s*(import|\/\/|\/\*|\*)/.test(l)) return;
  const strs = l.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g) || [];
  const hits = strs.filter(s => {
    const inner = s.slice(1, -1);
    if (!/[a-záéíóúç]/i.test(inner)) return false;
    if (/^\s*$/.test(inner)) return false;
    if (/^[a-zA-Z_0-9.]+(\.[a-zA-Z_0-9]+)*$/.test(inner) && inner.includes('.')) return false; // t() keys / paths
    if (/^[A-Z0-9_]+$/.test(inner)) return false; // enums
    if (/^(GET|POST|PUT|PATCH|DELETE|data|builder|list|grid|move|copy|document|folder|text|longtext|number|currency|date|datetime|boolean|choice|email|url|user|file|relation|preview|details|versions|comments|view|edit|delete|share|read|mine|all|asc|desc|name|title|status|priority|dueAt|body|to|subject|field|value|operator|equals|not_equals|exists|not_exists|jumpToOrder|taskId|approverId|memberId|documentId|folderId|variable|assignedMembershipId|input|output|separator|heading|select|radio|checkbox|upload|phone|USER|TEAM|ORGANIZATION|READ|EDIT|ADMIN|TODO|IN_PROGRESS|IN_REVIEW|DONE|CANCELLED|DRAFT|PUBLISHED|ARCHIVED|PENDING|APPROVED|REJECTED|DELEGATED|START|END|RUNNING|COMPLETED|FAILED|SKIPPED|SUCCESS|FAILURE|Member|Editor|Manager|Admin|Viewer|pt-PT|en|fr|es|de|de-DE|en-US|fr-FR|es-ES|document\.|folder\.|list\.|list_item|task\.|workflow\.|user\.|#|rgb|px|rem|auto|none|block|flex|grid|inline|absolute|relative|fixed|sticky|solid|dashed|dotted|left|right|center|top|bottom|sm|md|lg|xl|primary|secondary|danger|warning|success|info|neutral|outline|ghost|destructive|default|icon|icon-sm|sm|lg|md|xs|multipart|form-data|application|text|image|audio|video|utf-8|Bearer|cookie|session|id|slug|order|asc|desc)/i.test(inner)) return false;
    return ptWord.test(inner);
  });
  if (hits.length) console.log(file + ':' + (i + 1) + ' :: ' + hits.map(h => h.length > 90 ? h.slice(0, 90) + '…' : h).join(' | '));
});
