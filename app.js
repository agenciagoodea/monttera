// Entrypoint Wrapper para DirectAdmin e Phusion Passenger
// O Passenger por padrão busca arquivos como app.js ou server.js na raiz.
// Este arquivo simplesmente repassa a execução para o build correto dentro de dist/.
require('./dist/server.cjs');
