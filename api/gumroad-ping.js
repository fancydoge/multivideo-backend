// api/gumroad-ping.js - 简化修复版
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  console.log('📩 收到Gumroad Ping请求，方法:', req.method);
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 只处理POST请求
  if (req.method !== 'POST') {
    console.log('⚠️  收到非POST请求，返回405');
    return res.status(405).json({ 
      success: false, 
      error: '只支持POST方法' 
    });
  }
  
  try {
    // ========== 1. 解析请求体 ==========
    let body = '';
    
    // 确保是x-www-form-urlencoded格式
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      console.log('⚠️  内容类型不正确:', contentType);
    }
    
    // 读取请求体
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString();
    
    console.log('📋 收到Ping数据，长度:', body.length, '字符');
    
    // 解析URL编码的数据
    const params = new URLSearchParams(body);
    const pingData = {};
    
    for (const [key, value] of params.entries()) {
      pingData[key] = value;
    }
    
    console.log('🔍 解析到字段:', Object.keys(pingData));
    
    // ========== 2. 提取关键信息 ==========
    const license_key = pingData.license_key;
    const email = pingData.email;
    const product_permalink = pingData.product_permalink;
    const sale_id = pingData.sale_id || pingData.order_id;
    
    console.log('🎯 提取的关键信息:', {
      has_license_key: !!license_key,
      license_key_prefix: license_key ? `${license_key.substring(0, 8)}...` : '无',
      email: email ? `${email.substring(0, 3)}...` : '无',
      product: product_permalink || '未知',
      sale_id: sale_id || '无'
    });
    
    // ========== 3. 验证必需字段 ==========
    if (!license_key) {
      console.error('❌ 错误：Ping中缺少license_key字段');
      console.log('📊 收到的所有字段:', pingData);
      
      // 返回200但标记失败（Gumroad要求返回200）
      return res.status(200).json({
        success: false,
        error: '缺少许可证密钥',
        received_fields: Object.keys(pingData),
        note: 'Gumroad Ping必须包含license_key参数'
      });
    }
    
    if (!sale_id) {
      console.warn('⚠️  警告：缺少sale_id，使用时间戳作为标识');
    }
    
    // ========== 4. 确定许可证类型 ==========
    let licenseType = '4screen';
    
    if (product_permalink) {
      if (product_permalink.includes('6_') || product_permalink.includes('6screen')) {
        licenseType = '6screen';
      }
    }
    
    // 如果没有产品信息，尝试根据其他信息判断
    if (!product_permalink && pingData.price) {
      const price = parseFloat(pingData.price);
      if (price >= 1.5) {
        licenseType = '6screen';
      }
    }
    
    console.log('🏷️  确定许可证类型:', licenseType);
    
    // ========== 5. 连接Supabase ==========
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ 缺少Supabase环境变量');
      return res.status(200).json({  // 返回200避免Gumroad重试
        success: false,
        error: '服务器配置错误'
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // ========== 6. 准备数据（只使用表中已有的字段）==========
    const licenseData = {
      key: license_key.trim(),
      type: licenseType,
      gumroad_order_id: sale_id || `PING-${Date.now()}`,
      purchase_email: email || '',
      created_at: pingData.created_at ? new Date(pingData.created_at).toISOString() : new Date().toISOString()
    };
    
    // 可选：添加其他字段（如果表中存在）
    if (pingData.price) {
      licenseData.price_cents = Math.round(parseFloat(pingData.price) * 100);
    }
    
    if (pingData.product_name) {
      licenseData.gumroad_product = pingData.product_name;
    } else if (product_permalink) {
      licenseData.gumroad_product = product_permalink;
    }
    
    console.log('💾 准备保存的数据:', {
      ...licenseData,
      key: `${licenseData.key.substring(0, 8)}...` // 日志中隐藏完整密钥
    });
    
    // ========== 7. 插入数据库 ==========
    console.log('正在插入数据库...');
    
    // 先尝试upsert（更新或插入）
    const { error } = await supabase
      .from('licenses')
      .upsert(licenseData, {
        onConflict: 'key'
      });
    
    if (error) {
      console.error('❌ upsert失败，尝试insert:', error.message);
      
      // 尝试简单的insert
      const { error: insertError } = await supabase
        .from('licenses')
        .insert([licenseData]);
      
      if (insertError) {
        console.error('❌ insert也失败:', insertError.message);
        
        // 检查表结构
        const { error: checkError } = await supabase
          .from('licenses')
          .select('key')
          .limit(1);
        
        if (checkError) {
          console.error('❌ 表连接测试失败:', checkError.message);
          throw new Error(`数据库错误: ${checkError.message}`);
        }
        
        throw new Error(`插入失败: ${insertError.message}`);
      }
    }
    
    console.log('✅ 许可证已保存到数据库');
    
    // ========== 8. 返回成功响应 ==========
    res.status(200).json({
      success: true,
      message: '许可证已成功同步',
      license_key: `${license_key.substring(0, 4)}...${license_key.substring(-4)}`, // 部分隐藏
      license_type: licenseType,
      timestamp: new Date().toISOString()
    });
    
    console.log('🎉 Ping处理完成！');
    
  } catch (error) {
    console.error('❌ 处理Ping时出错:', error.message);
    
    // 重要：返回200状态码，避免Gumroad重试
    res.status(200).json({
      success: false,
      error: '处理完成但有错误',
      detail: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
