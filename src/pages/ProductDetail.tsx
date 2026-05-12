import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, FileText, ShoppingCart, Bolt, Check, Star, Info, Package, Hash, Palette, AlertTriangle, DownloadCloud, Heart } from 'lucide-react';
import { Product } from '../types';
import { formatCurrency } from '../lib/utils';
import { useCart } from '../contexts/CartContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function ProductDetail() {
  const { slug } = useParams();
  const { addToCart, items } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'description' | 'reviews'>('description');

  useEffect(() => {
    async function fetchProduct() {
      if (!slug) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${slug}`);
        if (!res.ok) {
          setProduct(null);
          return;
        }
        const data = await res.json();
        setProduct(data);
        setActiveImage(data.image || data.gallery?.[0] || null);
      } catch (error) {
        console.error('Failed to fetch product:', error);
        setProduct(null);
      } finally {
        window.scrollTo(0, 0);
        setLoading(false);
      }
    }

    fetchProduct();
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto px-6 py-12 animate-pulse">
        <div className="h-6 w-32 bg-slate-100 rounded mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-4">
            <div className="aspect-square bg-slate-100 rounded-3xl" />
            <div className="grid grid-cols-4 gap-4">
              <div className="aspect-square bg-slate-100 rounded-xl" />
              <div className="aspect-square bg-slate-100 rounded-xl" />
              <div className="aspect-square bg-slate-100 rounded-xl" />
              <div className="aspect-square bg-slate-100 rounded-xl" />
            </div>
          </div>
          <div className="space-y-6">
            <div className="h-10 w-3/4 bg-slate-100 rounded" />
            <div className="h-6 w-1/4 bg-slate-100 rounded" />
            <div className="h-32 w-full bg-slate-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-[1280px] mx-auto px-6 py-20 text-center">
        <Package className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <h1 className="text-2xl font-black text-slate-800 uppercase mb-4">Matriz nÃ£o encontrada</h1>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Voltar para a loja
        </Link>
      </div>
    );
  }

  const isInCart = items.some((item) => item.product_id === product.id);
  const isProductFavorite = isFavorite(product.id);
  const currentPrice = product.sale_price || product.price;
  const discount = product.sale_price ? Math.round((1 - product.sale_price / product.price) * 100) : 0;
  const gallery = Array.from(
    new Set([product.image, ...(product.gallery || [])].filter((img): img is string => Boolean(img)))
  );
  const formatShortDescription = (html: string) => {
    let formatted = html || '';

    // Garante quebra de linha logo após o título "Tamanho(s) disponível(is)"
    formatted = formatted.replace(
      /(Tamanhos?\s+dispon(?:[ií]vel(?:is)?|[ií]veis?)(?:\s+por\s+matriz)?\s*:\s*)/i,
      '$1<br/>',
    );

    // Força quebra imediatamente após ":" quando vier seguido da primeira medida na mesma linha
    formatted = formatted.replace(
      /(►\s*Tamanhos?\s+dispon(?:[ií]vel(?:is)?|[ií]veis?)(?:\s+por\s+matriz)?\s*:\s*)(?=\d)/i,
      '$1<br/>',
    );

    // Garante uma medida por linha no bloco azul (quebra após "/Pontos:xxxx")
    formatted = formatted.replace(
      /(\/Pontos:\s*\d+)\s+(?=\d{1,2}(?:[.,]\d+)?cm)/gi,
      '$1<br/>',
    );

    return formatted;
  };

  return (
    <main className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 w-full">
      {/* Header / Breadcrumb */}
      <div className="flex items-center mb-8">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Voltar para a vitrine
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
        {/* Left: Image & Gallery */}
        <div className="space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="relative bg-white border border-slate-100 rounded-[40px] overflow-hidden group shadow-xl shadow-slate-200/50"
          >
            <div className="aspect-square relative flex items-center justify-center p-8 bg-slate-50/50">
              {/* Watermark Pattern */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none grid grid-cols-4 grid-rows-4 rotate-12 scale-150 select-none">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span key={i} className="text-[10px] font-black uppercase text-slate-900 flex items-center justify-center">
                    Digital Bordados
                  </span>
                ))}
              </div>
              
              <AnimatePresence mode="wait">
                <motion.img 
                  key={activeImage}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.3 }}
                  src={activeImage || product.image} 
                  alt={product.name} 
                  className="w-full h-full object-contain relative z-10 drop-shadow-2xl" 
                />
              </AnimatePresence>
              
              {discount > 0 && (
                <div className="absolute top-8 left-8 z-20 bg-emerald-500 text-white px-4 py-1.5 rounded-full text-sm font-black shadow-lg">
                  {discount}% OFF
                </div>
              )}
            </div>
            
            <div className="p-4 bg-white border-t border-slate-50 flex items-center justify-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria:</span>
              <Link to={`/?category=${product.category_slug}`} className="text-[10px] font-black text-blue-600 hover:underline uppercase tracking-widest">
                {product.category_name || 'Geral'}
              </Link>
            </div>
          </motion.div>

          {/* Gallery Thumbnails */}
          {gallery.length > 1 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-4 sm:grid-cols-5 gap-4"
            >
              {gallery.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(img)}
                  className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                    activeImage === img ? 'border-blue-600 shadow-lg shadow-blue-100 scale-95' : 'border-slate-100 hover:border-slate-300'
                  }`}
                >
                  <img src={img} alt={`${product.name} - ${idx}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Right: Info */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col"
        >
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 leading-[1.1] mb-4">
            {product.name}
          </h1>

          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div className="flex flex-wrap items-center gap-3">
              {product.production_sheet && (
                <a
                  href={product.production_sheet}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-2 px-5 py-2.5 bg-white border-2 border-red-500 text-red-500 rounded-xl font-bold text-sm hover:bg-red-50 hover:shadow-sm transition-all"
                >
                  <FileText className="w-4 h-4" />
                  Folha de Produção
                </a>
              )}

              <button
                onClick={() => toggleFavorite(product.id, product.name)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all border-2 ${
                  isProductFavorite
                    ? 'border-pink-500 bg-pink-50 text-pink-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-pink-300 hover:text-pink-600'
                }`}
              >
                <Heart className={`w-4 h-4 ${isProductFavorite ? 'fill-current' : ''}`} />
                {isProductFavorite ? 'Nos Favoritos' : 'Favoritar'}
              </button>
            </div>

            <div className="flex flex-col md:items-end">
              {product.sale_price && (
                <span className="text-base text-slate-400 line-through font-bold">{formatCurrency(product.price)}</span>
              )}
              <span className="text-4xl font-black text-emerald-600 tracking-tight">
                {formatCurrency(currentPrice)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Flash Info */}
            <div className="flex items-center gap-3 p-4 bg-sky-50 border border-sky-100 rounded-2xl">
              <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-sky-200">
                <Bolt className="w-5 h-5 fill-current" />
              </div>
              <div>
                <p className="text-sm font-black text-sky-900 uppercase tracking-wide">Flash</p>
                <p className="text-xs font-bold text-sky-700">Produto pronto e download imediato</p>
              </div>
            </div>

            {/* Produto Digital */}
            <div className="flex items-center gap-3 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
              <div className="w-10 h-10 bg-violet-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-violet-200">
                <DownloadCloud className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-black text-violet-900 uppercase tracking-wide">Produto Digital</p>
                <p className="text-xs font-bold text-violet-700">Liberado automaticamente após pagamento.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-1 text-slate-500">
                <Hash className="w-4 h-4" />
                <p className="text-[11px] font-bold uppercase tracking-widest">Pontos</p>
              </div>
              <p className="text-base font-black text-slate-800">{product.stitch_count ?? '-'}</p>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-2xl">
              <div className="flex items-center gap-2 mb-1 text-slate-500">
                <Palette className="w-4 h-4" />
                <p className="text-[11px] font-bold uppercase tracking-widest">Cores</p>
              </div>
              <p className="text-base font-black text-blue-700">{product.colors || '1'}</p>
            </div>
          </div>
          {product.short_description && (
            <div 
              className="text-slate-500 text-sm font-medium mb-6 prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: formatShortDescription(product.short_description) }}
            />
          )}

          <div className="mb-6">
            <p className="text-sm font-bold text-slate-700 mb-3">Formatos incluídos:</p>
            <div className="flex flex-wrap gap-2">
              {['PES', 'JEF', 'DST', 'EXP', 'XXX'].map(format => (
                <span key={format} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 shadow-sm">
                  {format}
                </span>
              ))}
            </div>
          </div>

          {/* Warning Box */}
          <div className="mb-8 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[11px] font-medium text-blue-800 leading-relaxed">
              Obs: Ao fazer o download, não recomendamos que altere o tamanho original, poderá estragar a peça ocasionando que o bordado fique com pontos pesados ou folgados danificando a matriz.
            </p>
          </div>

          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-2xl flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[12px] font-bold text-red-600 leading-relaxed">
              Não fazemos alteração de tamanho e edições nas matrizes, fique atento nos detalhes da imagem e tamanho deste produto na descrição. Clicando no PDF do ícone acima você pode ter mais detalhes de cores e demais informações desta matriz.
            </p>
          </div>

          <button
            onClick={() => addToCart(product)}
            disabled={isInCart}
            className={`w-full md:w-auto min-w-[280px] h-16 rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest transition-all shadow-xl ${
              isInCart
                ? 'bg-emerald-500 text-white cursor-default'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 active:scale-95'
            }`}
          >
            {isInCart ? <Check className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
            {isInCart ? 'Adicionado' : 'Comprar Agora'}
          </button>
        </motion.div>
      </div>

      {/* Tabs Section */}
      <section className="mt-16 border-t border-slate-100 pt-16">
        <div className="flex gap-4 mb-10">
          <button 
            onClick={() => setActiveTab('description')}
            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              activeTab === 'description' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            DescriÃ§Ã£o
          </button>
          <button 
            onClick={() => setActiveTab('reviews')}
            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              activeTab === 'reviews' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            AvaliaÃ§Ãµes (0)
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'description' ? (
            <motion.div 
              key="desc"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="prose prose-slate max-w-none"
            >
              <div className="bg-white border border-slate-100 rounded-3xl p-8 md:p-12 shadow-sm">
                {product.description ? (
                  <div 
                    className="text-slate-600 leading-loose text-base prose prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: product.description }}
                  />
                ) : (
                  <p className="text-slate-600 leading-loose text-base">
                    Este produto consiste em um arquivo de bordado digital, desenvolvida para ser utilizada em mÃ¡quinas de bordar computadorizadas desde domÃ©sticas a industriais.
                  </p>
                )}
                
                {!product.description && (
                  <div className="mt-8 space-y-4 text-slate-500 text-sm">
                    <p>ApÃ³s a compra, o arquivo estarÃ¡ disponÃ­vel em sua Ã¡rea de cliente para download imediato em atÃ© cinco formatos diferentes, compatÃ­veis com diversas marcas de mÃ¡quinas de bordado, conforme listados abaixo.</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>PES (Deco, Brother, Babylock)</li>
                      <li>JEF (Janome, Elna, Kenmore)</li>
                      <li>DST (Tajima)</li>
                      <li>EXP (Melco)</li>
                      <li>XXX (Compucon)</li>
                    </ul>
                    <p className="text-red-500 font-bold mt-6 italic">
                      â€¢ NÃ£o fazemos alteraÃ§Ã£o de tamanho e ediÃ§Ãµes nas matrizes, fique atento nos detalhes da imagem e tamanho desta produto na descriÃ§Ã£o.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="rev"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white border border-slate-100 rounded-3xl p-12 text-center"
            >
              <Star className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <h3 className="text-lg font-black text-slate-800 uppercase mb-2">Sem avaliaÃ§Ãµes ainda</h3>
              <p className="text-slate-500 text-sm">Seja o primeiro a avaliar "{product.name}"</p>
              <button className="mt-8 px-6 py-2 border-2 border-blue-600 text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-colors">
                Deixar minha opiniÃ£o
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Related Products */}
      {product.relatedProducts && product.relatedProducts.length > 0 && (
        <section className="mt-24">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Produtos Relacionados</h2>
            <div className="h-1 flex-1 bg-slate-100 ml-8" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {product.relatedProducts.map((rel) => (
              <Link 
                key={rel.id} 
                to={`/produto/${rel.slug}`}
                className="group bg-white border border-slate-100 rounded-3xl p-4 transition-all hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1"
              >
                <div className="aspect-square bg-slate-50 rounded-2xl overflow-hidden mb-4 p-4 relative">
                  <img src={rel.image} alt={rel.name} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" />
                  {rel.sale_price && (
                    <div className="absolute top-3 right-3 bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-full uppercase">
                      {Math.round((1 - rel.sale_price / rel.price) * 100)}% OFF
                    </div>
                  )}
                </div>
                <h3 className="text-xs font-black text-slate-800 uppercase line-clamp-2 mb-2 min-h-[32px]">{rel.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-emerald-600">{formatCurrency(rel.sale_price || rel.price)}</span>
                  {rel.sale_price && (
                    <span className="text-[10px] text-slate-400 line-through font-bold">{formatCurrency(rel.price)}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}


