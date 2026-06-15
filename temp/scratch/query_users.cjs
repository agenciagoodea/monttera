const { Client } = require('ssh2');
const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const mysqlCmd = (sql) => {
  return `mysql -u digitalbordados_novo -prG8phG4YKqxjBEeFmGfw -h 127.0.0.1 -P 3306 -D digitalbordados_novo -t -e "${sql}"`;
};

const sql = `
  SELECT id, name, email FROM users WHERE id IN (1315, 1314, 1309);
`;

const conn = new Client();
conn.on('ready', () => {
  conn.exec(mysqlCmd(sql), (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log(output);
      conn.end();
    }).on('data', (data) => {
      output += data.toString();
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
