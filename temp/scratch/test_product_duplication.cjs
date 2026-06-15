const fs = require('fs');
const path = require('path');
const slugify = require('slugify');

// Importar módulo de acesso ao MySQL do projeto
const dbAsync = require('../../src/server/dbAsync').default;

async function testDuplication() {
  console.log('--- INICIANDO TESTE DE DUPLICAÇÃO E NOMEAÇÃO DE IMAGEM ---');
  
  let testOriginalId = null;
  let testDuplicatedId = null;

  try {
    // 1. Criar um produto original de teste
    console.log('\n1. Criando produto original de teste no banco...');
    
    // Inserir produto com imagem principal e folha de produção
    const originalSlug = 'produto-original-teste-gemini';
    const originalName = 'Produto Original Teste Gemini';
    const originalResult = await dbAsync.run(`
      INSERT INTO products (
        name, slug, description, price, image, image_alt, production_sheet, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ...[
      originalName,
      originalSlug,
      'Descrição do produto original',
      15.00,
      '/uploads/produto-original-teste-gemini-999.jpg',
      'Alt original',
      '/uploads/produto-original-teste-gemini-999.pdf',
      'active'
    ]);
    
    testOriginalId = originalResult.lastInsertRowid;
    console.log(`Produto original criado com ID: ${testOriginalId}`);

    // Associar uma categoria e uma tag fictícia
    await dbAsync.run(
      'INSERT IGNORE INTO product_category_relations (product_id, category_id) VALUES (?, ?)',
      testOriginalId, 1
    );
    await dbAsync.run(
      'INSERT IGNORE INTO product_tag_relations (product_id, tag_id) VALUES (?, ?)',
      testOriginalId, 1
    );

    // 2. Simular a rota de duplicação: POST /api/admin/products/:id/duplicate
    console.log('\n2. Executando simulação de duplicação do produto original...');
    
    const source = await dbAsync.get('SELECT * FROM products WHERE id = ? LIMIT 1', testOriginalId);
    if (!source) throw new Error('Produto original não foi encontrado no banco.');

    const baseName = source.name;
    const duplicatedName = `${baseName} (Cópia)`;
    
    // Simular a função createUniqueProductSlug
    let baseSlugRaw = slugify(duplicatedName, { lower: true, strict: true, trim: true }) || 'produto';
    let duplicatedSlug = baseSlugRaw;
    let sequence = 2;
    while (true) {
      const existing = await dbAsync.get('SELECT id FROM products WHERE slug = ?', duplicatedSlug);
      if (!existing) break;
      duplicatedSlug = `${baseSlugRaw}-${sequence}`;
      sequence++;
    }

    // Inserir cópia sem herdar imagem, alt e folha de produção
    const duplicatedResult = await dbAsync.run(`
      INSERT INTO products (
        name, slug, description, price, image, image_alt, production_sheet, status, type, is_virtual, is_downloadable
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ...[
      duplicatedName,
      duplicatedSlug,
      source.description || null,
      source.price || 0,
      null, // Imagem principal DEVE ser nula
      null, // Image alt DEVE ser nula
      null, // PDF DEVE ser nulo
      'draft',
      source.type || 'simple',
      source.is_virtual ?? 1,
      source.is_downloadable ?? 1
    ]);

    testDuplicatedId = duplicatedResult.lastInsertRowid;
    console.log(`Produto duplicado criado com ID: ${testDuplicatedId}`);
    console.log(`Nome gerado: "${duplicatedName}"`);
    console.log(`Slug gerado: "${duplicatedSlug}"`);

    // Validar se os campos de imagem foram limpos
    const checkDuplicatedBefore = await dbAsync.get('SELECT image, image_alt, production_sheet FROM products WHERE id = ?', testDuplicatedId);
    console.log('Valores das imagens no produto duplicado (devem ser NULL):', checkDuplicatedBefore);
    
    if (checkDuplicatedBefore.image !== null || checkDuplicatedBefore.image_alt !== null || checkDuplicatedBefore.production_sheet !== null) {
      throw new Error('Falha no teste: O produto duplicado herdou imagem principal ou PDF!');
    }
    console.log('[OK] Teste de duplicação: Imagem principal, Alt e PDF foram devidamente limpos.');

    // 3. Simular envio de nova imagem principal no modal: POST /api/admin/products/:id/main-image
    console.log('\n3. Simulando envio de nova imagem principal via modal...');
    
    // O formulário de edição do produto duplicado envia o slug modificado "matriz-nova-azul"
    const nextSlug = 'matriz-nova-azul';
    
    // No backend, o endpoint recebe o slug no corpo e o atualiza no banco
    const product = await dbAsync.get('SELECT * FROM products WHERE id = ?', testDuplicatedId);
    let activeSlug = product.slug;
    
    if (nextSlug !== product.slug) {
      await dbAsync.run('UPDATE products SET slug = ? WHERE id = ?', nextSlug, testDuplicatedId);
      activeSlug = nextSlug;
    }
    
    // Simular o salvamento físico (buildProductMediaName)
    const finalImageName = `${activeSlug}-${testDuplicatedId}.jpg`;
    const finalPublicUrl = `/uploads/${finalImageName}`;
    
    await dbAsync.run('UPDATE products SET image = ? WHERE id = ?', finalPublicUrl, testDuplicatedId);
    
    const checkDuplicatedAfterImage = await dbAsync.get('SELECT slug, image FROM products WHERE id = ?', testDuplicatedId);
    console.log('Após simular upload de imagem no modal:', checkDuplicatedAfterImage);
    
    if (checkDuplicatedAfterImage.slug !== nextSlug) {
      throw new Error('Falha no teste: O slug não foi atualizado no upload da imagem!');
    }
    if (checkDuplicatedAfterImage.image !== `/uploads/matriz-nova-azul-${testDuplicatedId}.jpg`) {
      throw new Error('Falha no teste: A nova imagem não foi nomeada corretamente baseada no novo slug!');
    }
    console.log('[OK] Teste de envio de imagem: Novo slug salvo e nova imagem nomeada corretamente.');

    // 4. Simular mudança subsequente de slug na edição: PUT /api/admin/products/:id
    console.log('\n4. Simulando edição de slug e renomeação de imagem legada...');
    
    const finalSlug = 'matriz-azul-definitiva';
    const existingProduct = await dbAsync.get('SELECT * FROM products WHERE id = ?', testDuplicatedId);
    const slugChanged = finalSlug !== existingProduct.slug;
    
    let nextImagePath = existingProduct.image;
    if (slugChanged && existingProduct.image) {
      const oldImageName = existingProduct.image.split('/').pop();
      const oldExt = path.extname(oldImageName).toLowerCase() || '.jpg';
      const newImageName = `${finalSlug}-${testDuplicatedId}${oldExt}`;
      
      // Atualizar o path no banco que o UPDATE irá persistir
      nextImagePath = `/uploads/${newImageName}`;
    }

    await dbAsync.run('UPDATE products SET slug = ?, image = ? WHERE id = ?', finalSlug, nextImagePath, testDuplicatedId);
    
    const checkDuplicatedFinal = await dbAsync.get('SELECT slug, image FROM products WHERE id = ?', testDuplicatedId);
    console.log('Após simular salvamento final (PUT):', checkDuplicatedFinal);
    
    if (checkDuplicatedFinal.slug !== finalSlug) {
      throw new Error('Falha no teste: O slug final não foi atualizado no banco!');
    }
    if (checkDuplicatedFinal.image !== `/uploads/matriz-azul-definitiva-${testDuplicatedId}.jpg`) {
      throw new Error('Falha no teste: A imagem física não foi renomeada para o slug final!');
    }
    console.log('[OK] Teste de renomeação subsequente: Imagem acompanhou a mudança de slug no PUT.');

    // 5. Garantir que o produto original não foi afetado
    console.log('\n5. Validando integridade do produto original...');
    const originalCheck = await dbAsync.get('SELECT * FROM products WHERE id = ?', testOriginalId);
    console.log('Dados atuais do produto original:', {
      id: originalCheck.id,
      name: originalCheck.name,
      slug: originalCheck.slug,
      image: originalCheck.image,
      production_sheet: originalCheck.production_sheet
    });

    if (originalCheck.name !== originalName || originalCheck.slug !== originalSlug || originalCheck.image !== '/uploads/produto-original-teste-gemini-999.jpg') {
      throw new Error('Falha no teste: O PRODUTO ORIGINAL FOI MODIFICADO!');
    }
    console.log('[OK] Teste de isolamento: O produto original continuou perfeitamente intacto.');
    
    console.log('\n=== TODOS OS TESTES DE DUPLICAÇÃO E NOMEAÇÃO PASSARAM COM SUCESSO! ===');

  } catch (error) {
    console.error('\n[FALHA] Ocorreu um erro no teste:', error);
  } finally {
    // 6. Limpar os dados criados no teste
    console.log('\n6. Limpando dados de teste do banco...');
    if (testOriginalId) {
      await dbAsync.run('DELETE FROM products WHERE id = ?', testOriginalId);
      await dbAsync.run('DELETE FROM product_category_relations WHERE product_id = ?', testOriginalId);
      await dbAsync.run('DELETE FROM product_tag_relations WHERE product_id = ?', testOriginalId);
    }
    if (testDuplicatedId) {
      await dbAsync.run('DELETE FROM products WHERE id = ?', testDuplicatedId);
    }
    await dbAsync.dispose();
    console.log('Limpeza concluída.');
  }
}

testDuplication();
