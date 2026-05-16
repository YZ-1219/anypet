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

    // 每种风格的 prompt 都是精心设计的
    // 核心：主体突出 + 创意光效 + 全图统一画风
    const styles = {
      '3d_energy': {
        prompt: '3D render style, cute pet as main subject, glowing energy particles surrounding the pet, electric lightning bolts in background, volumetric light rays, cinematic depth of field with bokeh background, hyper-detailed fur texture, dramatic studio lighting, sparkling magical aura, Pixar quality render, epic atmosphere',
        strength: 0.75,
      },
      'anime_ghibli': {
        prompt: 'Studio Ghibli anime art style, hand-painted illustration, warm golden hour lighting, soft ethereal glow around pet, detailed anime background with bokeh, sakura petals floating, gentle magical sparkles, painterly brushwork, masterpiece quality, harmonious color palette, the pet is the clear hero of the scene',
        strength: 0.72,
      },
      'cyberpunk_neon': {
        prompt: 'cyberpunk aesthetic, neon-lit portrait, electric blue and magenta neon glow emanating from around the pet, rain-slicked reflective ground, holographic particles, dark atmospheric background with city lights bokeh, chromatic aberration, cinematic moody lighting, highly detailed, the pet glows with inner neon energy',
        strength: 0.75,
      },
      'fantasy_magic': {
        prompt: 'epic fantasy digital art, the pet surrounded by swirling magical energy and glowing runes, mystical forest or cosmic background, dramatic god rays of light, iridescent magical particles, spell effects, deep rich colors, painterly style, cinematic composition, magical creature portrait, awe-inspiring atmosphere',
        strength: 0.73,
      },
      'fire_ice': {
        prompt: 'dramatic elemental art, pet surrounded by swirling fire and ice energy, half fire half ice aesthetic, glowing embers and ice crystals floating, dramatic contrast of warm orange and cool blue, volumetric smoke and mist, epic cinematic composition, hyper-detailed, dynamic energy effects, the pet radiates elemental power',
        strength: 0.76,
      },
      'golden_hour': {
        prompt: 'cinematic golden hour photography style, warm orange and golden bokeh background, lens flare and light leaks, soft dreamy atmosphere, the pet bathed in warm sunlight, dust particles floating in light beams, professional portrait photography, shallow depth of field, film grain, award-winning pet photography',
        strength: 0.65,
      },
      'ink_splash': {
        prompt: 'dynamic ink splash art style, Chinese ink painting meets modern digital art, bold ink splashes and watercolor washes surrounding the pet, dramatic black ink strokes, colorful paint splashes, minimalist yet powerful composition, the pet emerges from abstract ink and color explosions, artistic masterpiece',
        strength: 0.74,
      },
      'space_cosmic': {
        prompt: 'cosmic space art, the pet floating in a stunning nebula, galaxy and stars background, colorful cosmic clouds in purple and blue, the pet surrounded by stardust and cosmic energy, planets in background, aurora borealis effect, dreamlike surreal atmosphere, NASA space art aesthetic, magnificent scale',
        strength: 0.76,
      },
    };

    const chosen = styles[style] || styles['3d_energy'];

    const resp = await fetch('https://fal.run/fal-ai/flux-pro/v1/redux', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: image,
        prompt: chosen.prompt,
        num_inference_steps: 28,
        guidance_scale: chosen.strength * 5, // 3~4 范围让主体保留同时背景创意
        image_size: { width: 768, height: 1024 },
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || err.message || 'fal.ai 调用失败');
    }

    const data = await resp.json();
    const imgUrl = data?.images?.[0]?.url || data?.image?.url;
    if (!imgUrl) throw new Error('未获得图片');

    // 下载转 base64
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
