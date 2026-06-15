const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const command = 'mysql -u digitalbordados_novo -prG8phG4YKqxjBEeFmGfw -e "SELECT * FROM digitalbordados_novo.settings"';

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec(command, (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code);
      console.log('\n--- OUTPUT ---');
      console.log(output);
      console.log('--------------');
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
