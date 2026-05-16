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

    // 背景 prompts — 纯场景，无动物
    const bgPrompts = {
      '3d_energy':     'dark void background with dramatic electric lightning bolts, glowing neon energy particles, volumetric purple and blue light rays, electric sparks, cinematic 8k, no animals no people',
      'anime_ghibli':  'Studio Ghibli magical forest background, giant glowing mushrooms, fireflies, aurora sky, warm golden light, cherry blossoms falling, no animals no people',
      'cyberpunk_neon':'cyberpunk neon city night background, holographic signs, neon reflections on wet street, electric blue magenta glow, rain, no animals no people',
      'fantasy_magic': 'enchanted magical forest with floating glowing orbs, mystical light beams, glowing runes, purple gold sparkles, no animals no people',
      'fire_ice':      'dramatic background half volcanic lava fire with embers, half frozen ice crystals tundra, extreme contrast warm orange and icy blue, no animals no people',
      'golden_hour':   'breathtaking golden sunset sky, warm bokeh balls, rolling hills, dust particles in golden rays, cinematic lens flare, no animals no people',
      'ink_splash':    'explosive Chinese ink splashes and rainbow watercolor bursts, red blue gold purple paint explosions, abstract art background, no animals no people',
      'space_cosmic':  'deep space nebula background, purple blue galactic clouds, stars and planets, aurora borealis, cosmic stardust, no animals no people',
    };

    // 背景的主色调用于融合
    const glowColors = {
      '3d_energy':'120,58,237', 'anime_ghibli':'251,191,36', 'cyberpunk_neon':'0,255,255',
      'fantasy_magic':'167,139,250', 'fire_ice':'249,115,22', 'golden_hour':'251,191,36',
      'ink_splash':'220,38,38', 'space_cosmic':'99,102,241',
    };

    const bgPrompt = bgPrompts[style] || bgPrompts['3d_energy'];
    const glowRGB = glowColors[style] || '120,58,237';

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

    const [cutoutData, bgData] = await Promise.all([cutoutResp.json(), bgResp.json()]);

    const petUrl = cutoutData?.image?.url || cutoutData?.images?.[0]?.url;
    const bgUrl = bgData?.images?.[0]?.url;

    if (!petUrl) throw new Error('抠图失败，请重试');
    if (!bgUrl) throw new Error('背景生成失败，请重试');

    const [petR, bgR] = await Promise.all([fetch(petUrl), fetch(bgUrl)]);
    const [petBuf, bgBuf] = await Promise.all([petR.arrayBuffer(), bgR.arrayBuffer()]);

    return res.status(200).json({
      pet: 'data:image/png;base64,' + Buffer.from(petBuf).toString('base64'),
      background: 'data:image/jpeg;base64,' + Buffer.from(bgBuf).toString('base64'),
      glowRGB,
      style,
    });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
