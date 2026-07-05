export default async function handler(req, res) {
  const REAL_PASSWORD = 'gst1234!';
  const BASE_URL = 'https://gstcsglobal-cloud.github.io';

  try {const { password } = req.body;
    if (password !== REAL_PASSWORD) {
    return res.status(401).json({ success: false, message: 'wrong' });}
    const tabsData = {
      base: BASE_URL,
    return res.status(200).json({ success: true, data: tabsData });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'server_error' });
  }
}
