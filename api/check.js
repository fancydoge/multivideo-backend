// api/check.js
import { createClient } from '@supabase/supabase-js';

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
    
    if (!user_id) {
      return res.status(400).json({ 
        valid: false, 
        error: '缺少用户ID' 
      });
    }
    
    // 获取环境变量
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ 
        valid: false, 
        error: '服务器配置错误' 
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 查询用户的所有许可证
    const { data: licenses, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('user_id', user_id);
    
    if (error) {
      console.error('查询用户许可证错误:', error);
      return res.status(500).json({ 
        valid: false, 
        error: '查询失败' 
      });
    }
    
    if (!licenses || licenses.length === 0) {
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
    
    res.status(200).json({ 
      valid: true, 
      max_screens 
    });
    
  } catch (error) {
    console.error('检查许可证错误:', error);
    res.status(500).json({ 
      valid: false, 
      error: '服务器错误' 
    });
  }
}
