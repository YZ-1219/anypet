export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return res.status(500).json({ error: 'FAL API Key 未配置' });

  try {
    const { image, style } = req.body;
    if (!image) return res.status(400).json({ error: '请上传图片' });

    // 策略：用 fal-ai/flux-lora (img2img) 做风格迁移
    // prompt_strength 0.75 = 75% 创意，25% 保留原图主体
    const styles = {
      '3d_energy': 'adorable pet portrait, 3D Pixar render style, glowing electric energy and lightning bolts surrounding the pet, dramatic dark background with electric sparks, volumetric purple and blue light, particle effects, photorealistic fur, cinematic depth of field, epic atmosphere, masterpiece quality render',
      'anime_ghibli': 'cute pet portrait, Studio Ghibli anime illustration style, lush magical meadow background with floating glowing fireflies and cherry blossoms, warm golden sunset sky, hand-painted watercolor style, soft magical bokeh, painterly brushstrokes, masterpiece anime art',
      'cyberpunk_neon': 'pet portrait in cyberpunk city, neon-drenched rainy night background, holographic signs and neon reflections on wet pavement, electric blue magenta neon glow, dark atmospheric background, cinematic moody lighting, blade runner aesthetic',
      'fantasy_magic': 'pet portrait surrounded by swirling magical energy, enchanted forest background with glowing runes and mystical orbs, ethereal purple and gold light beams, sparkles and spell effects, epic fantasy digital art, magical creature, dark mystical atmosphere',
      'fire_ice': 'pet portrait with dramatic elemental background, half the background swirling fire with embers, half glacial ice crystals and snowflakes, extreme contrast of warm orange and cool blue, dynamic energy effects, dramatic cinematic composition',
      'golden_hour': 'professional pet portrait, breathtaking golden hour sunset background, warm orange and golden bokeh balls, sun rays and lens flare, dust particles in light, cinematic photography, shallow depth of field, award-winning pet photography, film grain',
      'ink_splash': 'pet portrait, dynamic Chinese ink splash art background, bold colorful paint explosions in red blue green and purple, ink splatter and watercolor washes, abstract artistic background, the pet emerges from beautiful chaos of color and ink',
      'space_cosmic': 'pet portrait floating in outer space, stunning colorful nebula background, swirling purple and blue cosmic clouds, stars and galaxies, aurora borealis effect, planet in distance, cosmic stardust surrounding the pet, NASA space art style, magnificent scale',
    };

    const prompt = styles[style] || styles['3d_energy'];

    // 使用 flux-dev with image-to-image 获得更强风格控制
    const resp = await fetch('https://fal.run/fal-ai/flux/dev/image-to-image', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: image,
        prompt: prompt,
        strength: 0.80,        // 80% 创意变化，20% 保留原图主体
        num_inference_steps: 28,
        guidance_scale: 3.5,
        image_size: { width: 768, height: 1024 },
        num_images: 1,
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      // fallback to flux redux
      console.log('img2img failed, trying redux:', err.detail || err.message);
      return await tryRedux(falKey, image, prompt, res);
    }

    const data = await resp.json();
    const imgUrl = data?.images?.[0]?.url;

    if (!imgUrl) {
      return await tryRedux(falKey, image, prompt, res);
    }

    const imgResp = await fetch(imgUrl);
    const buffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const ct = imgResp.headers.get('content-type') || 'image/jpeg';

    return res.status(200).json({ output: `data:${ct};base64,${base64}` });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function tryRedux(falKey, image, prompt, res) {
  const resp = await fetch('https://fal.run/fal-ai/flux-pro/v1/redux', {
    method: 'POST',
    headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: image,
      prompt: prompt,
      num_inference_steps: 28,
      guidance_scale: 4.5,
      image_size: { width: 768, height: 1024 },
    })
  });

  const data = await resp.json();
  const imgUrl = data?.images?.[0]?.url || data?.image?.url;
  if (!imgUrl) throw new Error('生成失败，请重试');

  const imgResp = await fetch(imgUrl);
  const buffer = await imgResp.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const ct = imgResp.headers.get('content-type') || 'image/jpeg';

  return res.status(200).json({ output: `data:${ct};base64,${base64}` });
}
