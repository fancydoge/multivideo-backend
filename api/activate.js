// api/activate.js
import { createClient } from '@supabase/supabase-js';

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
    console.log('收到激活请求:', { user_id, license_key: license_key?.substring(0, 8) + '...' });
    
    // 2. 检查必要参数
    if (!user_id || !license_key) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少用户ID或许可证密钥' 
      });
    }
    
    // 3. 获取环境变量
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('Supabase URL:', supabaseUrl ? '已设置' : '未设置');
    console.log('Supabase Key:', supabaseKey ? '已设置' : '未设置');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('错误：缺少 Supabase 环境变量');
      return res.status(500).json({ 
        success: false, 
        error: '服务器配置错误，请联系管理员' 
      });
    }
    
    // 4. 连接 Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 5. 查询许可证
    console.log('查询许可证:', license_key);
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('key', license_key.trim())
      .single();
    
    if (licenseError) {
      console.error('查询许可证错误:', licenseError);
      return res.status(500).json({ 
        success: false, 
        error: '查询数据库失败: ' + licenseError.message 
      });
    }
    
    if (!license) {
      return res.status(404).json({ 
        success: false, 
        error: '许可证不存在，请检查密钥是否正确' 
      });
    }
    
    console.log('找到许可证:', license);
    
    // 6. 检查许可证是否已被使用
    if (license.user_id && license.user_id !== user_id) {
      return res.status(400).json({ 
        success: false, 
        error: '许可证已被其他用户使用' 
      });
    }
    
    // 7. 如果已激活，直接返回成功
    if (license.user_id === user_id) {
      const max_screens = license.type === '4screen' ? 4 : 6;
      return res.status(200).json({ 
        success: true, 
        max_screens,
        message: '许可证已激活'
      });
    }
    
    // 8. 激活许可证
    const { error: updateError } = await supabase
      .from('licenses')
      .update({ 
        user_id, 
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('key', license_key.trim());
    
    if (updateError) {
      console.error('更新许可证错误:', updateError);
      throw updateError;
    }
    
    // 9. 返回成功
    const max_screens = license.type === '4screen' ? 4 : 6;
    
    console.log('激活成功:', { user_id, max_screens });
    
    res.status(200).json({ 
      success: true, 
      max_screens,
      message: '许可证激活成功！'
    });
    
  } catch (error) {
    console.error('激活过程中出错:', error);
    res.status(500).json({ 
      success: false, 
      error: '服务器内部错误: ' + error.message
    });
  }
}
