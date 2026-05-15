// api/generate.js — 返回 base64 图片，解决跨域问题

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

    const fullPrompt = image
      ? `${animal || 'cute pet'} ${prompt}, photorealistic, highly detailed fur, professional studio lighting, 4k`
      : `cute ${animal || 'pet'} ${prompt}, photorealistic, professional photo, 4k`;

    let imageUrl;

    if (image) {
      // img2img — 保留宠物外形
      imageUrl = await runImg2Img(apiKey, image, fullPrompt);
    } else {
      // 纯文字生成
      imageUrl = await runFlux(apiKey, fullPrompt);
    }

    if (!imageUrl) throw new Error('未获得图片 URL');

    // 把图片下载下来转成 base64，解决前端跨域问题
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error('图片下载失败');
    const buffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = imgResp.headers.get('content-type') || 'image/jpeg';

    return res.status(200).json({
      output: `data:${contentType};base64,${base64}`
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function runImg2Img(apiKey, imageData, prompt) {
  const resp = await fetch(
    'https://api.replicate.com/v1/models/stability-ai/stable-diffusion-img2img/predictions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          image: imageData,
          prompt,
          negative_prompt: 'blurry, low quality, deformed, human face, text, watermark',
          prompt_strength: 0.60,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          width: 768,
          height: 768,
        }
      })
    }
  );

  const data = await resp.json();
  if (!resp.ok) {
    console.log('img2img error:', data);
    return await runFlux(apiKey, prompt);
  }

  let result = data;
  if (data.status === 'starting' || data.status === 'processing') {
    result = await poll(apiKey, data.id);
    return result;
  }

  const out = data.output;
  if (out) return Array.isArray(out) ? out[0] : out;
  return await runFlux(apiKey, prompt);
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
        input: { prompt, width: 768, height: 768, num_outputs: 1, num_inference_steps: 4, guidance_scale: 0 }
      })
    }
  );
  const data = await resp.json();
  if (data.status === 'starting' || data.status === 'processing') return await poll(apiKey, data.id);
  return data.output?.[0];
}

async function poll(apiKey, id) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await r.json();
    if (data.status === 'succeeded') return Array.isArray(data.output) ? data.output[0] : data.output;
    if (data.status === 'failed') throw new Error(data.error || '生成失败');
  }
  throw new Error('超时');
}
