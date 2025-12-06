// /api/activate.js - 激活许可证接口
const SUPABASE_URL = '你的Supabase项目URL';
const SUPABASE_SERVICE_KEY = '你的Supabase service_role密钥'; // 注意：需要service_role权限

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, license_key } = req.body;
  if (!user_id || !license_key) {
    return res.status(400).json({ error: 'Missing user_id or license_key' });
  }

  // 这里暂时先直接信任并存储密钥，假设其有效
  // 未来可在此处集成Gumroad API进行二次验证
  try {
    // 1. 将激活记录存入Supabase
    const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_licenses`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        user_id,
        gumroad_license_key: license_key,
        product_type: license_key.startsWith('6F0E') ? '4screen' : '6screen' // 示例逻辑：根据密钥前缀判断产品
      })
    });

    if (!dbResponse.ok) {
      const error = await dbResponse.json();
      return res.status(400).json({ error: '激活失败，密钥可能已被使用' });
    }

    // 2. 返回成功信息
    const savedRecord = await dbResponse.json();
    res.status(200).json({
      success: true,
      max_screens: savedRecord[0].product_type === '6screen' ? 6 : 4
    });

  } catch (error) {
    console.error('激活过程出错:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}