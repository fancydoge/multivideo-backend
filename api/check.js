// api/check.js - 修复中文编码错误版本
export default async function handler(req, res) {
  // 设置CORS，允许浏览器扩展跨域请求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只处理GET请求
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '方法不允许' });
  }

  try {
    // 1. 获取查询参数
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(200).json({
        valid: false,
        max_screens: 2
      });
    }

    // 2. 导入 Supabase 客户端
    // 注意：动态导入以避免构建时的环境变量问题
    const { createClient } = await import('@supabase/supabase-js');

    // 3. 从环境变量获取配置
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 关键检查：确保环境变量存在且为字符串
    if (!supabaseUrl || typeof supabaseUrl !== 'string') {
      console.error('错误：NEXT_PUBLIC_SUPABASE_URL 环境变量未设置或格式错误');
      return res.status(500).json({
        valid: false,
        error: '服务器配置错误：缺少数据库URL'
      });
    }

    if (!supabaseKey || typeof supabaseKey !== 'string') {
      console.error('错误：SUPABASE_SERVICE_ROLE_KEY 环境变量未设置或格式错误');
      return res.status(500).json({
        valid: false,
        error: '服务器配置错误：缺少数据库密钥'
      });
    }

    // 4. 创建 Supabase 客户端
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. 查询数据库
    const { data, error } = await supabase
      .from('licenses')
      .select('type')
      .eq('user_id', user_id)
      .limit(1);

    if (error) {
      console.error('数据库查询错误:', error);
      return res.status(200).json({
        valid: false,
        max_screens: 2
      });
    }

    // 6. 处理查询结果
    if (!data || data.length === 0) {
      return res.status(200).json({
        valid: false,
        max_screens: 2
      });
    }

    // 7. 根据许可证类型确定最大屏幕数
    const licenseType = data[0].type;
    let max_screens = 2;

    if (licenseType === '6screen') {
      max_screens = 6;
    } else if (licenseType === '4screen') {
      max_screens = 4;
    }

    // 8. 返回成功响应
    return res.status(200).json({
      valid: true,
      max_screens: max_screens
    });

  } catch (error) {
    // 捕获所有未预料的错误
    console.error('验证过程发生意外错误:', error);
    return res.status(500).json({
      valid: false,
      error: '服务器内部处理错误'
    });
  }
}
