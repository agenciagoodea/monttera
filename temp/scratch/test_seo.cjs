const http = require('http');

function request(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 3000,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('=== INICIANDO AUDITORIA E TESTES DE INTEGRAÇÃO DE SEO ===\n');

  try {
    // 1. Validar Sitemap Index
    console.log('1. Testando Sitemap Index (/sitemap.xml)...');
    const sitemapIndex = await request('http://127.0.0.1:3000/sitemap.xml');
    console.log('   Status:', sitemapIndex.statusCode);
    console.log('   Content-Type:', sitemapitemapType = sitemapIndex.headers['content-type']);
    
    if (sitemapIndex.statusCode !== 200) {
      throw new Error(`Sitemap Index retornou status ${sitemapIndex.statusCode}`);
    }
    if (!sitemapIndex.body.includes('<sitemapindex') || !sitemapIndex.body.includes('/sitemap-products.xml')) {
      throw new Error('Estrutura do Sitemap Index incorreta ou faltando sitemaps filhos.');
    }
    console.log('   [OK] Sitemap Index validado!\n');

    // 2. Validar Sitemap de Produtos
    console.log('2. Testando Sitemap de Produtos (/sitemap-products.xml)...');
    const sitemapProd = await request('http://127.0.0.1:3000/sitemap-products.xml');
    console.log('   Status:', sitemapProd.statusCode);
    if (sitemapProd.statusCode !== 200) {
      throw new Error(`Sitemap de Produtos retornou status ${sitemapProd.statusCode}`);
    }
    if (!sitemapProd.body.includes('<urlset') || !sitemapProd.body.includes('/produto/')) {
      throw new Error('Sitemap de Produtos sem tags <urlset> ou sem produtos indexados.');
    }
    console.log('   [OK] Sitemap de Produtos validado!\n');

    // 3. Validar Sitemap de Imagens
    console.log('3. Testando Sitemap de Imagens (/sitemap-images.xml)...');
    const sitemapImg = await request('http://127.0.0.1:3000/sitemap-images.xml');
    console.log('   Status:', sitemapImg.statusCode);
    if (sitemapImg.statusCode !== 200) {
      throw new Error(`Sitemap de Imagens retornou status ${sitemapImg.statusCode}`);
    }
    if (!sitemapImg.body.includes('<image:image>') || !sitemapImg.body.includes('<image:loc>')) {
      throw new Error('Sitemap de Imagens sem o namespace <image:image> do Google.');
    }
    console.log('   [OK] Sitemap de Imagens validado!\n');

    // 4. Validar Feed do Google Merchant Center
    console.log('4. Testando Feed do Google Merchant Center (/google-merchant.xml)...');
    const feed = await request('http://127.0.0.1:3000/google-merchant.xml');
    console.log('   Status:', feed.statusCode);
    if (feed.statusCode !== 200) {
      throw new Error(`Feed do Merchant Center retornou status ${feed.statusCode}`);
    }
    if (!feed.body.includes('<rss') || !feed.body.includes('xmlns:g="http://base.google.com/ns/1.0"') || !feed.body.includes('<g:price>')) {
      throw new Error('Feed do Merchant Center incorreto ou sem namespace do Google Shopping.');
    }
    console.log('   [OK] Feed do Google Merchant Center / Shopping validado!\n');

    // 5. Validar Prerendering Dinâmico (Rota de Produto)
    console.log('5. Testando Prerendering de Produto (/produto/:slug)...');
    // Pegar o primeiro slug de produto do sitemap
    const match = sitemapProd.body.match(/<loc>(https?:\/\/[^/]+\/produto\/([^<]+))<\/loc>/);
    if (!match) {
      console.log('   Nenhum produto ativo encontrado no sitemap para testar injeção.');
    } else {
      const prodSlug = match[2];
      const prodUrlPath = `/produto/${prodSlug}`;
      console.log(`   Requisitando produto: ${prodUrlPath}`);
      
      const prodPage = await request(`http://127.0.0.1:3000${prodUrlPath}`);
      console.log('   Status:', prodPage.statusCode);
      
      if (prodPage.statusCode !== 200) {
        throw new Error(`Página de produto retornou status ${prodPage.statusCode}`);
      }
      
      if (!prodPage.body.includes('<title>') || !prodPage.body.includes('<meta name="description"')) {
        throw new Error('Página de produto renderizada sem tags meta básicas de SEO no head.');
      }
      
      if (!prodPage.body.includes('og:image') || !prodPage.body.includes('twitter:card')) {
        throw new Error('Página de produto renderizada sem tags Open Graph/Twitter Cards.');
      }

      if (!prodPage.body.includes('application/ld+json') || !prodPage.body.includes('"@type":"Product"') || !prodPage.body.includes('"@type":"BreadcrumbList"')) {
        throw new Error('Página de produto sem bloco JSON-LD ou sem schemas Product e BreadcrumbList.');
      }

      console.log('   [OK] Prerendering e Dados Estruturados (JSON-LD) validados com sucesso!');
    }

    console.log('\n[SUCESSO] TODOS OS TESTES SEO PASSARAM COM 100% DE CONFORMIDADE!');
    process.exit(0);
  } catch (error) {
    console.error('\n[FALHA] Falha na auditoria de integração:', error.message || error);
    process.exit(1);
  }
}

runTests();
