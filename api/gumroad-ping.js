// api/gumroad-ping.js - 处理Gumroad Ping通知（直接获取密钥）
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  console.log('📩 收到Gumroad Ping请求');
  
  try {
    // ========== 1. 解析Ping数据（x-www-form-urlencoded格式）==========
    let body = '';
    
    // 读取原始请求体
    for await (const chunk of req) {
      body += chunk;
    }
    
    console.log('📋 原始Ping数据:', body);
    
    // 解析URL编码的数据
    const params = new URLSearchParams(body);
    const pingData = Object.fromEntries(params.entries());
    
    console.log('🔍 解析后的Ping数据:', JSON.stringify(pingData, null, 2));
    
    // ========== 2. 提取关键信息 ==========
    const {
      email,              // 买家邮箱
      product_permalink,  // 产品链接
      sale_id,            // 销售ID
      price,              // 价格
      currency,           // 货币
      order_id,           // 订单ID
      // ✅ 关键：Ping直接包含许可证密钥！
      license_key,        // 许可证密钥
      purchaser_id,       // 购买者ID
      created_at          // 创建时间
    } = pingData;
    
    console.log('🎯 提取的关键字段:', {
      sale_id,
      email: email ? `${email.substring(0, 3)}...` : '无邮箱',
      product: product_permalink,
      // 只显示密钥前几位用于日志
      license_key: license_key ? `${license_key.substring(0, 8)}...` : '无密钥'
    });
    
    // ========== 3. 验证必需字段 ==========
    if (!license_key) {
      console.error('❌ Ping中未找到license_key字段');
      console.log('📊 完整的Ping数据用于调试:');
      console.log(pingData);
      
      return res.status(400).json({
        success: false,
        error: 'Ping请求中缺少许可证密钥',
        received_fields: Object.keys(pingData)
      });
    }
    
    if (!sale_id && !order_id) {
      console.error('❌ 缺少订单标识符');
      return res.status(400).json({
        success: false,
        error: '缺少销售ID或订单ID'
      });
    }
    
    // ========== 4. 确定许可证类型 ==========
    let licenseType = '4screen'; // 默认
    
    // 根据产品链接判断
    if (product_permalink) {
      if (product_permalink.includes('6_multihotplayer') || 
          product_permalink.includes('6screen')) {
        licenseType = '6screen';
        console.log('🏷️  识别为6屏许可证');
      } else if (product_permalink.includes('4_multihotplayer') || 
                 product_permalink.includes('4screen')) {
        licenseType = '4screen';
        console.log('🏷️  识别为4屏许可证');
      }
    }
    
    // 根据价格判断（备选方案）
    if (price) {
      const priceNum = parseFloat(price);
      if (priceNum >= 1.5) { // 假设$1.5以上是6屏
        licenseType = '6screen';
        console.log('💰 根据价格判断为6屏:', price);
      }
    }
    
    console.log('✅ 确定许可证信息:', {
      type: licenseType,
      key_prefix: license_key.substring(0, 12)
    });
    
    // ========== 5. 连接Supabase ==========
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ 缺少Supabase环境变量');
      return res.status(500).json({
        success: false,
        error: '服务器配置错误'
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // ========== 6. 检查密钥是否已存在 ==========
    const orderIdentifier = sale_id || order_id;
    
    const { data: existingLicense } = await supabase
      .from('licenses')
      .select('key, gumroad_order_id, purchase_email')
      .eq('key', license_key.trim())
      .single();
    
    if (existingLicense) {
      console.log('⚠️  密钥已存在于数据库:', {
        existing_order: existingLicense.gumroad_order_id,
        new_order: orderIdentifier
      });
      
      // 如果是同一订单的重复Ping，直接返回成功
      if (existingLicense.gumroad_order_id === orderIdentifier) {
        console.log('✅ 相同订单的重复Ping，跳过处理');
        return res.status(200).json({
          success: true,
          message: '密钥已存在，重复通知已忽略',
          license_key: license_key
        });
      }
      
      // 不同订单使用相同密钥？这是严重问题！
      console.error('🚨 严重：不同订单使用相同密钥！', {
        existing: existingLicense.gumroad_order_id,
        new: orderIdentifier
      });
      
      // 记录但不阻止处理（可能是测试或特殊情况）
    }
    
    // ========== 7. 插入或更新数据库记录 ==========
    console.log('💾 同步许可证到Supabase...');
    
    const licenseData = {
      key: license_key.trim(),
      type: licenseType,
      user_id: null,                     // 等待用户激活
      gumroad_order_id: orderIdentifier,
      purchase_email: email || '',
      gumroad_product: product_permalink || '未知产品',
      price: price ? parseFloat(price) : null,
      currency: currency || 'USD',
      purchaser_id: purchaser_id || '',
      created_at: created_at ? new Date(created_at).toISOString() : new Date().toISOString(),
      activated_at: null,                // 未激活
      source: 'gumroad_ping',
      notes: `通过Gumroad Ping自动同步，时间: ${new Date().toISOString()}`
    };
    
    console.log('📝 准备插入的数据:', {
      ...licenseData,
      key: `${licenseData.key.substring(0, 8)}...` // 日志中隐藏完整密钥
    });
    
    // 使用upsert（插入或更新）操作
    const { data, error } = await supabase
      .from('licenses')
      .upsert(licenseData, {
        onConflict: 'key',  // 如果密钥已存在则更新
        ignoreDuplicates: false
      })
      .select();
    
    if (error) {
      console.error('❌ 数据库操作失败:', error);
      
      // 尝试简单的插入操作
      console.log('🔄 尝试直接插入...');
      const { error: insertError } = await supabase
        .from('licenses')
        .insert([licenseData]);
      
      if (insertError) {
        throw new Error(`数据库操作失败: ${error.message}, 插入也失败: ${insertError.message}`);
      }
      
      console.log('✅ 直接插入成功');
    } else {
      console.log('✅ 数据库操作成功，记录:', data ? '已创建/更新' : '无返回数据');
    }
    
    // ========== 8. 返回成功响应（必须返回200） ==========
    console.log('🎉 Gumroad Ping处理完成！');
    
    res.status(200).json({
      success: true,
      message: '许可证已同步到数据库',
      license_key: license_key,
      license_type: licenseType,
      order_id: orderIdentifier,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 处理Ping时出错:', error);
    
    // 重要：即使出错也要返回200，否则Gumroad会重试
    res.status(200).json({
      success: false,
      error: '处理完成但有错误',
      detail: error.message,
      timestamp: new Date().toISOString()
    });
  }
}