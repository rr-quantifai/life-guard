exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return {
    statusCode: 500, headers: cors,
    body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify environment variables.' })
  };

  try {
    const { messages, systemStatic, systemDynamic, imageData } = JSON.parse(event.body);
    if (!Array.isArray(messages) || messages.length > 80) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid payload' }) };

    let apiMessages = messages.map(m => ({ ...m }));
    if (imageData && apiMessages.length > 0) {
      const last = apiMessages[apiMessages.length - 1];
      if (last.role === 'user') {
        const isPDF = imageData.mediaType === 'application/pdf';
        apiMessages[apiMessages.length - 1] = {
          role: 'user',
          content: [
            { type: 'text', text: typeof last.content === 'string' ? last.content : JSON.stringify(last.content) },
            isPDF
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageData.base64 } }
              : { type: 'image',    source: { type: 'base64', media_type: imageData.mediaType,  data: imageData.base64 } }
          ]
        };
      }
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        system: [
          { type: 'text', text: systemStatic, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: systemDynamic }
        ],
        messages: apiMessages
      })
    });

    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: cors, body: JSON.stringify({ error: data.error?.message || 'Anthropic API error' }) };

    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };

  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
