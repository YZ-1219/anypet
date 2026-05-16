export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return res.status(500).json({ error: 'FAL API Key 未配置' });

  try {
    const { image, style, animal } = req.body;
    if (!image) return res.status(400).json({ error: '请上传图片' });

    // 动物映射
    // animalNames no longer needed
    const animalNames = {
      cat:'cat', dog:'dog', rabbit:'rabbit', hamster:'hamster',
      parrot:'parrot', lizard:'lizard', turtle:'turtle', fish:'fish', pet:'cute pet'
    };
    const animalName = animalNames[animal] || 'cute pet';

    // 8种风格 — 每种都有明显不同的背景描述 + 服装元素
    // 主体由原图决定，不写死动物名称

    const styles = {
      '3d_energy': `hyperrealistic 3D render of a the animal in the photo wearing a glowing energy armor suit, surrounded by electric lightning bolts and plasma energy, dramatic dark background filled with electric sparks and neon particle effects, volumetric purple and blue light rays, Pixar quality, cinematic, 8k`,
      'anime_ghibli': `Studio Ghibli anime painting of a the animal in the photo wearing a small cute kimono outfit, standing in a magical enchanted forest with giant glowing mushrooms, fireflies, aurora sky, hand-painted style, warm golden light, cherry blossom petals falling, masterpiece`,
      'cyberpunk_neon': `cyberpunk portrait of a the animal in the photo wearing a tiny cyberpunk jacket with neon trim, neon-lit rainy city background, holographic advertisements, neon reflections on wet street, electric blue and magenta glow, blade runner atmosphere, cinematic`,
      'fantasy_magic': `epic fantasy portrait of a the animal in the photo wearing a small wizard robe and hat, surrounded by swirling magical spell effects and glowing runes, enchanted forest background with floating magical orbs and light beams, mystical purple and gold atmosphere, digital art`,
      'fire_ice': `dramatic portrait of a the animal in the photo with fire and ice elements, half background is volcanic lava and fire with embers, half is frozen tundra with ice crystals and snowflakes, the pet wears elemental cape, extreme contrast warm orange and icy blue, epic cinematic`,
      'golden_hour': `cinematic portrait of a the animal in the photo wearing a small bow tie and flower crown, breathtaking golden sunset background, sun rays and warm bokeh, rolling hills silhouette, dust particles floating in golden light, professional photography, award-winning`,
      'ink_splash': `artistic portrait of a the animal in the photo wearing a colorful traditional outfit, dynamic background of explosive Chinese ink splashes and rainbow watercolor bursts, bold abstract paint explosions in red blue gold purple, the pet emerges from beautiful chaos`,
      'space_cosmic': `cosmic portrait of a the animal in the photo wearing a tiny astronaut suit, floating in deep space with a stunning colorful nebula background, swirling purple and blue galactic clouds, stars and distant planets, aurora borealis, cosmic stardust, NASA art style`,
    };

    const prefix = 'Preserve the exact appearance, fur/skin color, markings and body shape of the animal in the photo. Only transform the background, lighting and add costume elements. ';
    const prompt = prefix + (styles[style] || styles['3d_energy']);

    console.log('Using style:', style);
    console.log('Prompt:', prompt.substring(0, 100));

    // 用 fast-sdxl img2img — 速度快，风格变化大
    const resp = await fetch('https://fal.run/fal-ai/fast-sdxl/image-to-image', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: image,
        prompt: prompt,
        negative_prompt: 'blurry, low quality, deformed, ugly, extra limbs, text, watermark',
        strength: 0.88,
        num_inference_steps: 35,
        guidance_scale: 8.0,
        image_size: { width: 768, height: 1024 },
        num_images: 1,
      })
    });

    let imgUrl = null;

    if (resp.ok) {
      const data = await resp.json();
      imgUrl = data?.images?.[0]?.url;
      console.log('fast-sdxl success:', imgUrl);
    }

    // Fallback: flux-dev img2img
    if (!imgUrl) {
      console.log('Trying flux-dev img2img fallback...');
      const r2 = await fetch('https://fal.run/fal-ai/flux/dev/image-to-image', {
        method: 'POST',
        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: image,
          prompt: prompt,
          strength: 0.88,
          num_inference_steps: 28,
          guidance_scale: 4.0,
          image_size: { width: 768, height: 1024 },
        })
      });
      if (r2.ok) {
        const d2 = await r2.json();
        imgUrl = d2?.images?.[0]?.url;
        console.log('flux-dev success:', imgUrl);
      }
    }

    // Final fallback: flux-redux
    if (!imgUrl) {
      console.log('Trying flux-redux final fallback...');
      const r3 = await fetch('https://fal.run/fal-ai/flux-pro/v1/redux', {
        method: 'POST',
        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: image,
          prompt: prompt,
          num_inference_steps: 28,
          guidance_scale: 5.0,
          image_size: { width: 768, height: 1024 },
        })
      });
      const d3 = await r3.json();
      imgUrl = d3?.images?.[0]?.url || d3?.image?.url;
    }

    if (!imgUrl) throw new Error('所有模型均失败，请重试');

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
