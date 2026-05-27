const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const files = [
  { remote: '/home/digitalbordados/digitalbordados/diagnostico_produtos_zips.md',   local: path.join(__dirname, '..', 'diagnostico_produtos_zips.md') },
  { remote: '/home/digitalbordados/digitalbordados/diagnostico_produtos_zips.json', local: path.join(__dirname, '..', 'diagnostico_produtos_zips.json') },
];

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) { conn.end(); throw err; }
    const downloads = files.map(f => new Promise((resolve, reject) => {
      sftp.fastGet(f.remote, f.local, err2 => err2 ? reject(err2) : resolve(f.local));
    }));
    Promise.all(downloads)
      .then(locals => { locals.forEach(l => console.log('✅ Baixado:', l)); conn.end(); })
      .catch(e => { console.error('Erro:', e.message); conn.end(); });
  });
}).connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
