// api/check.js - 完整修复版
export default async function handler(req, res) {
  // CORS 设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { user_id } = req.query;
    
    console.log('🔍 检查许可证状态:', { 
      user_id, 
      timestamp: new Date().toISOString() 
    });
    
    if (!user_id) {
      return res.status(200).json({ 
        valid: false, 
        max_screens: 2 
      });
    }
    
    // 动态导入 Supabase
    const { createClient } = await import('@supabase/supabase-js');
    
    // 获取环境变量
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ 缺少 Supabase 环境变量');
      return res.status(200).json({ 
        valid: false, 
        max_screens: 2 
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 查询用户的所有许可证
    const { data: licenses, error } = await supabase
      .from('licenses')
      .select('type')
      .eq('user_id', user_id);
    
    if (error) {
      console.error('❌ 查询用户许可证错误:', error);
      return res.status(200).json({ 
        valid: false, 
        max_screens: 2 
      });
    }
    
    if (!licenses || licenses.length === 0) {
      console.log('ℹ️ 未找到用户的许可证');
      return res.status(200).json({ 
        valid: false, 
        max_screens: 2 
      });
    }
    
    // 找出最大的屏幕数
    let max_screens = 2;
    for (const license of licenses) {
      if (license.type === '6screen') {
        max_screens = 6;
        break;
      } else if (license.type === '4screen') {
        max_screens = Math.max(max_screens, 4);
      }
    }
    
    console.log('✅ 用户许可证状态:', { 
      user_id, 
      max_screens, 
      license_count: licenses.length 
    });
    
    return res.status(200).json({ 
      valid: true, 
      max_screens 
    });
    
  } catch (error) {
    console.error('💥 检查许可证错误:', error);
    return res.status(500).json({ 
      valid: false, 
      error: '服务器错误' 
    });
  }
}
