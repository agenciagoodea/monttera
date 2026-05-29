import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { 
  ChevronLeft, ChevronRight, FileText, ShoppingCart, Zap, Check, 
  Star, Info, Package, Hash, Palette, AlertTriangle, DownloadCloud, 
  Heart, User, Send, Search, X, ChevronDown, Sparkles
} from 'lucide-react';
import { Product, ProductGalleryImage } from '../../types';
import { formatCurrency, getPublicAssetUrl, normalizePublicMediaUrl } from '../../lib/utils';
import { useCart } from '../../contexts/CartContext';
import { useFavorites } from '../../contexts/FavoritesContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface Review {
  id: number;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export default function MobileProductDetail() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { settings } = useAppData();
  const { user } = useAuth();
  const { addToCart, items } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  
  // Accordion state
  const [openSection, setOpenSection] = useState<'desc' | 'specs' | 'reviews' | null>(null);
  
  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const redirectToCheckout = String(settings.redirect_to_checkout_after_add_to_cart || 'false') === 'true';

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
        const normalizedProduct = {
          ...data,
          image: getPublicAssetUrl(data?.image),
          production_sheet: getPublicAssetUrl(data?.production_sheet),
          gallery: Array.isArray(data?.gallery)
            ? data.gallery
                .map((img: any) => ({
                  id: Number(img?.id || 0),
                  product_id: Number(img?.product_id || 0),
                  url: String(img?.url || '').trim(),
                  full_url: getPublicAssetUrl(String(img?.full_url || img?.url || '')),
                  alt_text: String(img?.alt_text || '').trim(),
                  is_featured: img?.is_featured ?? 0,
                  created_at: img?.created_at ?? null,
                  file_type: img?.file_type ?? null,
                }))
                .filter((img: ProductGalleryImage) => Boolean(img.full_url))
            : [],
          relatedProducts: Array.isArray(data?.relatedProducts)
            ? data.relatedProducts.map((item: any) => ({ ...item, image: normalizePublicMediaUrl(item?.image) }))
            : [],
        };
        
        setProduct(normalizedProduct);
        const initialGallery = Array.from(
          new Set(
            [
              normalizedProduct.image,
              ...((normalizedProduct.gallery || []).map((img: ProductGalleryImage) => img.url)),
            ]
              .filter(Boolean)
              .map((path: string) => getPublicAssetUrl(path)),
          ),
        );
        setGalleryImages(initialGallery);
        setActiveImageIndex(0);
        setFailedImages({});
        
        // Fetch reviews
        fetchReviews(slug);
      } catch (error) {
        console.error('Failed to fetch product for mobile details:', error);
        setProduct(null);
      } finally {
        window.scrollTo(0, 0);
        setLoading(false);
      }
    }

    fetchProduct();
  }, [slug]);

  async function fetchReviews(productSlug: string) {
    try {
      const res = await fetch(`/api/reviews?slug=${productSlug}`);
      if (!res.ok) {
        // Fallback para rota clássica
        const fallbackRes = await fetch(`/api/products/${productSlug}/reviews`);
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          setReviews(data.reviews || []);
          setAvgRating(data.avgRating || 0);
        }
        return;
      }
      const data = await res.json();
      setReviews(data.reviews || []);
      setAvgRating(data.avgRating || 0);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    }
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !newComment.trim()) return;

    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/products/${product.slug}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating, comment: newComment }),
        credentials: 'include',
      });

      if (res.ok) {
        setNewComment('');
        setNewRating(5);
        fetchReviews(product.slug);
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao enviar avaliação. Você precisa estar logado.');
      }
    } catch (error) {
      console.error('Failed to submit review:', error);
      alert('Erro de conexão ao enviar avaliação.');
    } finally {
      setSubmittingReview(false);
    }
  }

  const relatedProducts = product?.relatedProducts || [];
  const discount = product?.sale_price && product?.price ? Math.round((1 - product.sale_price / product.price) * 100) : 0;
  const currentPrice = product ? (product.sale_price || product.price) : 0;
  const isInCart = product ? items.some((item) => item.product_id === product.id) : false;
  const isProductFavorite = product ? isFavorite(product.id) : false;

  const hasStitchCount = useMemo(() => {
    const sc = String(product?.stitch_count ?? '').trim().toLowerCase();
    return sc !== '' && sc !== '-' && sc !== '0' && sc !== 'n/a' && sc !== 'não informado' && sc !== 'nao informado' && sc !== 'undefined' && sc !== 'null';
  }, [product?.stitch_count]);

  const productionSheetHref = (() => {
    const value = normalizePublicMediaUrl(product?.production_sheet || '');
    if (!value || value === '#' || value.toLowerCase() === 'null' || value.toLowerCase() === 'undefined') return '';
    return value;
  })();

  const formatShortDescription = (html: unknown) => {
    let formatted = String(html || '');
    formatted = formatted.replace(/(Tamanhos?\s+dispon(?:[ií]vel(?:is)?|[ií]veis?)(?:\s+por\s+matriz)?\s*:\s*)/i, '$1<br/>');
    formatted = formatted.replace(/(►\s*Tamanhos?\s+dispon(?:[ií]vel(?:is)?|[ií]veis?)(?:\s+por\s+matriz)?\s*:\s*)(?=\d)/i, '$1<br/>');
    formatted = formatted.replace(/(\/Pontos:\s*\d+)\s+(?=\d{1,2}(?:[.,]\d+)?cm)/gi, '$1<br/>');
    return formatted;
  };

  const siteDisplayName = String(settings?.site_name || 'Digital Bordados').trim();
  const resolveProductTemplate = (value: unknown) => {
    const template = String(value ?? '');
    const map: Record<string, string> = {
      'site_nome': siteDisplayName,
      'site_name': siteDisplayName,
      'nome_produto': String(product?.name || '').trim(),
      'slug_produto': String(product?.slug || '').trim(),
      'preco': String(product?.price ?? '').trim(),
      'preco_promocional': String(product?.sale_price ?? product?.price ?? '').trim(),
      'pontos': String(product?.stitch_count ?? '').trim(),
      'cores': String(product?.colors || '').trim(),
      'categoria_principal': String(product?.category_name || '').trim(),
    };
    return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) => {
      const cleanKey = key.toLowerCase();
      return map[cleanKey] ?? match;
    });
  };

  const toggleSection = (section: 'desc' | 'specs' | 'reviews') => {
    setOpenSection(openSection === section ? null : section);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse pb-24">
        <div className="h-6 w-32 bg-slate-100 rounded-xl" />
        <div className="aspect-square bg-slate-100 rounded-[2.5rem]" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 bg-slate-100 rounded-xl" />
          <div className="h-5 w-1/4 bg-slate-100 rounded-xl" />
          <div className="h-24 w-full bg-slate-100 rounded-[2rem]" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20 px-6">
        <Package className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <h1 className="text-xl font-black text-slate-800 uppercase mb-4">Matriz não encontrada</h1>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg">
          <ChevronLeft className="w-4 h-4" />
          Voltar ao Início
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-28 relative">
      
      {/* Botão Voltar Premium */}
      <div className="flex items-center">
        <button 
          onClick={() => navigate(-1)} 
          className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-blue-600 active:scale-95 transition-all"
        >
          <ChevronLeft className="w-4 h-4 stroke-[3]" />
          Voltar
        </button>
      </div>

      {/* Galeria de Fotos Mobile Premium (Touch Snap-Scroll) */}
      <section className="relative bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <div className="aspect-square relative flex items-center justify-center bg-slate-50/50">
          
          {/* Marca D'água */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none grid grid-cols-3 grid-rows-3 rotate-12 scale-150 select-none">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="text-[9px] font-black uppercase text-slate-900 flex items-center justify-center">
                Digital Bordados
              </span>
            ))}
          </div>

          {/* Swipe Snap-Scroll Container */}
          <div 
            className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-none"
            onScroll={(e) => {
              const width = e.currentTarget.offsetWidth;
              const index = Math.round(e.currentTarget.scrollLeft / width);
              if (index !== activeImageIndex && galleryImages[index]) {
                setActiveImageIndex(index);
              }
            }}
          >
            {galleryImages.map((img, idx) => (
              <div 
                key={`${img}-${idx}`} 
                className="w-full h-full shrink-0 snap-start flex items-center justify-center relative bg-slate-50/20"
              >
                <img 
                  src={img} 
                  alt={`${product.name} - ${idx}`}
                  onError={() => setFailedImages(prev => ({ ...prev, [img]: true }))}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>

          {/* Badge de Desconto */}
          {discount > 0 && (
            <div className="absolute bottom-6 right-6 z-20 bg-red-600 text-white px-3.5 py-1.5 rounded-2xl text-[10px] font-black shadow-lg shadow-red-200">
              {discount}% OFF
            </div>
          )}

          {/* Lupa para Abrir Lightbox */}
          <button
            type="button"
            className="absolute top-6 right-6 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-500/20 border border-blue-500/10 active:scale-90 transition-transform"
            onClick={() => setIsLightboxOpen(true)}
          >
            <Search className="h-5 w-5 stroke-[2.5]" />
          </button>

          {/* Botão de Favoritar Rápido */}
          <button
            type="button"
            className={`absolute top-6 left-6 z-20 flex h-11 w-11 items-center justify-center rounded-full border shadow-xl transition-all active:scale-90 ${
              isProductFavorite
                ? 'bg-pink-500 border-pink-500 text-white shadow-pink-200'
                : 'bg-white border-slate-100 text-slate-400 shadow-slate-100'
            }`}
            onClick={() => toggleFavorite(product.id, product.name)}
          >
            <Heart className={`h-5 w-5 ${isProductFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Indicadores de Página (Dots) */}
        {galleryImages.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 px-3 py-1.5 bg-black/20 backdrop-blur-md rounded-full">
            {galleryImages.map((_, idx) => (
              <span 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeImageIndex === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </section>

      {/* Informações Básicas do Produto */}
      <section className="flex flex-col gap-3">
        {/* Avaliações rápidas & Categoria */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="flex text-amber-400">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(avgRating) ? 'fill-current' : 'text-slate-200'}`} />
              ))}
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase">({reviews.length} avaliações)</span>
          </div>

          <span className="text-[8px] font-black text-blue-600 uppercase bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md tracking-wider">
            {product.category_name || 'Geral'}
          </span>
        </div>

        {/* Nome do Produto */}
        <h1 className="text-xl font-black text-slate-800 leading-tight uppercase tracking-tight">
          {product.name}
        </h1>

        {/* Tag Flash Download imediato */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="flex items-center gap-2 p-3 bg-sky-50 border border-sky-100 rounded-2xl">
            <Zap className="w-4 h-4 text-sky-500 fill-sky-500" />
            <div className="min-w-0">
              <p className="text-[9px] font-black text-sky-900 uppercase leading-none">Instantâneo</p>
              <p className="text-[8px] font-bold text-sky-700 leading-none mt-0.5">Download imediato</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-100 rounded-2xl">
            <DownloadCloud className="w-4 h-4 text-violet-500" />
            <div className="min-w-0">
              <p className="text-[9px] font-black text-violet-900 uppercase leading-none">Arquivo Digital</p>
              <p className="text-[8px] font-bold text-violet-700 leading-none mt-0.5">Disponível em sua conta</p>
            </div>
          </div>
        </div>
      </section>

      {/* Características do Bordado (Pontos & Cores) */}
      {(hasStitchCount || (product.colors && String(product.colors).trim() !== '')) && (
        <section className="grid grid-cols-2 gap-3.5">
          {hasStitchCount && (
            <div className="p-4 bg-white border border-slate-100 rounded-[1.5rem] flex items-center gap-3">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                <Hash className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Pontos</p>
                <p className="text-xs font-black text-slate-800 leading-none mt-1">{product.stitch_count}</p>
              </div>
            </div>
          )}
          {product.colors && String(product.colors).trim() !== '' && (
            <div className="p-4 bg-white border border-slate-100 rounded-[1.5rem] flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-blue-500">
                <Palette className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Cores</p>
                <p className="text-xs font-black text-blue-600 leading-none mt-1">{product.colors}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Botão Folha de Produção PDF se disponível (Destaque Ativo) */}
      {productionSheetHref && (
        <section className="flex flex-col gap-2">
          <a
            href={productionSheetHref}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-red-500/10 active:scale-95 text-center"
          >
            <FileText className="w-4 h-4 fill-white/10" />
            Visualizar Folha de Produção (PDF)
          </a>
        </section>
      )}

      {/* Breve Descrição (Ativa e sempre visível) */}
      {product.short_description && (
        <section className="bg-white border border-slate-100 rounded-[2rem] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.01)] flex flex-col gap-2.5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-50 pb-2 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600" /> Breve Descrição
          </h3>
          <div 
            className="text-slate-600 text-[11px] font-bold leading-relaxed prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formatShortDescription(resolveProductTemplate(product.short_description)) }}
          />
        </section>
      )}

      {/* Especificações Adicionais em Acordeão Inteligente (Sanfona) */}
      <section className="flex flex-col bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.01)]">
        
        {/* Bloco 1: Descrição */}
        <div className="border-b border-slate-50">
          <button
            onClick={() => toggleSection('desc')}
            className="w-full px-6 py-5 flex items-center justify-between text-slate-800 font-black text-[10px] uppercase tracking-widest active:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Descrição do Produto
            </span>
            <ChevronDown 
              className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${
                openSection === 'desc' ? 'rotate-180 text-blue-600' : ''
              }`}
            />
          </button>
          
          <AnimatePresence initial={false}>
            {openSection === 'desc' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 pt-1 text-slate-500 text-xs leading-relaxed font-medium">
                  {product.description ? (
                    <div 
                      className="prose prose-slate max-w-none text-slate-600"
                      dangerouslySetInnerHTML={{ __html: resolveProductTemplate(product.description) }}
                    />
                  ) : (
                    <p className="text-slate-600">
                      Este produto consiste em um arquivo de bordado digital de alta qualidade, pronto e testado em bastidor, desenvolvido para ser utilizado em máquinas de bordar computadorizadas domésticas a industriais.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bloco 2: Formatos e Requisitos Técnicos */}
        <div className="border-b border-slate-50">
          <button
            onClick={() => toggleSection('specs')}
            className="w-full px-6 py-5 flex items-center justify-between text-slate-800 font-black text-[10px] uppercase tracking-widest active:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Especificações e Formatos
            </span>
            <ChevronDown 
              className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${
                openSection === 'specs' ? 'rotate-180 text-blue-600' : ''
              }`}
            />
          </button>

          <AnimatePresence initial={false}>
            {openSection === 'specs' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 pt-1 flex flex-col gap-4">
                  
                  {/* Formatos de Arquivo */}
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Formatos Disponíveis:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['PES', 'JEF', 'DST', 'EXP', 'XXX'].map(format => (
                        <span key={format} className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black text-slate-500">
                          {format}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Informações Importantes / Avisos */}
                  <div className="flex gap-2.5 p-3.5 bg-blue-50/50 border border-blue-100 rounded-2xl">
                    <Info className="w-4.5 h-4.5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-medium text-blue-800 leading-normal">
                      Atenção: Não recomendamos redimensionar as matrizes. Alterar as dimensões originais pode comprometer o tensionamento dos pontos e danificar a qualidade final do bordado.
                    </p>
                  </div>

                  <div className="flex gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-2xl">
                    <AlertTriangle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold text-red-600 leading-normal">
                      Não realizamos ajustes ou edições personalizadas nas matrizes após a compra. Atente-se à visualização do bordado e às medidas descritas acima.
                    </p>
                  </div>

                  {/* Botão Folha de Produção PDF se disponível */}
                  {productionSheetHref && (
                    <a
                      href={productionSheetHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 border-2 border-red-500 hover:bg-red-50 text-red-500 rounded-2xl flex items-center justify-center gap-2 font-black text-[9px] uppercase tracking-widest transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Visualizar PDF de Produção (Cores)
                    </a>
                  )}

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bloco 3: Avaliações dos Clientes */}
        <div>
          <button
            onClick={() => toggleSection('reviews')}
            className="w-full px-6 py-5 flex items-center justify-between text-slate-800 font-black text-[10px] uppercase tracking-widest active:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <Star className="w-4 h-4 text-blue-600" />
              Avaliações ({reviews.length})
            </span>
            <ChevronDown 
              className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${
                openSection === 'reviews' ? 'rotate-180 text-blue-600' : ''
              }`}
            />
          </button>

          <AnimatePresence initial={false}>
            {openSection === 'reviews' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 pt-1 flex flex-col gap-6">
                  
                  {/* Lista de Avaliações */}
                  <div className="flex flex-col gap-3">
                    {reviews.length > 0 ? (
                      reviews.map((rev) => (
                        <div key={rev.id} className="p-4 bg-slate-50 border border-slate-50 rounded-2xl flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <div className="w-6.5 h-6.5 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-400">
                                <User className="w-3.5 h-3.5" />
                              </div>
                              <p className="text-[10px] font-black text-slate-800 leading-none">{rev.user_name}</p>
                            </div>
                            <span className="text-[8px] font-bold text-slate-400">
                              {new Date(rev.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          
                          <div className="flex text-amber-400 -mt-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star key={s} className={`w-3 h-3 ${s <= rev.rating ? 'fill-current' : 'text-slate-200'}`} />
                            ))}
                          </div>
                          
                          <p className="text-slate-600 text-[10px] leading-relaxed italic">"{rev.comment}"</p>
                        </div>
                      ))
                    ) : (
                      <div className="py-6 text-center text-slate-400">
                        <Star className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-[9px] font-black uppercase tracking-wider">Ainda não há avaliações.</p>
                      </div>
                    )}
                  </div>

                  {/* Formulário de Envio se autenticado */}
                  <div className="pt-4 border-t border-slate-50">
                    <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Envie sua Avaliação:</h4>
                    <form onSubmit={handleSubmitReview} className="space-y-4">
                      <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Sua nota:</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setNewRating(star)}
                              className={`p-1 transition-all ${newRating >= star ? 'text-amber-400 scale-110' : 'text-slate-200'}`}
                            >
                              <Star className={`w-6 h-6 ${newRating >= star ? 'fill-current' : ''}`} />
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Comentário:</span>
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Digite seu comentário..."
                          className="w-full h-24 bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingReview || !newComment.trim()}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest transition-colors shadow-md shadow-blue-200 flex items-center justify-center gap-1.5"
                      >
                        {submittingReview ? 'Enviando...' : (
                          <>
                            <Send className="w-3 h-3" /> Enviar Nota
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </section>

      {/* Vitrine de Relacionados */}
      {relatedProducts.length > 0 && (
        <section className="flex flex-col gap-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-800">
              Quem viu este, também comprou
            </h3>
            <div className="h-0.5 bg-slate-50 flex-1 ml-4" />
          </div>

          <div className="flex gap-4 overflow-x-auto pb-3 px-1 -mx-4 px-4 scrollbar-none snap-x snap-mandatory">
            {relatedProducts.map((rel) => (
              <Link 
                key={rel.id} 
                to={`/produto/${rel.slug}`}
                className="group snap-start shrink-0 basis-[44%] bg-white border border-slate-100 rounded-[1.8rem] p-3 transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-square bg-slate-50 rounded-2xl overflow-hidden mb-3 relative border border-slate-50/50">
                    <img 
                      src={rel.image} 
                      alt={rel.name} 
                      loading="lazy" 
                      className="w-full h-full object-cover" 
                    />
                    {rel.sale_price && (
                      <div className="absolute bottom-2.5 right-2.5 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm">
                        {Math.round((1 - rel.sale_price / rel.price) * 100)}% OFF
                      </div>
                    )}
                  </div>
                  <h4 className="text-[10px] font-black text-slate-800 uppercase line-clamp-2 min-h-[28px] mb-2 leading-tight">
                    {rel.name}
                  </h4>
                </div>
                
                <div className="flex items-baseline gap-1 mt-auto">
                  <span className="text-[11px] font-black text-emerald-600">
                    {formatCurrency(rel.sale_price || rel.price)}
                  </span>
                  {rel.sale_price && (
                    <span className="text-[8px] text-slate-400 line-through font-bold">
                      {formatCurrency(rel.price)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Barra de Compra Flutuante Fixa no Bottom (Mobile Sticky CTA) */}
      <section className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-100/80 px-5 py-4 pb-5 flex items-center justify-between shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        
        {/* Bloco de Preços */}
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total à Vista</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-emerald-600 tracking-tight leading-none">
              {formatCurrency(currentPrice)}
            </span>
            {product.sale_price && (
              <span className="text-[10px] text-slate-400 line-through font-bold leading-none">
                {formatCurrency(product.price)}
              </span>
            )}
          </div>
        </div>

        {/* Botão Principal de Ação Comprar */}
        <button
          onClick={() => {
            addToCart(product);
            if (redirectToCheckout) {
              navigate('/carrinho');
            }
          }}
          disabled={isInCart}
          className={`flex items-center justify-center gap-2 px-7 h-13 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 border select-none ${
            isInCart
              ? 'bg-emerald-500 border-emerald-500 text-white shadow-emerald-100/50 cursor-default'
              : 'bg-blue-600 border-blue-600 text-white shadow-blue-500/10 hover:bg-blue-700'
          }`}
        >
          {isInCart ? (
            <>
              <Check className="w-4 h-4 stroke-[2.5]" /> Matriz Adicionada
            </>
          ) : (
            <>
              <ShoppingCart className="w-4 h-4 stroke-[2.5]" /> Comprar Agora
            </>
          )}
        </button>
      </section>

      {/* Lightbox Modal para Tela Cheia */}
      {isLightboxOpen && galleryImages.length > 0 && (
        <div 
          className="fixed inset-0 z-[80] bg-black/95 flex items-center justify-center p-4" 
          onClick={() => setIsLightboxOpen(false)}
        >
          {/* Botão Fechar */}
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-6 right-6 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-90"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* Botão Anterior */}
          {galleryImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
              }}
              className="absolute left-6 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-90"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}

          {/* Imagem Ampliada */}
          <img
            src={galleryImages[activeImageIndex]}
            alt={`${product.name} - ampliada`}
            className="max-h-[85vh] max-w-full object-contain rounded-xl select-none"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Botão Próximo */}
          {galleryImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImageIndex((prev) => (prev + 1) % galleryImages.length);
              }}
              className="absolute right-6 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 active:scale-90"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5]" />
            </button>
          )}

          {/* Contador de imagens */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-xs font-black tracking-widest">
            {activeImageIndex + 1} / {galleryImages.length}
          </div>
        </div>
      )}

    </div>
  );
}
