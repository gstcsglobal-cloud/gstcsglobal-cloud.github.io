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
      // ⚠ Range 를 지원하지 않으면 브라우저가 «탐색 불가»로 판정해 video.seekable 이 [0,0] 이 된다.
      //    그러면 currentTime 대입이 «조용히 무시»되고 모든 영상이 첫 프레임에 얼어붙는다 —
      //    에러도 경고도 없다. file:// 에서는 되던 것이 http 로 옮기면서 깨졌다(v7 사고).
      const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
      const size = fs.statSync(f).size, range = req.headers.range;
      if (range){
        const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (m){
          let a = m[1] === '' ? null : +m[1], b = m[2] === '' ? null : +m[2];
          if (a === null){ a = Math.max(0, size - (b || 0)); b = size - 1; }
          else if (b === null || b >= size) b = size - 1;
          if (a > b || a >= size){ rq.writeHead(416, { 'Content-Range': `bytes */${size}` }); return rq.end(); }
          rq.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1, 'Cache-Control': 'no-store' });
          return fs.createReadStream(f, { start: a, end: b }).pipe(rq);
        }
      }
      rq.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
                          'Content-Length': size, 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
  });
};
