// api/gumroad-ping.js - 终极修复版
import { createClient } from '@supabase/supabase-js';

// 辅助函数：延迟执行
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 GUMROAD PING 开始处理 - 时间:', new Date().toISOString());
  console.log('='.repeat(60));
  
  // 设置响应头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    console.log('收到 OPTIONS 预检请求');
    return res.status(200).end();
  }
  
  // 允许测试 GET 请求
  if (req.method === 'GET') {
    console.log('收到测试 GET 请求');
    
    // 测试数据库连接
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    let dbStatus = 'unknown';
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.from('licenses').select('count', { count: 'exact', head: true });
      
      if (error) {
        dbStatus = `error: ${error.message}`;
      } else {
        dbStatus = 'connected';
      }
    } catch (e) {
      dbStatus = `exception: ${e.message}`;
    }
    
    return res.status(200).json({
      success: true,
      message: 'Gumroad Ping API 运行正常',
      database: dbStatus,
      env_vars: {
        has_url: !!supabaseUrl,
        has_key: !!supabaseKey,
        url_prefix: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'none',
        key_prefix: supabaseKey ? supabaseKey.substring(0, 10) + '...' : 'none'
      },
      timestamp: new Date().toISOString()
    });
  }
  
  // 只处理 POST 请求
  if (req.method !== 'POST') {
    console.log(`❌ 错误请求方法: ${req.method}`);
    return res.status(405).json({
      success: false,
      error: '只支持 POST 方法'
    });
  }
  
  try {
    // 🔧 关键修复1: 使用 Next.js 推荐的方式解析请求体
    let bodyData = {};
    
    // 方法1: 如果 req.body 已经被解析（如使用了 bodyParser）
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      console.log('使用已解析的 req.body');
      bodyData = req.body;
    } 
    // 方法2: 手动解析 raw body
    else {
      console.log('手动解析请求体...');
      const chunks = [];
      
      // 读取所有数据块
      req.on('data', chunk => chunks.push(chunk));
      
      // 等待数据读取完成
      await new Promise((resolve, reject) => {
        req.on('end', resolve);
        req.on('error', reject);
      });
      
      const rawBody = Buffer.concat(chunks).toString();
      console.log(`原始请求体 (${rawBody.length} 字符):`, rawBody.substring(0, 200) + (rawBody.length > 200 ? '...' : ''));
      
      // 尝试解析为 URLSearchParams (Gumroad 格式)
      try {
        const params = new URLSearchParams(rawBody);
        for (const [key, value] of params.entries()) {
          bodyData[key] = value;
        }
        console.log(`✅ 成功解析为 URLSearchParams，获得 ${Object.keys(bodyData).length} 个字段`);
      } catch (e) {
        console.log('URLSearchParams 解析失败，尝试 JSON...');
        try {
          bodyData = JSON.parse(rawBody);
          console.log('✅ 成功解析为 JSON');
        } catch (e2) {
          console.error('❌ 无法解析请求体');
          return res.status(400).json({
            success: false,
            error: '无法解析请求体格式',
            raw_body_sample: rawBody.substring(0, 100)
          });
        }
      }
    }
    
    console.log('📋 解析后的数据:');
    console.log(JSON.stringify(bodyData, null, 2));
    
    // 🔧 关键修复2: 验证必需字段
    const licenseKey = bodyData.license_key || bodyData.license_key || bodyData.key;
    
    if (!licenseKey) {
      console.error('❌ 缺少许可证密钥字段');
      console.log('所有收到的字段:', Object.keys(bodyData));
      
      return res.status(400).json({
        success: false,
        error: '缺少许可证密钥 (license_key)',
        received_fields: Object.keys(bodyData),
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🔑 处理许可证: ${licenseKey.substring(0, 10)}...`);
    
    // 确定许可证类型
    let licenseType = '4screen';
    const product = (bodyData.product_permalink || bodyData.product_name || '').toLowerCase();
    
    if (product.includes('6') || product.includes('professional') || product.includes('full')) {
      licenseType = '6screen';
    }
    
    // 根据价格判断
    if (bodyData.price) {
      const price = parseFloat(bodyData.price);
      if (!isNaN(price) && price > 1.0) {
        licenseType = '6screen';
      }
    }
    
    console.log(`🏷️  许可证类型: ${licenseType}`);
    
    // 🔧 关键修复3: 数据库连接和插入
    console.log('正在连接数据库...');
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ 环境变量缺失');
      console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '已设置' : '未设置');
      console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '已设置' : '未设置');
      
      return res.status(500).json({
        success: false,
        error: '服务器配置错误 - 缺少数据库配置',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('Supabase URL:', supabaseUrl.substring(0, 30) + '...');
    console.log('Service Key 前10位:', supabaseKey.substring(0, 10) + '...');
    
    // 创建 Supabase 客户端
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      db: {
        schema: 'public'
      }
    });
    
    // 测试连接
    console.log('测试数据库连接...');
    const { error: testError } = await supabase.from('licenses').select('id').limit(1);
    
    if (testError) {
      console.error('❌ 数据库连接/查询失败:', testError);
      
      // 检查是否是表不存在
      if (testError.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: '数据库表不存在',
          detail: '请确认 licenses 表已创建',
          code: testError.code
        });
      }
      
      return res.status(500).json({
        success: false,
        error: '数据库连接失败',
        detail: testError.message,
        code: testError.code
      });
    }
    
    console.log('✅ 数据库连接成功');
    
    // 准备数据
    const now = new Date().toISOString();
    const licenseData = {
      key: licenseKey,
      type: licenseType,
      gumroad_order_id: bodyData.sale_id || bodyData.order_id || `PING-${Date.now()}`,
      purchase_email: bodyData.email || '',
      gumroad_product: bodyData.product_permalink || bodyData.product_name || 'unknown',
      created_at: now,
      updated_at: now
    };
    
    // 可选字段
    if (bodyData.price) {
      licenseData.price = parseFloat(bodyData.price);
    }
    if (bodyData.currency) {
      licenseData.currency = bodyData.currency;
    }
    if (bodyData.sale_timestamp) {
      licenseData.purchased_at = new Date(parseInt(bodyData.sale_timestamp) * 1000).toISOString();
    }
    
    console.log('💾 准备保存的数据:', {
      key: `${licenseData.key.substring(0, 8)}...`,
      type: licenseData.type,
      order_id: licenseData.gumroad_order_id,
      email: licenseData.purchase_email ? `${licenseData.purchase_email.substring(0, 3)}...` : '无'
    });
    
    // 🔧 关键修复4: 尝试多种插入方法
    console.log('开始写入数据库...');
    
    let result = null;
    let operation = 'unknown';
    let attempts = 0;
    
    // 方法1: 直接插入
    try {
      attempts++;
      console.log(`尝试 ${attempts}: 直接插入`);
      
      const { data, error } = await supabase
        .from('licenses')
        .insert([licenseData])
        .select();
      
      if (error) {
        console.log(`插入失败: ${error.message}`);
        throw error;
      }
      
      result = data;
      operation = 'inserted';
      console.log('✅ 直接插入成功');
      
    } catch (insertError) {
      console.log(`插入失败，错误代码: ${insertError.code}`);
      
      // 如果是唯一约束冲突 (23505)，尝试更新
      if (insertError.code === '23505') {
        attempts++;
        console.log(`尝试 ${attempts}: 更新现有记录 (唯一约束冲突)`);
        
        try {
          const { data, error } = await supabase
            .from('licenses')
            .update(licenseData)
            .eq('key', licenseKey)
            .select();
          
          if (error) throw error;
          
          result = data;
          operation = 'updated';
          console.log('✅ 更新成功');
          
        } catch (updateError) {
          console.error('更新也失败:', updateError);
          
          // 最后尝试: 使用 upsert
          attempts++;
          console.log(`尝试 ${attempts}: 使用 upsert`);
          
          try {
            const { data, error } = await supabase
              .from('licenses')
              .upsert(licenseData, { onConflict: 'key' })
              .select();
            
            if (error) throw error;
            
            result = data;
            operation = 'upserted';
            console.log('✅ Upsert 成功');
            
          } catch (upsertError) {
            console.error('所有写入方法都失败:', upsertError);
            throw new Error(`所有写入尝试失败: ${upsertError.message}`);
          }
        }
      } else {
        // 其他错误
        throw insertError;
      }
    }
    
    console.log(`🎉 数据库操作成功! 方式: ${operation}, 结果:`, result);
    
    // 验证数据
    await delay(100); // 短暂延迟确保数据提交
    
    const { data: verifyData } = await supabase
      .from('licenses')
      .select('id, key, type, created_at')
      .eq('key', licenseKey)
      .single();
    
    if (verifyData) {
      console.log('🔍 验证成功! 记录详情:', {
        id: verifyData.id,
        key: `${verifyData.key.substring(0, 8)}...`,
        type: verifyData.type,
        created: verifyData.created_at
      });
    } else {
      console.warn('⚠️  验证查询未返回数据');
    }
    
    // 成功响应
    const response = {
      success: true,
      message: `许可证${operation === 'inserted' ? '创建' : '更新'}成功`,
      license_key: `${licenseKey.substring(0, 6)}...${licenseKey.substring(licenseKey.length - 4)}`,
      license_type: licenseType,
      max_screens: licenseType === '6screen' ? 6 : 4,
      operation: operation,
      record_id: result?.[0]?.id || verifyData?.id || 'unknown',
      timestamp: now
    };
    
    console.log('='.repeat(60));
    console.log('✅ PING 处理完成 - 响应:', response);
    console.log('='.repeat(60) + '\n');
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('\n❌❌❌ 严重错误 ❌❌❌');
    console.error('错误类型:', error.constructor.name);
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    console.error('完整错误对象:', error);
    
    // 返回错误响应 (但状态码为200，避免Gumroad重试)
    return res.status(200).json({
      success: false,
      error: '处理失败',
      detail: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
  }
}
