const { createTunnel } = require('tunnel-ssh');
const dotenv = require('dotenv');

dotenv.config();

const sshConfig = {
  host: '177.136.229.86',
  port: 22,
  username: 'digitalbordados',
  password: 'Commandtvidebula1593*#',
  readyTimeout: 20000,
  keepaliveInterval: 10000, // Envia keepalive a cada 10 segundos para não deixar a conexão cair
  keepaliveCountMax: 3
};

const tunnelOptions = {
  autoClose: false,
};

const serverOptions = {
  port: parseInt(process.env.MYSQL_PORT) || 3307,
};

const forwardOptions = {
  srcAddr: '127.0.0.1',
  srcPort: parseInt(process.env.MYSQL_PORT) || 3307,
  dstAddr: '127.0.0.1',
  dstPort: 3306,
};

let activeServer = null;
let activeClient = null;
let isReconnecting = false;

function startTunnel() {
  console.log('Iniciando túnel SSH de desenvolvimento...');

  createTunnel(tunnelOptions, serverOptions, sshConfig, forwardOptions)
    .then(([server, client]) => {
      activeServer = server;
      activeClient = client;
      isReconnecting = false;

      console.log('\n==================================================');
      console.log(`🚀 TÚNEL SSH ATIVO NA PORTA ${serverOptions.port}`);
      console.log('==================================================');
      console.log('Conexão estabelecida com o banco remoto de produção.');
      console.log('Mantenha esta janela aberta para trabalhar localmente.');
      console.log('Pressione Ctrl+C para encerrar o túnel.');
      console.log('--------------------------------------------------\n');

      // Captura e silencia erros no servidor local do túnel para não derrubar o processo
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`❌ Porta ${serverOptions.port} já está em uso por outro processo.`);
          console.error('Tente fechar outros terminais de túnel ou mude MYSQL_PORT no .env.');
        } else {
          console.warn('⚠️ Erro tratado no servidor local:', err.message);
        }
      });

      // Captura e trata erros na conexão SSH
      client.on('error', (err) => {
        console.warn('⚠️ Erro na conexão SSH:', err.message);
        handleDisconnect();
      });

      client.on('close', () => {
        console.log('🔌 Conexão SSH encerrada pelo servidor.');
        handleDisconnect();
      });
    })
    .catch((err) => {
      console.error('❌ Erro ao criar o túnel SSH:', err.message);
      handleDisconnect();
    });
}

function handleDisconnect() {
  if (isReconnecting) return;
  isReconnecting = true;

  console.log('🔄 Conexão perdida. Tentando restabelecer túnel em 5 segundos...');
  
  try {
    if (activeServer) activeServer.close();
    if (activeClient) activeClient.end();
  } catch (e) {}

  setTimeout(() => {
    startTunnel();
  }, 5000);
}

// Inicia pela primeira vez
startTunnel();

// Captura encerramento amigável
process.on('SIGINT', () => {
  console.log('\nFechando conexões e encerrando túnel...');
  try {
    if (activeServer) activeServer.close();
    if (activeClient) activeClient.end();
  } catch (e) {}
  process.exit(0);
});

// Captura erros globais não tratados para evitar quebras abruptas do processo do túnel
process.on('uncaughtException', (err) => {
  console.warn('⚠️ Exceção tratada no processo do túnel:', err.message || err);
  handleDisconnect();
});

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Rejeição tratada no processo do túnel:', reason.message || reason);
  handleDisconnect();
});
