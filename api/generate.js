// api/generate.js
// Vercel Serverless Function — 转发 Replicate 请求，解决 CORS 问题

export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key 未配置，请在 Vercel 环境变量中设置 REPLICATE_API_KEY' });

  try {
    const { prompt, image } = req.body;

    // 调用 Flux Schnell（最快，免费额度内）
    const response = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait', // 等待结果直接返回
        },
        body: JSON.stringify({
          input: {
            prompt: prompt,
            width: 768,
            height: 768,
            num_outputs: 1,
            num_inference_steps: 4,
            guidance_scale: 0,
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.detail || '生成失败' });
    }

    // 如果还在处理中，轮询
    if (data.status === 'starting' || data.status === 'processing') {
      const result = await pollUntilDone(apiKey, data.id);
      return res.status(200).json({ output: result });
    }

    if (data.output && data.output[0]) {
      return res.status(200).json({ output: data.output[0] });
    }

    return res.status(500).json({ error: '未返回图像' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function pollUntilDone(apiKey, id) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await r.json();
    if (data.status === 'succeeded') return data.output[0];
    if (data.status === 'failed') throw new Error(data.error || '生成失败');
  }
  throw new Error('超时，请重试');
}
