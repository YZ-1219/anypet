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

    const styles = {
      '3d_energy':     'glowing electric energy and lightning bolts surrounding the subject, dramatic dark background with electric sparks and neon particle effects, volumetric purple and blue light rays, 3D Pixar quality render, cinematic, 8k',
      'anime_ghibli':  'Studio Ghibli anime illustration style, magical enchanted forest background with glowing fireflies, aurora sky, warm golden light, cherry blossom petals, hand-painted masterpiece',
      'cyberpunk_neon':'cyberpunk neon city background, holographic advertisements, neon reflections on wet street, electric blue and magenta glow, blade runner atmosphere, cinematic',
      'fantasy_magic': 'surrounded by swirling magical spell effects and glowing runes, enchanted forest background with floating magical orbs and light beams, mystical purple and gold atmosphere, epic fantasy digital art',
      'fire_ice':      'dramatic half fire half ice elemental background, volcanic lava and fire with embers on one side, frozen tundra with ice crystals on other side, extreme contrast warm orange and icy blue',
      'golden_hour':   'breathtaking golden sunset background, sun rays and warm bokeh, rolling hills silhouette, dust particles floating in golden light, professional photography, cinematic',
      'ink_splash':    'dynamic background of explosive Chinese ink splashes and rainbow watercolor bursts, bold abstract paint explosions in red blue gold purple, artistic masterpiece',
      'space_cosmic':  'floating in deep space with stunning colorful nebula background, swirling purple and blue galactic clouds, stars and distant planets, aurora borealis, cosmic stardust',
    };

    const bgPrompt = styles[style] || styles['3d_energy'];

    // Strategy: LOW strength (0.55) to preserve the subject
    // ControlNet approach with subject preservation
    const resp = await fetch('https://fal.run/fal-ai/fast-sdxl/image-to-image', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: image,
        prompt: `the exact same animal from the reference photo, same species breed color and markings, ${bgPrompt}`,
        negative_prompt: 'different animal, wrong species, human, person, deformed, ugly, low quality, blurry',
        strength: 0.60,          // LOW = subject preserved
        num_inference_steps: 40,
        guidance_scale: 9.0,    // HIGH guidance = stick to prompt description
        image_size: { width: 768, height: 1024 },
      })
    });

    let imgUrl = null;

    if (resp.ok) {
      const data = await resp.json();
      imgUrl = data?.images?.[0]?.url;
    }

    // Fallback: flux redux with low guidance
    if (!imgUrl) {
      console.log('Fallback to flux redux...');
      const r2 = await fetch('https://fal.run/fal-ai/flux-pro/v1/redux', {
        method: 'POST',
        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: image,
          prompt: `same animal as in photo, ${bgPrompt}`,
          num_inference_steps: 28,
          guidance_scale: 3.5,
          image_size: { width: 768, height: 1024 },
        })
      });
      if (r2.ok) {
        const d2 = await r2.json();
        imgUrl = d2?.images?.[0]?.url || d2?.image?.url;
      }
    }

    if (!imgUrl) throw new Error('生成失败，请重试');

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
