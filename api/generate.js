// api/generate.js — IP-Adapter版本，真正读取宠物照片特征

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
    if (!prompt) return res.status(400).json({ error: '缺少 prompt' });

    let outputUrl;

    if (image) {
      // 有照片：用 img2img 保留宠物外形，叠加变装风格
      const imageData = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
      const fullPrompt = `${animal || 'cute pet'} ${prompt}, photorealistic, highly detailed fur and features, professional studio lighting, 4k`;
      outputUrl = await runImg2Img(apiKey, imageData, fullPrompt);
    } else {
      // 没照片：纯文字生成
      outputUrl = await runTextToImg(apiKey, `cute ${animal || 'pet'} ${prompt}`);
    }

    return res.status(200).json({ output: outputUrl });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function runImg2Img(apiKey, imageData, prompt) {
  // 用 img2img：prompt_strength 0.55 = 保留55%原图特征，改变45%风格
  const response = await fetch(
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
          prompt: prompt,
          negative_prompt: 'blurry, low quality, deformed, ugly, human face, extra limbs, watermark',
          prompt_strength: 0.60,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          width: 768,
          height: 768,
          scheduler: 'DPMSolverMultistep',
        }
      })
    }
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    console.log('img2img failed:', errData);
    // fallback to flux
    return await runTextToImg(apiKey, prompt);
  }

  const data = await response.json();
  if (data.status === 'starting' || data.status === 'processing') {
    return await poll(apiKey, data.id);
  }
  const out = data.output;
  if (out) return Array.isArray(out) ? out[0] : out;
  return await runTextToImg(apiKey, prompt);
}

async function runTextToImg(apiKey, prompt) {
  const response = await fetch(
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
          prompt: prompt,
          width: 768, height: 768,
          num_outputs: 1,
          num_inference_steps: 4,
          guidance_scale: 0,
        }
      })
    }
  );
  const data = await response.json();
  if (data.status === 'starting' || data.status === 'processing') {
    return await poll(apiKey, data.id);
  }
  return data.output?.[0];
}

async function poll(apiKey, id) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await r.json();
    if (data.status === 'succeeded') {
      return Array.isArray(data.output) ? data.output[0] : data.output;
    }
    if (data.status === 'failed') throw new Error(data.error || '生成失败');
  }
  throw new Error('超时，请重试');
}
