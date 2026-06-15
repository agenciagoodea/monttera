const { Client } = require('ssh2');

const SSH_HOST = '177.136.229.86';
const SSH_USER = 'digitalbordados';
const SSH_PASS = 'Commandtvidebula1593*#';
const SSH_PORT = 22;

const sqlUpdates = [
  "UPDATE product_categories SET icon = 'Bug' WHERE id = 1",
  "UPDATE product_categories SET icon = 'ShieldAlert' WHERE id = 2",
  "UPDATE product_categories SET icon = 'Compass' WHERE id = 3",
  "UPDATE product_categories SET icon = 'Landmark' WHERE id = 4",
  "UPDATE product_categories SET icon = 'Briefcase' WHERE id = 5",
  "UPDATE product_categories SET icon = 'GraduationCap' WHERE id = 9",
  "UPDATE product_categories SET icon = 'Shield' WHERE id = 10",
  "UPDATE product_categories SET icon = 'Fuel' WHERE id = 12",
  "UPDATE product_categories SET icon = 'Wrench' WHERE id = 13",
  "UPDATE product_categories SET icon = 'Heart' WHERE id = 17",
  "UPDATE product_categories SET icon = 'Users' WHERE id = 19",
  "UPDATE product_categories SET icon = 'Building2' WHERE id = 20",
  "UPDATE product_categories SET icon = 'Flower2' WHERE id = 22",
  "UPDATE product_categories SET icon = 'Church' WHERE id = 29",
  "UPDATE product_categories SET icon = 'GraduationCap' WHERE id = 30",
  "UPDATE product_categories SET icon = 'Car' WHERE id = 32",
  "UPDATE product_categories SET icon = 'Apple' WHERE id = 42",
  "UPDATE product_categories SET icon = 'Flower' WHERE id = 43",
  "UPDATE product_categories SET icon = 'Palette' WHERE id = 44",
  "UPDATE product_categories SET icon = 'Skull' WHERE id = 52",
  "UPDATE product_categories SET icon = 'Fish' WHERE id = 53",
  "UPDATE product_categories SET icon = 'School' WHERE id = 58",
  "UPDATE product_categories SET icon = 'Trophy' WHERE id = 62",
  "UPDATE product_categories SET icon = 'Crown' WHERE id = 88",
  "UPDATE product_categories SET icon = 'Compass' WHERE id = 90",
  "UPDATE product_categories SET icon = 'Notebook' WHERE id = 92",
  "UPDATE product_categories SET icon = 'Sparkles' WHERE id = 98",
  "UPDATE product_categories SET icon = 'Tractor' WHERE id = 100",
  "UPDATE product_categories SET icon = 'Heart' WHERE id = 101",
  "UPDATE product_categories SET icon = 'Briefcase' WHERE id = 103",
  "UPDATE product_categories SET icon = 'Map' WHERE id = 109",
  "UPDATE product_categories SET icon = 'Bike' WHERE id = 110"
].join('; ');

const mysqlCommand = `mysql -u digitalbordados_novo -prG8phG4YKqxjBEeFmGfw -D digitalbordados_novo -e "${sqlUpdates}"`;
const pm2Command = 'pm2 reload digitalbordados';

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH :: Conectado.');
  console.log('SSH :: Executando updates no MySQL...');
  
  conn.exec(mysqlCommand, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log(`MySQL :: Finalizado com código ${code}`);
      
      console.log('SSH :: Executando reload do PM2...');
      conn.exec(pm2Command, (err2, stream2) => {
        if (err2) throw err2;
        stream2.on('close', (code2, signal2) => {
          console.log(`PM2 :: Finalizado com código ${code2}`);
          conn.end();
        }).on('data', (data) => {
          process.stdout.write(data);
        });
      });
      
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
