// api/gumroad-ping.js - 完整修复版
export default async function handler(req, res) {
  console.log('📩 Gumroad Ping 请求开始处理');
  
  // 设置 CORS 头部
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 允许测试用的 GET 请求
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Gumroad Ping API 正常运行',
      status: 'active',
      timestamp: new Date().toISOString(),
      note: '请使用 POST 方法发送实际的 Ping 数据'
    });
  }
  
  // 只处理 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: '只支持 POST 方法'
    });
  }
  
  try {
    // 1. 读取请求体
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
    }
    
    console.log('📦 原始请求体长度:', body.length);
    if (body.length > 0) {
      console.log('📝 原始请求体前200字符:', body.substring(0, 200));
    }
    
    // 2. 解析 x-www-form-urlencoded 数据
    const params = new URLSearchParams(body);
    const data = {};
    
    for (const [key, value] of params.entries()) {
      data[key] = value;
      console.log(`📋 ${key}: ${value.length > 50 ? value.substring(0, 50) + '...' : value}`);
    }
    
    // 3. 验证必需字段
    if (!data.license_key) {
      console.error('❌ 错误: 缺少 license_key');
      console.log('📊 收到的所有字段:', Object.keys(data));
      
      // 返回 200 避免 Gumroad 重试
      return res.status(200).json({
        success: false,
        error: 'Ping 请求中缺少许可证密钥',
        received_fields: Object.keys(data),
        timestamp: new Date().toISOString()
      });
    }
    
    // 4. 确定许可证类型
    let licenseType = '4screen'; // 默认值
    
    if (data.product_permalink) {
      if (data.product_permalink.includes('6_') || 
          data.product_permalink.includes('6screen') ||
          data.product_permalink.includes('6-multihotplayer')) {
        licenseType = '6screen';
      }
    } else if (data.product_name) {
      if (data.product_name.includes('6 Screen') || 
          data.product_name.includes('6屏')) {
        licenseType = '6screen';
      }
    }
    
    console.log('🏷️  确定的许可证类型:', licenseType);
    
    // 5. 动态导入并连接 Supabase
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ 缺少 Supabase 环境变量');
      return res.status(200).json({
        success: false,
        error: '服务器配置错误',
        note: '请检查环境变量配置'
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 6. 准备要保存的数据
    const now = new Date().toISOString();
    const licenseData = {
      key: data.license_key.trim(),
      type: licenseType,
      gumroad_order_id: data.sale_id || data.order_id || `PING-${Date.now()}`,
      purchase_email: data.email || '',
      gumroad_product: data.product_permalink || data.product_name || (licenseType === '6screen' ? '6_multihotplayer' : '4_multihotplayer'),
      updated_at: now
    };
    
    // 添加价格信息（如果有）
    if (data.price) {
      const price = parseFloat(data.price);
      if (!isNaN(price)) {
        licenseData.price_cents = Math.round(price * 100);
      }
    }
    
    // 添加货币信息（如果有）
    if (data.currency && (data.currency === 'USD' || data.currency === 'EUR' || data.currency === 'CNY')) {
      licenseData.currency = data.currency;
    }
    
    // 添加购买者ID（如果有）
    if (data.purchaser_id) {
      licenseData.purchaser_id = data.purchaser_id;
    }
    
    console.log('💾 准备保存的许可证数据:', {
      key: `${licenseData.key.substring(0, 8)}...${licenseData.key.substring(licenseData.key.length - 4)}`,
      type: licenseData.type,
      gumroad_order_id: licenseData.gumroad_order_id,
      purchase_email: licenseData.purchase_email ? `${licenseData.purchase_email.substring(0, 3)}...${licenseData.purchase_email.substring(licenseData.purchase_email.length - 3)}` : '空',
      gumroad_product: licenseData.gumroad_product
    });
    
    // 7. 检查是否已存在
    console.log('🔍 检查数据库中是否已存在该许可证...');
    const { data: existingLicenses, error: queryError } = await supabase
      .from('licenses')
      .select('id, user_id')
      .eq('key', licenseData.key)
      .limit(1);
    
    if (queryError) {
      console.error('❌ 查询现有许可证错误:', queryError);
      throw queryError;
    }
    
    let operation;
    
    if (existingLicenses && existingLicenses.length > 0) {
      // 更新现有记录
      console.log('🔄 更新现有许可证记录:', existingLicenses[0].id);
      const { error: updateError } = await supabase
        .from('licenses')
        .update(licenseData)
        .eq('id', existingLicenses[0].id);
      
      if (updateError) {
        console.error('❌ 更新许可证错误:', updateError);
        throw new Error(`更新失败: ${updateError.message}`);
      }
      operation = 'updated';
    } else {
      // 插入新记录
      console.log('➕ 插入新的许可证记录');
      const { error: insertError } = await supabase
        .from('licenses')
        .insert([{
          ...licenseData,
          created_at: now
        }]);
      
      if (insertError) {
        console.error('❌ 插入许可证错误:', insertError);
        throw new Error(`插入失败: ${insertError.message}`);
      }
      operation = 'created';
    }
    
    console.log(`✅ 许可证记录已${operation}:`, {
      key: `${licenseData.key.substring(0, 4)}****${licenseData.key.substring(licenseData.key.length - 4)}`,
      type: licenseType,
      timestamp: now
    });
    
    // 8. 返回成功响应
    const response = {
      success: true,
      message: `许可证已成功${operation === 'created' ? '创建' : '更新'}`,
      license_key: `${licenseData.key.substring(0, 4)}****${licenseData.key.substring(licenseData.key.length - 4)}`,
      license_type: licenseType,
      operation: operation,
      timestamp: now
    };
    
    console.log('🎉 Ping 处理完成，返回响应');
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('💥 处理 Ping 时发生错误:', error);
    
    // 返回 200 避免 Gumroad 重试
    return res.status(200).json({
      success: false,
      error: '处理过程中发生错误',
      detail: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
