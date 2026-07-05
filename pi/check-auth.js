export default async function handler(req, res) {
  // CORS 에러 방지 및 POST 요청만 허용 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const REAL_PASSWORD = 'gst1234!';
  const BASE_URL = 'https://github.io';

  try {
    const { password } = req.body;

    if (password !== REAL_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    // 주소 데이터를 안전하게 리턴
    return res.status(200).json({ 
      success: true, 
      data: { base: BASE_URL } 
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
}
