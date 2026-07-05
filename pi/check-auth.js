export default async function handler(req, res) {
  // CORS 처리 (모든 도메인 허용)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 사전 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 오직 POST 요청만 처리
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const REAL_PASSWORD = 'gst1234!';
  const BASE_URL = 'https://github.io';

  try {
    // 혹시 모를 문자열 파싱 예외 처리 추가
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const { password } = body;

    // 비밀번호가 맞을 때
    if (password === REAL_PASSWORD) {
      return res.status(200).json({ 
        success: true, 
        data: { base: BASE_URL } 
      });
    }

    // 비밀번호가 틀렸을 때
    return res.status(401).json({ success: false, message: 'Incorrect password' });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
}
