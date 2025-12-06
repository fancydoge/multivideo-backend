// api/activate.js - 修复中文编码错误版本
export default async function handler(req, res) {
  // 设置CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: '请使用POST方法'
    });
  }

  try {
    // 1. 获取请求体
    const { user_id, license_key } = req.body;

    if (!user_id || !license_key) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：用户ID或许可证密钥'
      });
    }

    // 2. 动态导入 Supabase 客户端
    const { createClient } = await import('@supabase/supabase-js');

    // 3. 从环境变量获取配置
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 关键检查：确保环境变量存在且为字符串
    if (!supabaseUrl || typeof supabaseUrl !== 'string') {
      console.error('错误：NEXT_PUBLIC_SUPABASE_URL 环境变量未设置或格式错误');
      return res.status(500).json({
        success: false,
        error: '服务器配置错误'
      });
    }

    if (!supabaseKey || typeof supabaseKey !== 'string') {
      console.error('错误：SUPABASE_SERVICE_ROLE_KEY 环境变量未设置或格式错误');
      return res.status(500).json({
        success: false,
        error: '服务器配置错误'
      });
    }

    // 4. 创建 Supabase 客户端
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. 查询许可证
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('*')
      .eq('key', license_key.trim())
      .single();

    if (licenseError) {
      console.error('查询许可证错误:', licenseError);
      return res.status(404).json({
        success: false,
        error: '许可证不存在或查询失败'
      });
    }

    if (!license) {
      return res.status(404).json({
        success: false,
        error: '许可证密钥无效'
      });
    }

    // 6. 检查许可证状态
    if (license.user_id && license.user_id !== user_id) {
      return res.status(400).json({
        success: false,
        error: '此许可证已被其他用户激活'
      });
    }

    // 7. 如果当前用户已激活，直接返回成功
    if (license.user_id === user_id) {
      const max_screens = license.type === '4screen' ? 4 : 6;
      return res.status(200).json({
        success: true,
        max_screens: max_screens,
        message: '许可证已激活'
      });
    }

    // 8. 激活许可证（更新数据库）
    const { error: updateError } = await supabase
      .from('licenses')
      .update({
        user_id: user_id,
        activated_at: new Date().toISOString()
      })
      .eq('key', license_key.trim());

    if (updateError) {
      console.error('更新许可证错误:', updateError);
      return res.status(500).json({
        success: false,
        error: '激活失败，请稍后重试'
      });
    }

    // 9. 返回成功
    const max_screens = license.type === '4screen' ? 4 : 6;
    return res.status(200).json({
      success: true,
      max_screens: max_screens,
      message: '许可证激活成功！'
    });

  } catch (error) {
    console.error('激活过程发生意外错误:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部处理错误'
    });
  }
}
