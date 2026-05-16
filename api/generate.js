// api/generate.js — 抠图 + 动漫背景合成

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return res.status(500).json({ error: 'FAL API Key 未配置' });

  try {
    const { image, bgPrompt } = req.body;
    if (!image) return res.status(400).json({ error: '请上传图片' });

    // ── STEP 1: 去除背景，抠出宠物 ──
    console.log('Step 1: removing background...');
    const bgRemoveResp = await fetch('https://fal.run/fal-ai/birefnet', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: image, model: 'General Use (Light)', output_format: 'png' })
    });

    if (!bgRemoveResp.ok) {
      const err = await bgRemoveResp.json().catch(() => ({}));
      throw new Error('抠图失败: ' + (err.detail || err.message || bgRemoveResp.status));
    }

    const bgRemoveData = await bgRemoveResp.json();
    const petCutoutUrl = bgRemoveData?.image?.url || bgRemoveData?.images?.[0]?.url;
    if (!petCutoutUrl) throw new Error('抠图未返回结果');
    console.log('Step 1 done:', petCutoutUrl);

    // ── STEP 2: 生成动漫风格背景 ──
    console.log('Step 2: generating anime background...');
    const bgResp = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: bgPrompt + ', no animals, no pets, no people, empty scene, highly detailed, masterpiece',
        image_size: { width: 768, height: 1024 },
        num_inference_steps: 4,
        num_images: 1,
      })
    });

    if (!bgResp.ok) {
      const err = await bgResp.json().catch(() => ({}));
      throw new Error('背景生成失败: ' + (err.detail || err.message || bgResp.status));
    }

    const bgData = await bgResp.json();
    const bgUrl = bgData?.images?.[0]?.url;
    if (!bgUrl) throw new Error('背景未返回结果');
    console.log('Step 2 done:', bgUrl);

    // ── STEP 3: 下载两张图，返回给前端合成 ──
    const [petResp, bgImgResp] = await Promise.all([
      fetch(petCutoutUrl),
      fetch(bgUrl)
    ]);

    const [petBuf, bgBuf] = await Promise.all([
      petResp.arrayBuffer(),
      bgImgResp.arrayBuffer()
    ]);

    const petB64 = 'data:image/png;base64,' + Buffer.from(petBuf).toString('base64');
    const bgB64 = 'data:image/jpeg;base64,' + Buffer.from(bgBuf).toString('base64');

    return res.status(200).json({ pet: petB64, background: bgB64 });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
