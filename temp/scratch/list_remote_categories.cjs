const { Client } = require('ssh2');

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const command = 'mysql -u digitalbordados_novo -prG8phG4YKqxjBEeFmGfw -D digitalbordados_novo -e "SELECT id, name, slug, icon FROM product_categories WHERE parent_id IS NULL"';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(command, (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log('\n--- CATEGORIES ---');
      console.log(output);
      console.log('------------------');
      conn.end();
    }).on('data', (data) => {
      output += data.toString();
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
