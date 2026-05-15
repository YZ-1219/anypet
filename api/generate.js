// api/generate.js — fal.ai Flux Redux，保留宠物外形特征

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return res.status(500).json({ error: 'FAL API Key 未配置' });

  try {
    const { prompt, image, animal } = req.body;

    const fullPrompt = `${animal || 'cute pet'} ${prompt}, photorealistic, highly detailed fur and facial features, professional studio portrait, 4k quality`;

    let outputUrl;

    if (image) {
      // Flux Redux — 读取原图特征，保留外形，改变风格
      outputUrl = await runFluxRedux(falKey, image, fullPrompt);
    } else {
      outputUrl = await runFluxDev(falKey, fullPrompt);
    }

    if (!outputUrl) throw new Error('未获得图片');

    // 下载转 base64 返回，解决前端跨域
    const imgResp = await fetch(outputUrl);
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

// Flux Redux — 图片风格迁移，保留主体特征
async function runFluxRedux(falKey, imageData, prompt) {
  const resp = await fetch('https://fal.run/fal-ai/flux-pro/v1/redux', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageData,
      prompt: prompt,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      image_size: { width: 768, height: 768 },
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    console.log('Flux Redux error:', JSON.stringify(err));
    // fallback to Flux Dev text-to-image
    return await runFluxDev(falKey, prompt);
  }

  const data = await resp.json();
  return data?.images?.[0]?.url || data?.image?.url;
}

// Flux Dev — 文字生成（fallback）
async function runFluxDev(falKey, prompt) {
  const resp = await fetch('https://fal.run/fal-ai/flux/dev', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt,
      num_inference_steps: 28,
      guidance_scale: 3.5,
      image_size: { width: 768, height: 768 },
      num_images: 1,
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || err.message || 'fal.ai 调用失败');
  }

  const data = await resp.json();
  return data?.images?.[0]?.url;
}
