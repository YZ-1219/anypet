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

    // 策略：背景描述强，主角描述弱（只说保留）
    // strength 0.88 = AI 有大空间改背景，但轮廓/姿势保留
    const styles = {
      '3d_energy': {
        prompt: 'dramatic dark void background with electric lightning bolts exploding outward, glowing neon energy particles swirling, volumetric purple and blue light rays, electric sparks everywhere, cinematic 8k quality, the subject in the center glowing with inner energy light',
        neg: 'different animal, wrong species, deformed, ugly, low quality, blurry, extra limbs'
      },
      'anime_ghibli': {
        prompt: 'Studio Ghibli anime painting background, lush magical forest with giant glowing mushrooms, fireflies and aurora sky, warm golden hour light, cherry blossom petals drifting, hand-painted masterpiece quality, the subject bathed in warm magical glow',
        neg: 'realistic photo, 3d render, ugly, deformed, different animal'
      },
      'cyberpunk_neon': {
        prompt: 'cyberpunk neon city night background, holographic signs glowing in neon blue magenta, rain reflections on wet street below, electric atmosphere, blade runner aesthetic, the subject illuminated by neon light from behind',
        neg: 'daytime, bright sky, different animal, deformed, ugly'
      },
      'fantasy_magic': {
        prompt: 'enchanted magical forest background, swirling spell effects and glowing runes, floating magical orbs and light beams, mystical purple and gold atmosphere, sparkles and magic dust, the subject surrounded by swirling magic energy',
        neg: 'realistic photo, modern setting, different animal, deformed'
      },
      'fire_ice': {
        prompt: 'dramatic background split: one half volcanic lava and roaring fire with glowing embers, other half frozen ice crystal tundra with snowflakes, extreme contrast warm orange glow and icy blue cold light meeting in center, the subject at the boundary between fire and ice',
        neg: 'different animal, deformed, ugly, low quality'
      },
      'golden_hour': {
        prompt: 'breathtaking golden sunset background with warm orange and gold tones, soft bokeh light orbs, rolling hills silhouette, golden dust particles floating in warm light rays, cinematic lens flare, the subject bathed in beautiful golden warm light',
        neg: 'cold colors, nighttime, different animal, deformed'
      },
      'ink_splash': {
        prompt: 'explosive background of Chinese ink splashes and rainbow watercolor bursts, bold abstract paint explosions in deep red blue gold purple, dramatic ink strokes, colorful paint chaos, the subject emerging from beautiful ink and color explosion',
        neg: 'realistic background, plain background, different animal, deformed'
      },
      'space_cosmic': {
        prompt: 'deep space cosmic background with stunning colorful nebula, swirling purple and blue galactic clouds, stars and distant planets, aurora borealis effect, cosmic stardust and light, the subject floating in the cosmos surrounded by starlight',
        neg: 'earth background, indoor, different animal, deformed, ugly'
      },
    };

    const chosen = styles[style] || styles['3d_energy'];

    const resp = await fetch('https://fal.run/fal-ai/fast-sdxl/image-to-image', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: image,
        prompt: chosen.prompt,
        negative_prompt: chosen.neg,
        strength: 0.88,
        num_inference_steps: 40,
        guidance_scale: 7.5,
        image_size: { width: 768, height: 1024 },
        num_images: 1,
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || err.message || '生成失败');
    }

    const data = await resp.json();
    const imgUrl = data?.images?.[0]?.url;
    if (!imgUrl) throw new Error('未获得图片，请重试');

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
