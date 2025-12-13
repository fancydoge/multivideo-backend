// api/activate.js - 完整修复版
export default async function handler(req, res) {
  // 允许所有来源访问（CORS设置）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理 OPTIONS 请求（预检请求）
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: '请使用 POST 方法' 
    });
  }
  
  try {
    // 1. 获取请求数据
    const { user_id, license_key } = req.body;
    console.log('🔑 收到激活请求:', { 
      user_id, 
      license_key: license_key ? `${license_key.substring(0, 8)}...` : '空',
      timestamp: new Date().toISOString()
    });
    
    // 2. 检查必要参数
    if (!user_id || !license_key) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少用户ID或许可证密钥' 
      });
    }
    
    // 3. 动态导入 Supabase 客户端
    const { createClient } = await import('@supabase/supabase-js');
    
    // 4. 从环境变量获取配置
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('🔧 环境变量检查:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseKey,
      supabaseUrlLength: supabaseUrl ? supabaseUrl.length : 0,
      supabaseKeyLength: supabaseKey ? supabaseKey.length : 0
    });
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ 错误：缺少 Supabase 环境变量');
      return res.status(500).json({ 
        success: false, 
        error: '服务器配置错误，请联系管理员' 
      });
    }
    
    // 5. 连接 Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 6. 查询许可证 - 修复：不使用 .single()，改用 .limit(1)
    console.log('🔍 查询许可证:', license_key.trim());
    const { data: licenses, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('key', license_key.trim())
      .limit(1);
    
    if (licenseError) {
      console.error('❌ 查询许可证错误:', licenseError);
      return res.status(500).json({ 
        success: false, 
        error: '查询数据库失败' 
      });
    }
    
    // 7. 检查是否找到许可证
    if (!licenses || licenses.length === 0) {
      console.log('⚠️ 未找到许可证:', license_key.trim());
      return res.status(404).json({ 
        success: false, 
        error: '许可证不存在，请检查密钥是否正确。确保已从Gumroad购买并等待几分钟。' 
      });
    }
    
    const license = licenses[0];
    console.log('✅ 找到许可证:', { 
      id: license.id,
      type: license.type,
      user_id: license.user_id,
      created_at: license.created_at,
      key: `${license.key.substring(0, 8)}...`
    });
    
    // 8. 检查许可证是否已被使用
    if (license.user_id && license.user_id !== user_id) {
      console.log('🚫 许可证已被使用:', { 
        current_user: license.user_id, 
        requesting_user: user_id 
      });
      return res.status(400).json({ 
        success: false, 
        error: '许可证已被其他用户使用' 
      });
    }
    
    // 9. 如果已激活，直接返回成功
    if (license.user_id === user_id) {
      const max_screens = license.type === '4screen' ? 4 : 6;
      console.log('ℹ️ 许可证已激活，直接返回:', { max_screens });
      return res.status(200).json({ 
        success: true, 
        max_screens,
        message: '许可证已激活'
      });
    }
    
    // 10. 激活许可证
    console.log('🔄 正在激活许可证...');
    const { error: updateError } = await supabase
      .from('licenses')
      .update({ 
        user_id, 
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', license.id);
    
    if (updateError) {
      console.error('❌ 更新许可证错误:', updateError);
      throw updateError;
    }
    
    // 11. 返回成功
    const max_screens = license.type === '4screen' ? 4 : 6;
    
    console.log('🎉 激活成功:', { 
      user_id, 
      max_screens,
      timestamp: new Date().toISOString()
    });
    
    return res.status(200).json({ 
      success: true, 
      max_screens,
      message: '许可证激活成功！'
    });
    
  } catch (error) {
    console.error('💥 激活过程中出错:', error);
    return res.status(500).json({ 
      success: false, 
      error: '服务器内部错误: ' + error.message
    });
  }
}
