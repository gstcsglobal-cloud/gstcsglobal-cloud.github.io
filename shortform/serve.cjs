// 렌더용 초소형 정적 서버.
// ⚠ file:// 에서는 캔버스가 «오염»돼 getImageData 가 막힌다(SecurityError). 엔딩의 로고 조립은
//    실제 CI 의 알파를 읽어 파티클 도착점을 만들므로 http 오리진이 필요하다.
//    외부 프로세스(python -m http.server)를 띄우면 포트·정리가 또 하나의 실패 지점이 된다 — 여기서 띄우고 여기서 닫는다.
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webm':'video/webm',
  '.mp4':'video/mp4', '.ttf':'font/ttf', '.json':'application/json', '.svg':'image/svg+xml' };
module.exports = function serve(root = __dirname){
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(root, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); return rq.end(); }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
                          'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
  });
};
