// /api/check.js - 检查许可证状态接口
const SUPABASE_URL = '你的Supabase项目URL';
const SUPABASE_SERVICE_KEY = '你的Supabase service_role密钥';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user_id = req.query.user_id;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

  try {
    // 查询该用户最近激活的有效许可证
    const queryUrl = `${SUPABASE_URL}/rest/v1/user_licenses?user_id=eq.${user_id}&is_active=eq.true&order=created_at.desc&limit=1`;
    const response = await fetch(queryUrl, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) throw new Error('Database query failed');

    const licenses = await response.json();

    if (licenses && licenses.length > 0) {
      const license = licenses[0];
      res.status(200).json({
        valid: true,
        max_screens: license.product_type === '6screen' ? 6 : 4
      });
    } else {
      res.status(200).json({ valid: false });
    }
  } catch (error) {
    console.error('验证过程出错:', error);
    res.status(500).json({ error: '服务器内部错误', valid: false });
  }
}