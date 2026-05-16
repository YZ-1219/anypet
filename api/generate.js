// api/generate.js — 风格转换版本，用 fal.ai Flux Redux

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return res.status(500).json({ error: 'FAL API Key 未配置' });

  try {
    const { prompt, image } = req.body;
    if (!image) return res.status(400).json({ error: '请上传图片' });

    // Flux Redux — 风格迁移，保留宠物主体
    const resp = await fetch('https://fal.run/fal-ai/flux-pro/v1/redux', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: image,
        prompt: prompt,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        image_size: { width: 768, height: 1024 },
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'fal.ai 调用失败');
    }

    const data = await resp.json();
    const imageUrl = data?.images?.[0]?.url || data?.image?.url;
    if (!imageUrl) throw new Error('未获得图片 URL');

    // 下载转 base64
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error('图片下载失败');
    const buffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const ct = imgResp.headers.get('content-type') || 'image/jpeg';

    return res.status(200).json({ output: `data:${ct};base64,${base64}` });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
