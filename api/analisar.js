module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { id } = req.body;

    if (!id) {
      res.status(400).json({ error: 'ID da conversa é obrigatório' });
      return;
    }

    const octaRes = await fetch(
      `https://app.octadesk.com/chat/${id}/messages?limit=100`,
      { headers: { 'X-API-KEY': process.env.OCTADESK_API_KEY } }
    );

    const octaText = await octaRes.text();

    if (!octaRes.ok) {
      res.status(502).json({ error: `Octadesk ${octaRes.status}: ${octaText.substring(0, 300)}` });
      return;
    }

    let msgs;
    try {
      msgs = JSON.parse(octaText);
    } catch (e) {
      res.status(502).json({ error: `JSON inválido do Octadesk: ${octaText.substring(0, 1000)}` });
      return;
    }

    const mensagens = Array.isArray(msgs) ? msgs : (msgs.data || msgs.messages || msgs.items || []);

    if (!mensagens.length) {
      res.status(404).json({ error: `Sem mensagens. Resposta: ${JSON.stringify(msgs).substring(0, 300)}` });
      return;
    }

    const texto = mensagens.map(m => {
      const quem = m.author?.type === 'contact' ? (m.author?.name || 'Cliente') : 'Atendente';
      if (m.attachments && m.attachments.length > 0) return `[${quem}]: [Áudio/Arquivo]`;
      return `[${quem}]: ${m.body || m.text || ''}`;
    }).filter(l => l.length > 5).join('\n');

    const prompt = `Você é um advogado trabalhista sênior especializado na defesa de trabalhadores no Brasil. Analise o histórico de conversa abaixo e produza um relatório jurídico completo em JSON.

HISTÓRICO DA CONVERSA:
${texto}

INSTRUÇÕES:
- Identifique todos os direitos trabalhistas violados com base na CLT, Súmulas do TST e jurisprudência
- Aponte pontos que precisam ser aprofundados na entrevista com o cliente
- Liste dados faltantes essenciais para a petição inicial
- Elabore uma minuta da reclamatória trabalhista (qualificação, fatos, fundamentos jurídicos, pedidos)
- Se houver menção a áudios ou anexos, sinalize que precisam ser transcritos

Responda SOMENTE com JSON válido, sem markdown, sem texto antes ou depois:
{
  "cliente": { "nome": "string ou Não informado", "funcao": "string ou Não informada", "tempo_trabalho": "string", "situacao": "resumo em 1-2 frases" },
  "direitos": [{ "titulo": "string", "descricao": "base legal e fundamentação" }],
  "alertas": [{ "titulo": "string", "descricao": "o que precisa ser aprofundado e por quê" }],
  "dados_faltantes": [{ "titulo": "string", "descricao": "por que esse dado é necessário" }],
  "minuta": "texto da minuta com quebras de linha"
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const claudeText = await claudeRes.text();

    if (!claudeRes.ok) {
      res.status(502).json({ error: `Anthropic ${claudeRes.status}: ${claudeText.substring(0, 300)}` });
      return;
    }

    const claudeData = JSON.parse(claudeText);
    const raw = claudeData.content?.find(b => b.type === 'text')?.text || '';
    const resultado = JSON.parse(raw.replace(/```json|```/g, '').trim());

    res.status(200).json(resultado);

  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro interno' });
  }
};
