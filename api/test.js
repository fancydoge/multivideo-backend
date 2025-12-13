// api/test.js - 测试端点
export default async function handler(req, res) {
  console.log('🔍 测试端点被调用:', {
    method: req.method,
    url: req.url,
    query: req.query,
    timestamp: new Date().toISOString()
  });
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  return res.status(200).json({
    status: 'OK',
    message: 'API 正常工作',
    timestamp: new Date().toISOString(),
    node_version: process.version,
    env: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NODE_ENV: process.env.NODE_ENV || 'production'
    },
    endpoints: {
      activate: 'POST /api/activate - 激活许可证',
      check: 'GET /api/check?user_id=... - 检查许可证状态',
      gumroad_ping: 'POST /api/gumroad-ping - Gumroad Webhook',
      test: 'GET /api/test - 测试端点'
    }
  });
}