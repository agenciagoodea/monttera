const { Client } = require('ssh2');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SSH_HOST = process.env.SSH_HOST || '177.136.229.86';
const SSH_USER = process.env.SSH_USER || 'digitalbordados';
const SSH_PASS = process.env.SSH_PASS || 'Commandtvidebula1593*#';
const SSH_PORT = parseInt(process.env.SSH_PORT || '22', 10);

const mysqlCmd = (sql) => {
  return `mysql -u digitalbordados_novo -prG8phG4YKqxjBEeFmGfw -h 127.0.0.1 -P 3306 -D digitalbordados_novo -t -e "${sql}"`;
};

const queries = [
  {
    title: "Estrutura da tabela lgpd_consents",
    sql: "DESCRIBE lgpd_consents;"
  },
  {
    title: "Registros recentes da tabela lgpd_consents",
    sql: "SELECT * FROM lgpd_consents ORDER BY id DESC LIMIT 5;"
  }
];

const remoteCmd = queries.map(q => {
  return `echo ""; echo "=========================================================================="; echo "${q.title}"; echo "=========================================================================="; ${mysqlCmd(q.sql)}`;
}).join(' && ');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH :: Conectado.');
  conn.exec(remoteCmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: SSH_HOST,
  port: SSH_PORT,
  username: SSH_USER,
  password: SSH_PASS
});
