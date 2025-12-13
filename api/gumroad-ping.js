// api/gumroad-ping.js - 修复版本
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  console.log('📩 Gumroad Ping 请求开始处理');
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Gumroad Ping API 正常运行',
      status: 'active',
      timestamp: new Date().toISOString()
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: '只支持 POST 方法'
    });
  }
  
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
    }
    
    console.log('📦 原始请求体长度:', body.length);
    
    const params = new URLSearchParams(body);
    const data = {};
    
    for (const [key, value] of params.entries()) {
      data[key] = value;
    }
    
    console.log('📋 收到的字段:', Object.keys(data));
    
    if (!data.license_key) {
      console.error('❌ 错误: 缺少 license_key');
      console.log('📊 收到的所有数据:', data);
      
      return res.status(200).json({
        success: false,
        error: 'Ping 请求中缺少许可证密钥'
      });
    }
    
    // 关键修复：更准确的许可证类型判断
    let licenseType = '4screen'; // 默认值
    
    // 1. 优先根据 product_permalink 判断
    if (data.product_permalink) {
      if (data.product_permalink.includes('6_') || 
          data.product_permalink.includes('6-multihotplayer') ||
          data.product_permalink.includes('6_multihotplayer') ||
          data.product_permalink.includes('6screen')) {
        licenseType = '6screen';
        console.log('🔍 根据 product_permalink 判断为6屏:', data.product_permalink);
      } else if (data.product_permalink.includes('4_') || 
                 data.product_permalink.includes('4-multihotplayer') ||
                 data.product_permalink.includes('4_multihotplayer') ||
                 data.product_permalink.includes('4screen')) {
        licenseType = '4screen';
        console.log('🔍 根据 product_permalink 判断为4屏:', data.product_permalink);
      }
    }
    
    // 2. 如果没有product_permalink，检查其他字段
    if (licenseType === '4screen') {
      if (data.product_name) {
        if (data.product_name.includes('6 Screen') || 
            data.product_name.includes('6屏') ||
            data.product_name.includes('6屏幕') ||
            data.product_name.includes('专业版') ||
            data.product_name.includes('Professional') ||
            data.product_name.includes('Full Version')) {
          licenseType = '6screen';
          console.log('🔍 根据 product_name 判断为6屏:', data.product_name);
        }
      }
      
      // 3. 根据价格判断
      if (data.price) {
        const price = parseFloat(data.price);
        if (!isNaN(price)) {
          if (price >= 1.80 && price <= 1.99) {
            licenseType = '6screen';
            console.log('🔍 根据价格判断为6屏:', price);
          } else if (price >= 0.80 && price <= 0.99) {
            licenseType = '4screen';
            console.log('🔍 根据价格判断为4屏:', price);
          }
        }
      }
      
      // 4. 最后根据许可证密钥特征判断（备用）
      if (licenseType === '4screen' && data.license_key) {
        const key = data.license_key.toUpperCase();
        // 如果密钥包含某些特征，可能是6屏
        if (key.includes('PRO') || key.includes('FULL') || key.includes('6')) {
          licenseType = '6screen';
          console.log('🔍 根据许可证密钥特征判断为6屏');
        }
      }
    }
    
    console.log('🏷️  最终确定的许可证类型:', licenseType);
    
    // 连接 Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ 缺少 Supabase 环境变量');
      return res.status(200).json({
        success: false,
        error: '服务器配置错误'
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 准备数据
    const now = new Date().toISOString();
    const licenseData = {
      key: data.license_key.trim(),
      type: licenseType,
      gumroad_order_id: data.sale_id || data.order_id || `PING-${Date.now()}`,
      purchase_email: data.email || '',
      gumroad_product: data.product_permalink || data.product_name || (licenseType === '6screen' ? '6_multihotplayer' : '4_multihotplayer'),
      updated_at: now
    };
    
    // 添加购买时间
    if (data.sale_timestamp) {
      licenseData.purchased_at = new Date(data.sale_timestamp * 1000).toISOString();
    }
    
    console.log('💾 准备保存的许可证数据（脱敏）:', {
      key: `${licenseData.key.substring(0, 8)}...`,
      type: licenseData.type,
      gumroad_product: licenseData.gumroad_product,
      order_id: licenseData.gumroad_order_id
    });
    
    // 插入/更新数据库
    console.log('正在保存到数据库...');
    
    // 先检查是否已存在
    const { data: existingLicense } = await supabase
      .from('licenses')
      .select('id, key, type')
      .eq('key', licenseData.key)
      .maybeSingle();
    
    let operation;
    
    if (existingLicense) {
      // 关键修复：如果现有类型错误，强制更新
      if (existingLicense.type !== licenseType) {
        console.log(`⚠️  发现类型不一致，从 ${existingLicense.type} 更新为 ${licenseType}`);
      }
      
      const { error: updateError } = await supabase
        .from('licenses')
        .update(licenseData)
        .eq('key', licenseData.key);
      
      if (updateError) {
        throw new Error(`更新失败: ${updateError.message}`);
      }
      operation = 'updated';
    } else {
      // 插入新记录
      const { error: insertError } = await supabase
        .from('licenses')
        .insert([{
          ...licenseData,
          created_at: now
        }]);
      
      if (insertError) {
        throw new Error(`插入失败: ${insertError.message}`);
      }
      operation = 'created';
    }
    
    console.log(`✅ 许可证记录已${operation}，类型: ${licenseType}`);
    
    // 返回成功响应
    const response = {
      success: true,
      message: `许可证已成功${operation === 'created' ? '创建' : '更新'}`,
      license_type: licenseType,
      max_screens: licenseType === '6screen' ? 6 : 4,
      operation: operation,
      timestamp: now
    };
    
    console.log('🎉 Ping 处理完成，返回响应:', response);
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ 处理 Ping 时发生错误:', error);
    
    res.status(200).json({
      success: false,
      error: '处理过程中发生错误',
      detail: error.message,
      timestamp: new Date().toISOString()
    });
  }
}// api/gumroad-ping.js - 兼容你的表结构版本
import { createClient } from '@supabase/supabase-js';

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
    
    // 2. 解析 x-www-form-urlencoded 数据
    const params = new URLSearchParams(body);
    const data = {};
    
    for (const [key, value] of params.entries()) {
      data[key] = value;
    }
    
    console.log('📋 收到的字段:', Object.keys(data));
    console.log('🔍 关键字段值:', {
      hasLicenseKey: !!data.license_key,
      licenseKey: data.license_key ? `${data.license_key.substring(0, 8)}...` : '无',
      email: data.email ? `${data.email.substring(0, 3)}...` : '无',
      product: data.product_permalink || '未知',
      saleId: data.sale_id || data.order_id || '无'
    });
    
    // 3. 验证必需字段
    if (!data.license_key) {
      console.error('❌ 错误: 缺少 license_key');
      console.log('📊 收到的所有数据:', data);
      
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
    
    // 5. 连接 Supabase
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
    
    console.log('💾 准备保存的数据（脱敏）:', {
      key: `${licenseData.key.substring(0, 8)}...`,
      type: licenseData.type,
      gumroad_order_id: licenseData.gumroad_order_id,
      purchase_email: licenseData.purchase_email ? `${licenseData.purchase_email.substring(0, 3)}...` : '空',
      gumroad_product: licenseData.gumroad_product
    });
    
    // 7. 插入/更新数据库
    console.log('正在保存到数据库...');
    
    // 先检查是否已存在
    const { data: existingLicense } = await supabase
      .from('licenses')
      .select('id, key')
      .eq('key', licenseData.key)
      .maybeSingle();
    
    let operation;
    
    if (existingLicense) {
      // 更新现有记录
      const { error: updateError } = await supabase
        .from('licenses')
        .update(licenseData)
        .eq('key', licenseData.key);
      
      if (updateError) {
        throw new Error(`更新失败: ${updateError.message}`);
      }
      operation = 'updated';
    } else {
      // 插入新记录
      const { error: insertError } = await supabase
        .from('licenses')
        .insert([{
          ...licenseData,
          created_at: now
        }]);
      
      if (insertError) {
        throw new Error(`插入失败: ${insertError.message}`);
      }
      operation = 'created';
    }
    
    console.log(`✅ 许可证记录已${operation}`);
    
    // 8. 返回成功响应
    const response = {
      success: true,
      message: `许可证已成功${operation === 'created' ? '创建' : '更新'}`,
      license_key: `${licenseData.key.substring(0, 4)}****${licenseData.key.substring(licenseData.key.length - 4)}`,
      license_type: licenseType,
      operation: operation,
      timestamp: now
    };
    
    console.log('🎉 Ping 处理完成，返回响应:', response);
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ 处理 Ping 时发生错误:', error);
    
    // 返回 200 避免 Gumroad 重试
    res.status(200).json({
      success: false,
      error: '处理过程中发生错误',
      detail: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

