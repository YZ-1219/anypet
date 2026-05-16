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

    // 背景 prompt — 不提动物，纯背景场景
    const bgPrompts = {
      '3d_energy':     'dramatic dark background with electric lightning bolts, glowing neon energy particles, volumetric purple and blue light rays, electric sparks, dark void, cinematic 8k',
      'anime_ghibli':  'magical enchanted forest background, giant glowing mushrooms, fireflies, aurora sky, warm golden hour light, cherry blossom petals falling, Studio Ghibli style, no animals',
      'cyberpunk_neon':'cyberpunk neon city at night, holographic signs, neon reflections on wet street, electric blue magenta glow, rain, dark atmosphere, blade runner, no animals',
      'fantasy_magic': 'enchanted forest with floating magical orbs and light beams, glowing runes on ancient trees, mystical purple gold atmosphere, sparkles, no animals',
      'fire_ice':      'dramatic background split half volcanic lava fire with embers, half frozen ice crystal tundra, extreme contrast warm orange and icy blue, no animals',
      'golden_hour':   'breathtaking golden sunset sky, warm bokeh, rolling hills silhouette, dust particles in golden light rays, lens flare, professional photography background, no animals',
      'ink_splash':    'explosive Chinese ink splashes and rainbow watercolor bursts, bold abstract paint explosions in red blue gold purple, artistic background, no animals',
      'space_cosmic':  'deep space nebula background, swirling purple blue galactic clouds, stars, distant planets, aurora borealis, cosmic stardust, NASA art, no animals',
    };

    const bgPrompt = bgPrompts[style] || bgPrompts['3d_energy'];

    // 并行：抠图 + 生成背景
    const [cutoutResp, bgResp] = await Promise.all([
      fetch('https://fal.run/fal-ai/birefnet', {
        method: 'POST',
        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: image, model: 'General Use (Light)', output_format: 'png' })
      }),
      fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: bgPrompt,
          image_size: { width: 768, height: 1024 },
          num_inference_steps: 4,
          num_images: 1,
        })
      })
    ]);

    const [cutoutData, bgData] = await Promise.all([
      cutoutResp.json(),
      bgResp.json()
    ]);

    const petUrl = cutoutData?.image?.url || cutoutData?.images?.[0]?.url;
    const bgUrl = bgData?.images?.[0]?.url;

    if (!petUrl) throw new Error('抠图失败，请重试');
    if (!bgUrl) throw new Error('背景生成失败，请重试');

    // 下载两张图转 base64
    const [petResp, bgImgResp] = await Promise.all([fetch(petUrl), fetch(bgUrl)]);
    const [petBuf, bgBuf] = await Promise.all([petResp.arrayBuffer(), bgImgResp.arrayBuffer()]);

    return res.status(200).json({
      pet: 'data:image/png;base64,' + Buffer.from(petBuf).toString('base64'),
      background: 'data:image/jpeg;base64,' + Buffer.from(bgBuf).toString('base64'),
      style: style
    });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
