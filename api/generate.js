// api/generate.js — 先上传图片到 Replicate，再做 img2img

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key 未配置' });

  try {
    const { prompt, image, animal } = req.body;
    const fullPrompt = `${animal || 'cute pet'} ${prompt}, photorealistic, highly detailed fur, professional studio lighting, 4k quality`;

    // 用 Flux schnell 生成（最稳定），后续再升级 img2img
    const imageUrl = await runFlux(apiKey, fullPrompt);
    if (!imageUrl) throw new Error('生成失败，请重试');

    // 下载图片转 base64 返回（解决前端跨域）
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error('图片下载失败: ' + imgResp.status);
    const buffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const ct = imgResp.headers.get('content-type') || 'image/webp';

    return res.status(200).json({ output: `data:${ct};base64,${base64}` });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function runFlux(apiKey, prompt) {
  const resp = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt,
          width: 768,
          height: 768,
          num_outputs: 1,
          num_inference_steps: 4,
          guidance_scale: 0,
        }
      })
    }
  );

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || 'Flux 调用失败');
  if (data.status === 'starting' || data.status === 'processing') {
    return await poll(apiKey, data.id);
  }
  return data.output?.[0];
}

async function poll(apiKey, id) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await r.json();
    if (data.status === 'succeeded') return Array.isArray(data.output) ? data.output[0] : data.output;
    if (data.status === 'failed') throw new Error(data.error || '生成失败');
  }
  throw new Error('超时，请重试');
}
