// api/generate.js
// Step 1: 抠出宠物（透明PNG）
// Step 2: 原图背景转动漫风格
// Step 3: 返回两张图给前端合成

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

    const stylePrompts = {
      anime: 'anime art style, Studio Ghibli aesthetic, hand drawn, soft warm colors, detailed background, cinematic lighting, masterpiece illustration',
      manga: 'black and white manga style, detailed ink linework, Japanese comic art, dramatic contrast, screen tones',
      cyberpunk: 'cyberpunk anime style, neon lights, rain reflections, electric blue and purple, dark atmospheric, blade runner aesthetic',
      watercolor: 'soft watercolor illustration style, delicate pastel washes, dreamy bokeh, artistic painting, gentle colors',
      fantasy: 'epic fantasy anime style, magical glowing atmosphere, ethereal light beams, mystical colorful environment',
    };

    const stylePrompt = stylePrompts[style] || stylePrompts.anime;

    // ── 并行执行：Step 1 抠图 + Step 2 背景风格转换 ──
    console.log('Running bg removal and style transfer in parallel...');

    const [cutoutResult, styledBgResult] = await Promise.all([
      // Step 1: 抠出宠物主体
      fetch('https://fal.run/fal-ai/birefnet', {
        method: 'POST',
        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: image,
          model: 'General Use (Light)',
          output_format: 'png'
        })
      }).then(r => r.json()),

      // Step 2: 整张原图转动漫风格（背景内容保留，只改画风）
      fetch('https://fal.run/fal-ai/flux-pro/v1/redux', {
        method: 'POST',
        headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: image,
          prompt: stylePrompt + ', same composition and layout as original photo, same background content, same perspective and framing',
          num_inference_steps: 28,
          guidance_scale: 2.5, // 低 guidance = 更忠实原图构图
          image_size: { width: 768, height: 1024 },
        })
      }).then(r => r.json())
    ]);

    // 获取 URL
    const petUrl = cutoutResult?.image?.url || cutoutResult?.images?.[0]?.url;
    const styledUrl = styledBgResult?.images?.[0]?.url || styledBgResult?.image?.url;

    if (!petUrl) throw new Error('抠图失败，请重试');
    if (!styledUrl) throw new Error('风格转换失败：' + JSON.stringify(styledBgResult).slice(0,200));

    console.log('Pet URL:', petUrl);
    console.log('Styled URL:', styledUrl);

    // 下载两张图转 base64
    const [petResp, styledResp] = await Promise.all([
      fetch(petUrl),
      fetch(styledUrl)
    ]);

    const [petBuf, styledBuf] = await Promise.all([
      petResp.arrayBuffer(),
      styledResp.arrayBuffer()
    ]);

    return res.status(200).json({
      pet: 'data:image/png;base64,' + Buffer.from(petBuf).toString('base64'),
      background: 'data:image/jpeg;base64,' + Buffer.from(styledBuf).toString('base64')
    });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
