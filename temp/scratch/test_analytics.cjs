const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Vamos simular a lógica do coletor do servidor localmente
const dbAsync = require('../../src/server/dbAsync').default;

function parseUserAgent(uaString) {
  const ua = uaString || '';
  let browser = 'Outro';
  let os = 'Outro';
  let deviceType = 'desktop';

  if (/mobi|android|iphone|ipad|ipod|windows phone/i.test(ua)) {
    deviceType = 'mobile';
  }

  if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
  } else if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  if (/edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/chrome|crios/i.test(ua) && !/opr|opios|edg/i.test(ua)) {
    browser = 'Chrome';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome|crios|opr|opios|edg/i.test(ua)) {
    browser = 'Safari';
  } else if (/opr|opera/i.test(ua)) {
    browser = 'Opera';
  }

  return { browser, os, deviceType };
}

function getIpHash(ip) {
  const salt = 'db_analytics_salt_2026';
  return crypto.createHmac('sha256', salt).update(ip).digest('hex');
}

const uas = {
  chrome_windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  safari_iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  firefox_linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
};

async function test() {
  console.log('--- INICIANDO TESTES DO ANALYTICS ---');

  try {
    // 1. Limpar visitas anteriores de teste
    console.log('Limpando dados antigos de teste...');
    await dbAsync.run('DELETE FROM site_visits WHERE ip_hash = ?', getIpHash('1.2.3.4'));
    
    // 2. Testar parsing de User-Agent
    console.log('\n2. Testando Parser de User-Agent:');
    
    const ua1 = parseUserAgent(uas.chrome_windows);
    console.log('Chrome no Windows:', ua1);
    if (ua1.browser !== 'Chrome' || ua1.os !== 'Windows' || ua1.deviceType !== 'desktop') {
      throw new Error('Falha no parser Chrome Windows');
    }

    const ua2 = parseUserAgent(uas.safari_iphone);
    console.log('Safari no iPhone:', ua2);
    if (ua2.browser !== 'Safari' || ua2.os !== 'iOS' || ua2.deviceType !== 'mobile') {
      throw new Error('Falha no parser Safari iPhone');
    }

    const ua3 = parseUserAgent(uas.googlebot);
    console.log('Googlebot:', ua3);
    
    // 3. Simular inserções de visitas no banco
    console.log('\n3. Simulando Inserção de Visitas:');
    const visitorId1 = crypto.randomUUID();
    const visitorId2 = crypto.randomUUID();

    const mockVisits = [
      { path: '/', full_url: 'http://localhost/', title: 'Início', ua: uas.chrome_windows, visitor: visitorId1, ip: '1.2.3.4' },
      { path: '/loja', full_url: 'http://localhost/loja', title: 'Loja', ua: uas.chrome_windows, visitor: visitorId1, ip: '1.2.3.4' },
      { path: '/loja', full_url: 'http://localhost/loja', title: 'Loja', ua: uas.safari_iphone, visitor: visitorId2, ip: '1.2.3.4' },
      { path: '/produto/matriz-flores', full_url: 'http://localhost/produto/matriz-flores', title: 'Matriz Flores', ua: uas.safari_iphone, visitor: visitorId2, ip: '1.2.3.4' },
    ];

    for (const v of mockVisits) {
      const { browser, os, deviceType } = parseUserAgent(v.ua);
      const ipHash = getIpHash(v.ip);

      await dbAsync.run(`
        INSERT INTO site_visits (
          path, full_url, page_title, referrer, device_type, browser, os, ip_hash, visitor_id, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ...[
        v.path,
        v.full_url,
        v.title,
        'http://google.com',
        deviceType,
        browser,
        os,
        ipHash,
        v.visitor,
        v.ua
      ]);
      console.log(`Visita gravada: ${v.path} (${deviceType} - ${browser})`);
    }

    // 4. Testar queries de resumo
    console.log('\n4. Validando Queries de Analytics no Banco:');
    
    const total = await dbAsync.get('SELECT COUNT(*) as count FROM site_visits WHERE ip_hash = ?', getIpHash('1.2.3.4'));
    console.log('Total de visitas inseridas:', total.count);
    if (Number(total.count) !== 4) {
      throw new Error(`Esperava 4 visitas, mas obteve ${total.count}`);
    }

    const uniques = await dbAsync.get('SELECT COUNT(DISTINCT visitor_id) as count FROM site_visits WHERE ip_hash = ?', getIpHash('1.2.3.4'));
    console.log('Visitantes únicos:', uniques.count);
    if (Number(uniques.count) !== 2) {
      throw new Error(`Esperava 2 visitantes únicos, mas obteve ${uniques.count}`);
    }

    const topPages = await dbAsync.all(`
      SELECT path, COUNT(*) as count 
      FROM site_visits 
      WHERE ip_hash = ?
      GROUP BY path 
      ORDER BY count DESC
    `, getIpHash('1.2.3.4'));
    console.log('Rotas mais visitadas:', topPages);
    if (topPages[0].path !== '/loja' || Number(topPages[0].count) !== 2) {
      throw new Error('Falha no ranking de rotas mais visitadas');
    }

    const devices = await dbAsync.all(`
      SELECT device_type, COUNT(*) as count 
      FROM site_visits 
      WHERE ip_hash = ?
      GROUP BY device_type
    `, getIpHash('1.2.3.4'));
    console.log('Acessos por dispositivos:', devices);

    console.log('\n[OK] TODOS OS TESTES PASSARAM COM SUCESSO!');
  } catch (err) {
    console.error('\n[FALHA] Erro durante a execução dos testes:', err);
    process.exit(1);
  } finally {
    await dbAsync.dispose();
  }
}

test();
