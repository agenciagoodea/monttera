import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  Upload, 
  X, 
  Plus, 
  Image as ImageIcon,
  FileCode,
  Globe,
  Settings,
  Tag,
  ChevronDown,
    Hash,
  Palette,
  Eye,
  Check
} from 'lucide-react';
import HtmlRichEditor from '../../components/admin/HtmlRichEditor';
import { getPublicAssetUrl, normalizePublicMediaUrl } from '../../lib/utils';

interface Category {
  id: number;
  name: string;
  parent_id?: number | null;
  product_count?: number;
}

interface TagType {
  id: number;
  name: string;
  usage_count?: number;
}

interface DownloadableFile {
  file_name: string;
  file_path: string;
  file_type?: string;
}

type SeoFieldKey = 'seo_title' | 'seo_description' | 'seo_keywords' | 'canonical_url' | 'main_image_alt' | 'gallery_alt';

export default function AdminProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableTags, setAvailableTags] = useState<TagType[]>([]);
  const [topUsedTags, setTopUsedTags] = useState<TagType[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [categoryTab, setCategoryTab] = useState<'all' | 'top'>('all');
  const [tagInput, setTagInput] = useState('');
  const [showTopTags, setShowTopTags] = useState(false);
  const [tagsBusy, setTagsBusy] = useState(false);
  const [showQuickCategoryForm, setShowQuickCategoryForm] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState('');
  const [quickCategoryParentId, setQuickCategoryParentId] = useState('');
  const [quickCategoryBusy, setQuickCategoryBusy] = useState(false);
  const [syncingMercadoPago, setSyncingMercadoPago] = useState(false);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [loadingSyncLogs, setLoadingSyncLogs] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState('');
  const [activeSeoField, setActiveSeoField] = useState<SeoFieldKey>('seo_title');
  const seoTitleInputRef = useRef<HTMLInputElement | null>(null);
  const seoDescriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const seoKeywordsInputRef = useRef<HTMLInputElement | null>(null);
  const canonicalInputRef = useRef<HTMLInputElement | null>(null);
  const mainImageAltInputRef = useRef<HTMLInputElement | null>(null);
  const [activeGalleryAltIndex, setActiveGalleryAltIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    short_description: '',
    description: '',
    price: '',
    sale_price: '',
    category_id: '',
    stitch_count: '',
    colors: '',
    is_featured: false,
    is_new: true,
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    canonical_url: '',
    noindex: false,
  });

  const [mainImage, setMainImage] = useState<File | null>(null);
  const [mainImageAlt, setMainImageAlt] = useState('');
  const [gallery, setGallery] = useState<File[]>([]);
  const [existingGalleryAlts, setExistingGalleryAlts] = useState<string[]>([]);
  const [newGalleryAlts, setNewGalleryAlts] = useState<string[]>([]);
  const [productionFiles, setProductionFiles] = useState<File[]>([]);
  const [productionSheetUrl, setProductionSheetUrl] = useState('');
  const [productionSheetFile, setProductionSheetFile] = useState<File | null>(null);
  const [downloadableFiles, setDownloadableFiles] = useState<DownloadableFile[]>([]);
  const [previews, setPreviews] = useState<{main: string, gallery: string[]}>({ main: '', gallery: [] });
  const [existingGalleryUrls, setExistingGalleryUrls] = useState<string[]>([]);
  const [isMainImageModalOpen, setIsMainImageModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'gallery' | 'upload'>('gallery');
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string | null>(null);
  const [serverImages, setServerImages] = useState<string[]>([]);
  const [loadingServerImages, setLoadingServerImages] = useState(false);
  const [modalUploadLoading, setModalUploadLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const productionSheetFileName = productionSheetFile?.name || (() => {
    const raw = (productionSheetUrl || '').trim();
    if (!raw) return '';
    const withoutQuery = raw.split('?')[0].split('#')[0];
    const parts = withoutQuery.split('/');
    return parts[parts.length - 1] || '';
  })();

  // Função reutilizável para carregar dados de um produto existente
  const loadProductData = async (productId: string) => {
    const prodRes = await fetch(`/api/admin/products/${productId}`, { credentials: 'include' });
    const prod = await prodRes.json();
    setFormData(() => ({
      name: prod.name,
      slug: prod.slug || '',
      short_description: prod.short_description || '',
      description: prod.description || '',
      price: prod.price.toString(),
      sale_price: prod.sale_price?.toString() || '',
      category_id: prod.category_id?.toString() || '',
      stitch_count: prod.stitch_count?.toString() || '',
      colors: prod.colors || '',
      is_featured: !!prod.is_featured,
      is_new: !!prod.is_new,
      seo_title: prod.seo_title || '',
      seo_description: prod.seo_description || '',
      seo_keywords: prod.seo_keywords || '',
      canonical_url: prod.canonical_url || '',
      noindex: !!prod.noindex,
    }));
    const existingCategoryIds = Array.isArray(prod.category_ids) && prod.category_ids.length > 0
      ? prod.category_ids
      : (prod.category_id ? [prod.category_id] : []);
    setSelectedCategoryIds(existingCategoryIds.map((value: any) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0));
    const existingTagIds = Array.isArray(prod.tags)
      ? prod.tags
          .map((tag: any) => Number(tag.id))
          .filter((value: number) => Number.isInteger(value) && value > 0)
      : [];
    setSelectedTagIds(existingTagIds);
    if (Array.isArray(prod.tags) && prod.tags.length > 0) {
      setAvailableTags((previous) => {
        const map = new Map<number, TagType>(previous.map((tag) => [tag.id, tag]));
        prod.tags.forEach((tag: any) => {
          const numericId = Number(tag.id);
          if (Number.isInteger(numericId) && numericId > 0) {
            map.set(numericId, { id: numericId, name: tag.name, usage_count: tag.usage_count });
          }
        });
        return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      });
    }
    setProductionSheetUrl(prod.production_sheet || '');
    setProductionSheetFile(null); // limpar arquivo temporário após recarregar
    setProductionFiles([]);        // limpar novos arquivos de matriz após recarregar
    setMainImage(null);            // limpar imagem temporária
    setGallery([]);                // limpar novas imagens de galeria
    setNewGalleryAlts([]);
    setDownloadableFiles(
      (prod.files || []).map((file: any) => ({
        file_name: file.file_name,
        file_path: file.file_path,
        file_type: file.file_type || 'downloadable',
      }))
    );
    const normalizedMainImage = getPublicAssetUrl(prod.image || '');
    const normalizedGallery = Array.isArray(prod.images)
      ? prod.images
          .map((img: any) => getPublicAssetUrl(img?.full_url || img?.url || ''))
          .filter(Boolean)
      : [];
    const loadedExistingGalleryAlts = Array.isArray(prod.images)
      ? prod.images.map((img: any) => String(img?.alt_text || '').trim())
      : [];
    setPreviews({ main: normalizedMainImage || '', gallery: [...normalizedGallery] });
    setMainImageAlt(String(prod.image_alt || '').trim());
    setExistingGalleryUrls(normalizedGallery);
    setExistingGalleryAlts(loadedExistingGalleryAlts);
  };

  useEffect(() => {
    async function fetchData() {
      const parseResponseArray = async (res: Response, label: string) => {
        try {
          const json = await res.json();
          if (!res.ok) {
            console.error(`[${label}] non-ok response`, json);
            return [];
          }
          return Array.isArray(json) ? json : [];
        } catch (error) {
          console.error(`[${label}] parse failed`, error);
          return [];
        }
      };

      const [catsRes, tagsRes, topTagsRes] = await Promise.all([
        fetch('/api/admin/categories', { credentials: 'include' }),
        fetch('/api/admin/tags', { credentials: 'include' }),
        fetch('/api/admin/tags/most-used?limit=20', { credentials: 'include' }),
      ]);

      const [catsData, tagsData, topTagsData] = await Promise.all([
        parseResponseArray(catsRes, 'categories'),
        parseResponseArray(tagsRes, 'tags'),
        parseResponseArray(topTagsRes, 'top-tags'),
      ]);

      setCategories(catsData as Category[]);
      setAvailableTags(tagsData as TagType[]);
      setTopUsedTags(topTagsData as TagType[]);

      if (id) {
        await loadProductData(id);
      }
    }
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    loadMercadoPagoSyncLogs();
  }, [id]);

  const loadMercadoPagoSyncLogs = async () => {
    if (!id) return;
    setLoadingSyncLogs(true);
    try {
      const res = await fetch('/api/admin/products/' + id + '/sync-mercadopago/logs', { credentials: 'include' });
      const payload = await res.json().catch(() => []);
      if (!res.ok) throw new Error(payload?.error || 'Erro ao carregar logs de sincronização.');
      setSyncLogs(Array.isArray(payload) ? payload : []);
    } catch (error) {
      setSyncFeedback((error && error.message) ? error.message : 'Erro ao carregar logs de sincronização.');
    } finally {
      setLoadingSyncLogs(false);
    }
  };

  const handleMainImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setMainImage(file);
      setPreviews(prev => ({ ...prev, main: URL.createObjectURL(file) }));
    }
  };

  const handleModalImageUpload = async (file: File) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setModalError('Formato inválido. Apenas JPG, JPEG, PNG, WEBP e GIF são aceitos.');
      return;
    }

    setModalError(null);

    // Se o produto for NOVO (sem id), apenas guarda localmente no estado e atualiza previews
    if (!id) {
      setMainImage(file);
      setPreviews(prev => ({ ...prev, main: URL.createObjectURL(file) }));
      return;
    }

    // Se o produto já existe (Edição), enviar assincronamente para a nova API
    setModalUploadLoading(true);
    try {
      const data = new FormData();
      data.append('image', file);

      const res = await fetch(`/api/admin/products/${id}/main-image`, {
        method: 'POST',
        credentials: 'include',
        body: data
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Erro ao gravar imagem física no servidor.');
      }

      // Atualiza previews e fecha modal
      const newUrl = getPublicAssetUrl(payload.image || '');
      setPreviews(prev => ({ ...prev, main: newUrl }));
      setMainImage(null); // Limpa o estado temporário local de arquivo já enviado
      setIsMainImageModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || 'Falha ao gravar arquivo no servidor.');
    } finally {
      setModalUploadLoading(false);
    }
  };

  const handleModalImageRemove = async () => {
    setModalError(null);

    // Se o produto for NOVO (sem id), apenas remove localmente
    if (!id) {
      setMainImage(null);
      setPreviews(prev => ({ ...prev, main: '' }));
      setActiveModalTab('upload'); // Garante que fica na aba de upload vazia
      return;
    }

    // Se o produto já existe (Edição), chamar a API assíncrona DELETE
    setModalUploadLoading(true);
    try {
      const res = await fetch(`/api/admin/products/${id}/main-image`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Erro ao remover imagem do servidor.');
      }

      setPreviews(prev => ({ ...prev, main: '' }));
      setMainImage(null);
      setActiveModalTab('upload'); // Fica na aba de upload vazia após remover
      // REMOVIDO: setIsMainImageModalOpen(false); -> mantêm o popup aberto!
    } catch (err: any) {
      setModalError(err.message || 'Falha ao remover arquivo.');
    } finally {
      setModalUploadLoading(false);
    }
  };

  const handleSelectGalleryImage = async (url: string) => {
    if (!url) return;
    setModalError(null);

    // Se o produto for NOVO (sem id), apenas define localmente
    if (!id) {
      setPreviews(prev => ({ ...prev, main: url }));
      setIsMainImageModalOpen(false);
      return;
    }

    // Se o produto já existe (Edição), enviar assincronamente a URL selecionada
    setModalUploadLoading(true);
    try {
      const res = await fetch(`/api/admin/products/${id}/main-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ image_url: url })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Erro ao definir imagem da galeria como principal.');
      }

      // Atualiza previews e fecha modal
      const newUrl = getPublicAssetUrl(payload.image || '');
      setPreviews(prev => ({ ...prev, main: newUrl }));
      setMainImage(null);
      setIsMainImageModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || 'Falha ao gravar arquivo no servidor.');
    } finally {
      setModalUploadLoading(false);
    }
  };

  const fetchServerImages = async () => {
    setLoadingServerImages(true);
    setModalError(null);
    try {
      const res = await fetch('/api/admin/files?rootKey=public-uploads');
      if (!res.ok) throw new Error('Não foi possível carregar as imagens do servidor.');
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const imageUrls = data.items
          .filter((item: any) => !item.isDir && allowedExts.some(ext => String(item.name).toLowerCase().endsWith(ext)))
          .map((item: any) => `/uploads/${item.relative}`);
        setServerImages(imageUrls);
      }
    } catch (err: any) {
      setModalError(err.message || 'Erro ao buscar imagens do servidor.');
    } finally {
      setLoadingServerImages(false);
    }
  };

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setGallery(prev => [...prev, ...files]);
      setNewGalleryAlts(prev => [...prev, ...files.map(() => '')]);
      const newPreviews = files.map(f => URL.createObjectURL(f as File));
      setPreviews(prev => ({ ...prev, gallery: [...prev.gallery, ...newPreviews] }));
    }
  };

  const removeGalleryItem = (index: number) => {
    const existingCount = existingGalleryUrls.length;
    if (index < existingCount) {
      setExistingGalleryUrls(prev => prev.filter((_, i) => i !== index));
      setExistingGalleryAlts(prev => prev.filter((_, i) => i !== index));
      setPreviews(prev => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
      return;
    }

    const newFileIndex = index - existingCount;
    setGallery(prev => prev.filter((_, i) => i !== newFileIndex));
    setNewGalleryAlts(prev => prev.filter((_, i) => i !== newFileIndex));
    setPreviews(prev => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
  };

  const selectedTags = availableTags.filter((tag) => selectedTagIds.includes(tag.id));
  const stripHtml = (value: string) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const seoTemplateMap = useMemo(
    () => ({
      '{{nome_produto}}': formData.name || 'Nome do produto',
      '{{slug_produto}}': formData.slug || 'slug-do-produto',
      '{{preco}}': formData.price || '0.00',
      '{{preco_promocional}}': formData.sale_price || formData.price || '0.00',
      '{{pontos}}': formData.stitch_count || '0',
      '{{cores}}': formData.colors || '0',
      '{{categoria_principal}}':
        categories.find((category) => category.id === Number(formData.category_id))?.name || 'Categoria',
      '{{site_nome}}': 'Digital Bordados',
    }),
    [formData, categories],
  );
  const seoTemplateVars = useMemo(
    () => [
      { key: '{{nome_produto}}', label: 'Nome do produto' },
      { key: '{{slug_produto}}', label: 'Slug do produto' },
      { key: '{{preco}}', label: 'Preço normal' },
      { key: '{{preco_promocional}}', label: 'Preço promocional' },
      { key: '{{pontos}}', label: 'Pontos' },
      { key: '{{cores}}', label: 'Cores' },
      { key: '{{categoria_principal}}', label: 'Categoria principal' },
      { key: '{{site_nome}}', label: 'Nome do site' },
    ],
    [],
  );
  const resolveSeoTemplate = (value: string) =>
    String(value || '').replace(/{{[a-z_]+}}/gi, (token) => {
      const normalized = token.toLowerCase();
      return seoTemplateMap[normalized as keyof typeof seoTemplateMap] ?? token;
    });
  const getSeoFieldRef = (field: SeoFieldKey) => {
    if (field === 'seo_title') return seoTitleInputRef;
    if (field === 'seo_description') return seoDescriptionInputRef;
    if (field === 'seo_keywords') return seoKeywordsInputRef;
    if (field === 'main_image_alt') return mainImageAltInputRef;
    return canonicalInputRef;
  };
  const insertSeoToken = (token: string) => {
    const field = activeSeoField;
    if (field === 'gallery_alt') {
      if (activeGalleryAltIndex === null) return;
      if (activeGalleryAltIndex < existingGalleryUrls.length) {
        setExistingGalleryAlts((prev) => prev.map((value, idx) => (idx === activeGalleryAltIndex ? `${value || ''}${token}` : value)));
      } else {
        const newIndex = activeGalleryAltIndex - existingGalleryUrls.length;
        setNewGalleryAlts((prev) => prev.map((value, idx) => (idx === newIndex ? `${value || ''}${token}` : value)));
      }
      return;
    }
    const ref = getSeoFieldRef(field).current;
    const currentValue = field === 'main_image_alt' ? String(mainImageAlt || '') : String(formData[field as keyof typeof formData] || '');

    if (!ref) {
      if (field === 'main_image_alt') {
        setMainImageAlt((prev) => `${String(prev || '')}${token}`);
      } else {
        setFormData((prev) => ({ ...prev, [field]: `${String(prev[field as keyof typeof prev] || '')}${token}` }));
      }
      return;
    }

    const start = ref.selectionStart ?? currentValue.length;
    const end = ref.selectionEnd ?? start;
    const nextValue = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;

    if (field === 'main_image_alt') {
      setMainImageAlt(nextValue);
    } else {
      setFormData((prev) => ({ ...prev, [field]: nextValue }));
    }
    requestAnimationFrame(() => {
      ref.focus();
      const cursor = start + token.length;
      ref.setSelectionRange(cursor, cursor);
    });
  };
  const addHeadingToDescription = () => {
    const headingText = (formData.seo_title || formData.name || 'Detalhes do produto').trim();
    const safeHeading = headingText || 'Detalhes do produto';
    const nextDescription = `<h2>${safeHeading}</h2>\n${formData.description || ''}`.trim();
    setFormData((prev) => ({ ...prev, description: nextDescription }));
  };
  const addAltToDescriptionImages = () => {
    const altText = (formData.seo_title || formData.name || 'Imagem do produto').trim();
    const nextDescription = String(formData.description || '').replace(
      /<img(?![^>]*\balt=)([^>]*?)>/gi,
      `<img alt="${altText.replace(/"/g, '&quot;')}"$1>`,
    );
    setFormData((prev) => ({ ...prev, description: nextDescription }));
  };
  const contentImageCount = (String(formData.description || '').match(/<img\b/gi) || []).length;
  const seoKeywordsResolved = resolveSeoTemplate(formData.seo_keywords || '');
  const seoKeyword = String(seoKeywordsResolved || '').split(',')[0]?.trim().toLowerCase() || '';
  const seoTitlePreview = String(resolveSeoTemplate(formData.seo_title || formData.name || '')).trim();
  const seoDescriptionPreview = String(
    resolveSeoTemplate(formData.seo_description || stripHtml(formData.short_description || formData.description || '')),
  ).trim();
  const plainDescription = stripHtml(formData.description || '');
  const wordCount = plainDescription ? plainDescription.split(/\s+/).length : 0;
  const keywordMatches = seoKeyword ? (plainDescription.toLowerCase().match(new RegExp(`\\b${seoKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length : 0;
  const keywordDensity = wordCount > 0 ? (keywordMatches / wordCount) * 100 : 0;
  const hasHeading = /<h[1-3][^>]*>.*?<\/h[1-3]>/i.test(formData.description || '');
  const hasImageAltInDescription = /<img[^>]+alt\s*=\s*['"][^'"]+['"][^>]*>/i.test(formData.description || '');
  const hasImageAltInMedia = !!String(mainImageAlt || '').trim() || [...existingGalleryAlts, ...newGalleryAlts].some((alt) => String(alt || '').trim().length > 0);
  const hasImageAlt = hasImageAltInDescription || hasImageAltInMedia;
  const seoScore = [
    seoTitlePreview.length >= 35 && seoTitlePreview.length <= 65 ? 20 : 0,
    seoDescriptionPreview.length >= 120 && seoDescriptionPreview.length <= 160 ? 20 : 0,
    formData.slug.trim().length >= 3 ? 15 : 0,
    seoKeyword ? 15 : 0,
    keywordDensity >= 0.5 && keywordDensity <= 3 ? 15 : 0,
    hasHeading ? 10 : 0,
    hasImageAlt ? 5 : 0,
  ].reduce((a, b) => a + b, 0);

  const allCategoriesHierarchical = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const childrenByParent = new Map<number | null, Category[]>();

    categories.forEach((category) => {
      const parentId = category.parent_id && byId.has(category.parent_id) ? category.parent_id : null;
      const list = childrenByParent.get(parentId) || [];
      list.push(category);
      childrenByParent.set(parentId, list);
    });

    const sortCategories = (items: Category[]) =>
      [...items].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));

    const flattened: Array<Category & { level: number }> = [];
    const walk = (parentId: number | null, level: number) => {
      const children = sortCategories(childrenByParent.get(parentId) || []);
      children.forEach((child) => {
        flattened.push({ ...child, level });
        walk(child.id, level + 1);
      });
    };

    walk(null, 0);
    return flattened;
  }, [categories]);

  const topUsedCategories = useMemo(
    () =>
      [...categories]
        .sort((left, right) => (right.product_count || 0) - (left.product_count || 0))
        .slice(0, 20)
        .map((category) => ({ ...category, level: 0 })),
    [categories],
  );

  const visibleCategories = categoryTab === 'top' ? topUsedCategories : allCategoriesHierarchical;

  const toggleCategorySelection = (categoryId: number) => {
    setSelectedCategoryIds((previous) => {
      const alreadySelected = previous.includes(categoryId);
      const next = alreadySelected
        ? previous.filter((id) => id !== categoryId)
        : [...previous, categoryId];
      setFormData((prev) => ({ ...prev, category_id: next[0] ? String(next[0]) : '' }));
      return next;
    });
  };

  const addTagIds = (tagIds: number[]) => {
    const normalizedTagIds = tagIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    setSelectedTagIds((prev) => Array.from(new Set([...prev, ...normalizedTagIds])));
  };

  const removeTagById = (tagId: number) => {
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
  };

  const ensureTagByName = async (tagNameRaw: string): Promise<number | null> => {
    const tagName = tagNameRaw.trim();
    if (!tagName) return null;

    const existingTag = availableTags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase());
    if (existingTag) return existingTag.id;

    const response = await fetch('/api/admin/tags', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tagName }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro ao criar tag:', errorText);
      return null;
    }

    const createdTag = await response.json();
    if (!createdTag?.id) return null;

    setAvailableTags((prev) => {
      if (prev.some((tag) => tag.id === createdTag.id)) return prev;
      return [...prev, createdTag];
    });

    setTopUsedTags((prev) => {
      if (prev.some((tag) => tag.id === createdTag.id)) return prev;
      return [...prev, createdTag].slice(0, 20);
    });

    return createdTag.id;
  };

  const handleAddTagsFromInput = async () => {
    const names = tagInput
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    if (names.length === 0) return;

    setTagsBusy(true);
    try {
      const ids: number[] = [];
      for (const name of names) {
        const id = await ensureTagByName(name);
        if (id) ids.push(id);
      }
      if (ids.length === 0) {
        alert('Não foi possível adicionar as tags informadas.');
        return;
      }
      addTagIds(ids);
      setTagInput('');
    } finally {
      setTagsBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const normalizedCategoryIds = selectedCategoryIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const primaryCategoryId = normalizedCategoryIds[0] ? String(normalizedCategoryIds[0]) : '';

    const data = new FormData();

    // Enviar apenas campos de texto/número — excluir booleanos que seriam convertidos
    // em 'true'/'false' e poderiam confundir o servidor (is_featured e is_new não estão no UPDATE)
    const textFields: Array<keyof typeof formData> = [
      'name', 'slug', 'short_description', 'description',
      'price', 'sale_price', 'stitch_count', 'colors',
      'seo_title', 'seo_description', 'seo_keywords', 'canonical_url'
    ];
    textFields.forEach(key => {
      data.append(key as string, String(formData[key] ?? ''));
    });
    data.append('category_id', primaryCategoryId);
    data.append('noindex', formData.noindex ? '1' : '0');

    if (mainImage) data.append('image', mainImage);
    data.append('image_alt', mainImageAlt);
    gallery.forEach(f => data.append('gallery', f));
    data.append('gallery_urls', JSON.stringify(existingGalleryUrls));
    data.append('gallery_alts_existing', JSON.stringify(existingGalleryAlts));
    data.append('gallery_alts_new', JSON.stringify(newGalleryAlts));

    // Se há novos arquivos de matriz para upload, enviar apenas eles (o servidor substituirá os existentes)
    // Os downloadableFiles existentes só são reenviados se NÃO há novos arquivos físicos
    productionFiles.forEach(f => data.append('production_files', f));
    if (productionFiles.length === 0) {
      // Sem novos arquivos físicos: reenviar lista dos existentes para preservação
      data.append('downloadable_files', JSON.stringify(downloadableFiles));
    } else {
      // Com novos arquivos físicos: não reenviar os existentes para evitar duplicação
      // O servidor apagará os antigos e usará apenas os novos production_files
      data.append('downloadable_files', JSON.stringify([]));
    }

    data.append('tags', JSON.stringify(selectedTagIds));
    data.append('promotional_price', String(formData.sale_price ?? ''));
    data.append('category_ids', JSON.stringify(normalizedCategoryIds));

    if (productionSheetFile) {
      data.append('production_sheet', productionSheetFile);
    } else {
      data.append('production_sheet', productionSheetUrl);
    }

    try {
      const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
      const method = id ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        credentials: 'include',
        body: data,
      });

      if (res.ok) {
        const responsePayload = await res.json().catch(() => ({} as any));

        if (id) {
          // Recarregar os dados do servidor para sincronizar o estado do formulário
          // Isso evita duplicação de arquivos em salvamentos subsequentes
          await loadProductData(id);
          alert('Produto atualizado com sucesso.');
          return;
        }

        const createdId = Number(responsePayload?.id);
        if (Number.isInteger(createdId) && createdId > 0) {
          navigate(`/admin/produtos/editar/${createdId}`);
        } else {
          alert('Produto salvo, mas não foi possível abrir a tela de edição automaticamente.');
          navigate('/admin/produtos');
        }
      } else {
        const error = await res.json();
        alert(error.error || 'Erro ao salvar produto');
      }
    } catch (error) {
      alert('Erro de conexão ao salvar produto');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategoryInline = async () => {
    const name = quickCategoryName.trim();
    if (!name) {
      alert('Informe o nome da categoria.');
      return;
    }

    setQuickCategoryBusy(true);
    try {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parent_id: quickCategoryParentId ? Number(quickCategoryParentId) : '',
          sort_order: 0,
          status: 'active',
          description: '',
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.id) {
        alert(payload?.error || 'Não foi possível criar a categoria.');
        return;
      }

      const createdCategory: Category = {
        id: Number(payload.id),
        name: payload.name,
        parent_id: payload.parent_id ? Number(payload.parent_id) : null,
        product_count: payload.product_count || 0,
      };

      setCategories((previous) => {
        const existing = previous.find((category) => category.id === createdCategory.id);
        if (existing) return previous;
        return [...previous, createdCategory];
      });

      toggleCategorySelection(createdCategory.id);
      setQuickCategoryName('');
      setQuickCategoryParentId('');
      setShowQuickCategoryForm(false);
    } catch (error) {
      console.error('Erro ao criar categoria inline:', error);
      alert('Erro de conexão ao criar categoria.');
    } finally {
      setQuickCategoryBusy(false);
    }
  };

  const handleSyncMercadoPago = async () => {
    if (!id) {
      alert('Salve o produto antes de sincronizar com Mercado Pago.');
      return;
    }
    setSyncingMercadoPago(true);
    setSyncFeedback('');
    try {
      const res = await fetch(`/api/admin/products/${id}/sync-mercadopago`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const errorMessage = payload?.error || 'Erro ao sincronizar produto com Mercado Pago.';
        setSyncFeedback(errorMessage);
        alert(errorMessage);
        return;
      }
      const successMessage = payload?.message || 'Produto sincronizado com Mercado Pago.';
      setSyncFeedback(successMessage);
      alert(successMessage);
      loadMercadoPagoSyncLogs();
    } catch (error) {
      alert('Erro de conexão ao sincronizar com Mercado Pago.');
    } finally {
      setSyncingMercadoPago(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between gap-3 mb-10">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/admin/produtos')}
            className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">
              {id ? 'Editar Produto' : 'Novo Produto'}
            </h1>
            <p className="text-slate-500 font-medium">Preencha todos os campos para cadastrar a matriz.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {id && (
            <button
              type="button"
              onClick={handleSyncMercadoPago}
              disabled={syncingMercadoPago}
              className="bg-slate-800 text-white px-5 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-slate-900 transition-all disabled:opacity-50"
            >
              {syncingMercadoPago ? 'Sincronizando...' : 'Sincronizar Produto Mercado Pago'}
            </button>
          )}
                    {id && formData.slug && (
            <a
              href={`/produto/${formData.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 transition-all flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Visualizar Produto
            </a>
          )}
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-3 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : (
              <>
                <Save className="w-5 h-5" />
                Salvar Matriz
              </>
            )}
          </button>
        </div>
      </div>


      {id && (
        <div className="mb-8 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Logs de Sincronização Mercado Pago</h3>
            <button
              type="button"
              onClick={loadMercadoPagoSyncLogs}
              disabled={loadingSyncLogs}
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {loadingSyncLogs ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
          {syncFeedback && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 text-blue-800 text-xs font-semibold px-4 py-3">
              {syncFeedback}
            </div>
          )}
          {loadingSyncLogs ? (
            <div className="text-xs font-semibold text-slate-400">Carregando logs...</div>
          ) : syncLogs.length === 0 ? (
            <div className="text-xs font-semibold text-slate-400">Nenhum log de sincronização encontrado.</div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
              {syncLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black text-slate-700 uppercase">{String(log.status || '-')}</span>
                    <span className="font-semibold text-slate-400">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="mt-1 font-semibold text-slate-700">{log.message || '-'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Main Content */}
        <div className="w-full lg:w-2/3 space-y-8">
          {/* Basic Info */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 md:p-10 space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
              <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                <Settings className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Informações Básicas</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Produto</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                  placeholder="Ex: Matriz de Bordado Borboleta 3D"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Slug amigável</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={e => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all"
                  placeholder="ex: matriz-borboleta-3d"
                />
              </div>

              <div className="space-y-2">
                <HtmlRichEditor
                  label="Breve Descrição"
                  value={formData.short_description}
                  onChange={(value) => setFormData((prev) => ({ ...prev, short_description: value }))}
                  rows={6}
                  placeholder="Resumo para listagens"
                />
              </div>

              <div className="space-y-2">
                <HtmlRichEditor
                  label="Descrição Completa"
                  value={formData.description}
                  onChange={(value) => setFormData((prev) => ({ ...prev, description: value }))}
                  rows={12}
                  placeholder="Instruções e detalhes do bordado..."
                />
              </div>
            </div>
          </div>


          {/* SEO Options */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 md:p-10 space-y-8">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">SEO e Metadados</h3>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título SEO</label>
                  <input
                    ref={seoTitleInputRef}
                    type="text"
                    value={formData.seo_title}
                    onChange={e => setFormData((prev) => ({ ...prev, seo_title: e.target.value }))}
                    onFocus={() => setActiveSeoField('seo_title')}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold"
                    placeholder="Meta title para o Google"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Meta Descrição SEO</label>
                  <textarea
                    ref={seoDescriptionInputRef}
                    rows={3}
                    value={formData.seo_description}
                    onChange={e => setFormData((prev) => ({ ...prev, seo_description: e.target.value }))}
                    onFocus={() => setActiveSeoField('seo_description')}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold resize-none"
                    placeholder="Resumo para resultados de busca"
                  />
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Chaves dinâmicas SEO</p>
                    <p className="text-[10px] font-semibold text-slate-500">
                      Campo ativo: <span className="text-blue-700 uppercase">{activeSeoField === 'main_image_alt' ? 'ALT IMAGEM PRINCIPAL' : activeSeoField === 'gallery_alt' ? 'ALT GALERIA' : activeSeoField.replace('seo_', 'seo ')}</span>
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Clique em uma chave para inserir no campo selecionado. Você também pode escrever texto livre junto com as chaves.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {seoTemplateVars.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => insertSeoToken(item.key)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-200 bg-white text-[10px] font-black text-blue-700 uppercase tracking-wide hover:bg-blue-100"
                        title={`${item.label}: ${seoTemplateMap[item.key.toLowerCase() as keyof typeof seoTemplateMap]}`}
                      >
                        <span>{item.key}</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-600">
                    {seoTemplateVars.map((item) => (
                      <p key={`${item.key}-example`} className="truncate">
                        <span className="font-black text-slate-700">{item.key}</span>: {seoTemplateMap[item.key.toLowerCase() as keyof typeof seoTemplateMap]}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Palavras-chave SEO</label>
                    <input
                      ref={seoKeywordsInputRef}
                      type="text"
                      value={formData.seo_keywords}
                      onChange={e => setFormData((prev) => ({ ...prev, seo_keywords: e.target.value }))}
                      onFocus={() => setActiveSeoField('seo_keywords')}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold"
                      placeholder="ex: policia militar, veterinaria, enfermagem"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Canonical URL</label>
                    <input
                      ref={canonicalInputRef}
                      type="text"
                      value={formData.canonical_url}
                      onChange={e => setFormData((prev) => ({ ...prev, canonical_url: e.target.value }))}
                      onFocus={() => setActiveSeoField('canonical_url')}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold"
                      placeholder="https://www.seudominio.com/produto/matriz-exemplo"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Indexação</label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!formData.noindex}
                      onClick={() => setFormData((prev) => ({ ...prev, noindex: !prev.noindex }))}
                      className={`w-full px-4 py-4 rounded-2xl border text-xs font-black uppercase tracking-widest transition-colors ${
                        formData.noindex
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}
                    >
                      {formData.noindex ? 'Noindex / Nofollow' : 'Index / Follow'}
                    </button>
                  </div>
                  <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 md:p-5 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Diagnostico e Preview SEO</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Analise SEO</p>
                          <span className={`text-xs font-black ${seoScore >= 80 ? 'text-emerald-600' : seoScore >= 55 ? 'text-amber-600' : 'text-rose-600'}`}>{seoScore}/100</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className={`h-full ${seoScore >= 80 ? 'bg-emerald-500' : seoScore >= 55 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.max(0, Math.min(100, seoScore))}%` }} />
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-600">
                            <span>Título</span>
                            <span>{seoTitlePreview.length} caracteres</span>
                            <span>Descrição</span>
                            <span>{seoDescriptionPreview.length} caracteres</span>
                            <span>Densidade keyword</span>
                            <span>{keywordDensity.toFixed(2)}%</span>
                            <span>Legibilidade</span>
                            <span>{wordCount < 80 ? 'baixa' : wordCount > 450 ? 'alta' : 'ok'}</span>
                            <span>Heading no conteúdo</span>
                            <span>{hasHeading ? 'ok' : 'falta'}</span>
                            <span>Imagem com ALT</span>
                            <span>{hasImageAlt ? 'ok' : 'falta'}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {!hasHeading && (
                            <button
                              type="button"
                              onClick={addHeadingToDescription}
                              className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest hover:bg-amber-100"
                            >
                              Corrigir: adicionar heading no conteudo
                            </button>
                          )}
                          {!hasImageAlt && (
                            <button
                              type="button"
                              onClick={addAltToDescriptionImages}
                              className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 disabled:opacity-50"
                              disabled={contentImageCount === 0}
                              title={contentImageCount === 0 ? 'Adicione imagens na descrição completa para aplicar ALT automaticamente.' : ''}
                            >
                              {contentImageCount === 0
                                ? 'Sem imagem no conteudo para aplicar ALT'
                                : 'Corrigir: adicionar ALT nas imagens do conteudo'}
                            </button>
                          )}
                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            Densidade keyword = ocorrencias da palavra-chave principal no texto / total de palavras x 100. Faixa recomendada: 0.5% a 3%.
                          </p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Preview Google</p>
                        <p className="text-[10px] text-emerald-700 font-semibold truncate">{resolveSeoTemplate(formData.canonical_url) || `https://www.seudominio.com/produto/${formData.slug || 'slug-do-produto'}`}</p>
                        <p className="text-base leading-tight text-blue-700 font-semibold">{seoTitlePreview || 'Titulo do produto para resultado de busca'}</p>
                        <p className="text-xs text-slate-600 line-clamp-3">{seoDescriptionPreview || 'Descricao do produto otimizada para mecanismos de busca.'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 md:p-10 space-y-6 relative">
              <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
                <div className="w-8 h-8 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Tags do Produto</h3>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova tag</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTagsFromInput();
                      }
                    }}
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                    placeholder="Ex: administração, bordado estilizado"
                  />
                  <button
                    type="button"
                    disabled={tagsBusy}
                    onClick={handleAddTagsFromInput}
                    className="px-4 py-3 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {tagsBusy ? '...' : 'Adicionar'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold">Separar as tags com vírgulas</p>
              </div>

              <div className="flex flex-wrap gap-2 min-h-10">
                {selectedTags.length === 0 ? (
                  <span className="text-[11px] text-slate-400">Nenhuma tag selecionada.</span>
                ) : (
                  selectedTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => removeTagById(tag.id)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wide hover:bg-blue-100"
                    >
                      <span>{tag.name}</span>
                      <X className="w-3 h-3" />
                    </button>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTagIds([])}
                  className="px-3 py-2 rounded-lg border border-rose-200 text-rose-600 bg-rose-50 text-[10px] font-black uppercase tracking-wider hover:bg-rose-100"
                >
                  Limpar todas as tags
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTopTags((prev) => !prev)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 bg-white text-[10px] font-black uppercase tracking-wider hover:border-blue-200 hover:text-blue-600"
                  >
                    Escolher das tags mais usadas
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showTopTags && (
                    <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl z-20 p-2 max-h-72 overflow-auto">
                      {topUsedTags.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500">Sem tags de uso no momento.</div>
                      ) : (
                        topUsedTags.map((tag) => (
                          <button
                            key={`top-${tag.id}`}
                            type="button"
                            onClick={() => {
                              addTagIds([tag.id]);
                              setShowTopTags(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-between"
                          >
                            <span>{tag.name}</span>
                            <span className="text-[10px] text-slate-400">{tag.usage_count ?? 0} usos</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
          </div>
        </div>

        {/* Sidebar Settings */}
        <div className="w-full lg:w-1/3 space-y-8">
          {/* Price & Meta */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-8">
             <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
              <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                <Tag className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Valores</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Preço normal (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.price}
                  onChange={e => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-blue-600"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Preço promo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sale_price}
                  onChange={e => setFormData((prev) => ({ ...prev, sale_price: e.target.value }))}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-emerald-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Technical Info */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categorias do Produto</label>
                  <button
                    type="button"
                    onClick={() => setShowQuickCategoryForm((prev) => !prev)}
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700"
                  >
                    + Add Categoria
                  </button>
                </div>
                {showQuickCategoryForm && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3 space-y-3">
                    <input
                      type="text"
                      value={quickCategoryName}
                      onChange={(event) => setQuickCategoryName(event.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-semibold"
                      placeholder="Nome da nova categoria"
                    />
                    <select
                      value={quickCategoryParentId}
                      onChange={(event) => setQuickCategoryParentId(event.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-semibold"
                    >
                      <option value="">Sem categoria pai</option>
                      {allCategoriesHierarchical.map((category) => (
                        <option key={`quick-parent-${category.id}`} value={category.id}>
                          {`${'— '.repeat((category as any).level || 0)}${category.name}`}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={quickCategoryBusy}
                        onClick={handleCreateCategoryInline}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {quickCategoryBusy ? 'Salvando...' : 'Adicionar nova categoria'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQuickCategoryForm(false)}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                  <div className="flex border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => setCategoryTab('all')}
                      className={`flex-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                        categoryTab === 'all' ? 'bg-white text-blue-600' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Todas as categorias
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategoryTab('top')}
                      className={`flex-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                        categoryTab === 'top' ? 'bg-white text-blue-600' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Mais usadas
                    </button>
                  </div>

                  <div className="max-h-44 overflow-y-auto p-3 space-y-2">
                    {visibleCategories.length === 0 ? (
                      <p className="text-[11px] text-slate-400">Nenhuma categoria disponível.</p>
                    ) : (
                      visibleCategories.map((category) => {
                        const level = (category as any).level || 0;
                        const branch = level > 0 ? `${'— '.repeat(level)}` : '';
                        return (
                          <label
                            key={category.id}
                            className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                            style={{ paddingLeft: `${level * 14}px` }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedCategoryIds.includes(category.id)}
                              onChange={() => toggleCategorySelection(category.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className={`flex-1 ${level === 0 ? 'font-semibold text-slate-800' : 'font-medium text-blue-700'}`}>
                              {branch}{category.name}
                            </span>
                            <span className="text-[10px] text-slate-400">{category.product_count || 0}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold">
                  Categoria principal: {categories.find((category) => category.id === Number(formData.category_id))?.name || 'não definida'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pontos</label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="number"
                      value={formData.stitch_count}
                      onChange={e => setFormData((prev) => ({ ...prev, stitch_count: e.target.value }))}
                      className="w-full pl-10 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                      placeholder="15000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cores</label>
                  <div className="relative">
                    <Palette className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={formData.colors}
                      onChange={e => setFormData((prev) => ({ ...prev, colors: e.target.value }))}
                      className="w-full pl-10 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                      placeholder="5 cores"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Media & Gallery */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 md:p-10 space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
              <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
                <ImageIcon className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Mídia e Galeria</h3>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Imagem Principal</label>
                <div 
                  onClick={() => {
                    setIsMainImageModalOpen(true);
                    setActiveModalTab('gallery');
                    setSelectedGalleryImage(previews.main || null);
                    fetchServerImages();
                  }}
                  className="relative aspect-video rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 overflow-hidden flex items-center justify-center group cursor-pointer hover:border-blue-400 transition-all"
                >
                  {previews.main ? (
                    <img src={previews.main} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-blue-500">
                      <Upload className="w-8 h-8" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Gerenciar Imagem Principal</span>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  ref={mainImageAltInputRef}
                  value={mainImageAlt}
                  onChange={(event) => setMainImageAlt(event.target.value)}
                  onFocus={() => setActiveSeoField('main_image_alt')}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  placeholder="ALT da imagem principal (ex: Brasão Medicina FIMCA)"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Galeria de Fotos</label>
                <div className="relative aspect-video rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 overflow-hidden flex items-center justify-center group cursor-pointer hover:border-blue-400 transition-all">
                  <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-blue-500">
                    <Plus className="w-8 h-8" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Adicionar Fotos</span>
                  </div>
                  <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleGalleryChange} accept="image/*" />
                </div>
              </div>
            </div>

            {previews.gallery.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4">
                {previews.gallery.map((url, i) => (
                  <div key={i} className="space-y-2">
                    <div className="relative aspect-square rounded-2xl overflow-hidden border border-slate-100 group">
                      <img
                        src={url}
                        onError={(event) => {
                          if (import.meta.env.DEV) {
                            console.debug('[AdminProductForm] gallery preview error:', (event.currentTarget as HTMLImageElement).src);
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeGalleryItem(i)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={i < existingGalleryUrls.length ? (existingGalleryAlts[i] || '') : (newGalleryAlts[i - existingGalleryUrls.length] || '')}
                      onFocus={() => {
                        setActiveSeoField('gallery_alt');
                        setActiveGalleryAltIndex(i);
                      }}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (i < existingGalleryUrls.length) {
                          setExistingGalleryAlts((prev) => prev.map((value, idx) => (idx === i ? next : value)));
                        } else {
                          const newIndex = i - existingGalleryUrls.length;
                          setNewGalleryAlts((prev) => prev.map((value, idx) => (idx === newIndex ? next : value)));
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold"
                      placeholder={`ALT da imagem ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Production Files Upload */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-8">
             <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
              <div className="w-8 h-8 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
                <FileCode className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Matrizes (Arquivos)</h3>
            </div>
            
            <div className="space-y-4">
               <div className="relative w-full py-6 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50 flex flex-col items-center justify-center gap-2 group hover:border-blue-200 transition-all cursor-pointer">
                  <Upload className="w-6 h-6 text-slate-300 group-hover:text-blue-500" />
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest group-hover:text-blue-600">Enviar Matrizes (ZIP, PES, etc)</span>
                  <input 
                    type="file" 
                    multiple 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={e => e.target.files && setProductionFiles(prev => [...prev, ...Array.from(e.target.files!)])} 
                  />
               </div>

               <div className="space-y-2">
                 {downloadableFiles.map((file, i) => (
                   <div key={`existing-${i}`} className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                     <span className="text-[10px] font-bold text-blue-700 truncate max-w-[150px]">{file.file_name}</span>
                     <button
                       type="button"
                       onClick={() => setDownloadableFiles(prev => prev.filter((_, idx) => idx !== i))}
                       className="text-red-400 hover:text-red-600"
                     >
                       <X className="w-4 h-4" />
                     </button>
                   </div>
                 ))}

                 {productionFiles.map((f, i) => (
                   <div key={`new-${i}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                     <span className="text-[10px] font-bold text-slate-600 truncate max-w-[150px]">{f.name}</span>
                     <button
                       type="button"
                       onClick={() => setProductionFiles(prev => prev.filter((_, idx) => idx !== i))}
                       className="text-red-400 hover:text-red-600"
                     >
                       <X className="w-4 h-4" />
                     </button>
                   </div>
                 ))}
               </div>
            </div>
          </div>

          {/* Production Sheet */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
              <div className="w-8 h-8 bg-red-50 text-red-600 rounded-lg flex items-center justify-center">
                <FileCode className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Folha de Produção (PDF)</h3>
            </div>

            <div className="space-y-4">
              <div className="relative w-full py-6 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50 flex flex-col items-center justify-center gap-2 group hover:border-blue-200 transition-all cursor-pointer">
                <Upload className="w-6 h-6 text-slate-300 group-hover:text-blue-500" />
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest group-hover:text-blue-600">Enviar Folha (PDF)</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => setProductionSheetFile(e.target.files?.[0] || null)}
                />
              </div>

              {productionSheetFileName && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="text-[10px] font-bold text-blue-700 truncate max-w-[180px]">{productionSheetFileName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setProductionSheetFile(null);
                      setProductionSheetUrl('');
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Flags */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-8 space-y-6">
            <button
              type="button"
              role="switch"
              aria-checked={formData.is_featured}
              onClick={() => setFormData((prev) => ({ ...prev, is_featured: !prev.is_featured }))}
              className="w-full flex items-center justify-between"
            >
              <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Destaque na Home</span>
              <span className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${formData.is_featured ? 'bg-blue-600' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform ${formData.is_featured ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={formData.is_new}
              onClick={() => setFormData((prev) => ({ ...prev, is_new: !prev.is_new }))}
              className="w-full flex items-center justify-between"
            >
              <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Marcar como Lançamento</span>
              <span className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${formData.is_new ? 'bg-blue-600' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white transition-transform ${formData.is_new ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL POPUP: GERENCIAR IMAGEM PRINCIPAL */}
      {isMainImageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-10 max-w-5xl w-full shadow-2xl space-y-8">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Imagem Principal</h3>
                <p className="text-slate-400 text-xs font-semibold mt-1">Gerencie a imagem principal em destaque do produto.</p>
              </div>
              <button 
                onClick={() => {
                  setIsMainImageModalOpen(false);
                  setModalError(null);
                }}
                className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-black text-red-800 uppercase tracking-wider">
                {modalError}
              </div>
            )}

            {/* ABAS DO MODAL */}
            <div className="flex border-b border-slate-100 pb-2 gap-4">
              <button
                type="button"
                onClick={() => setActiveModalTab('gallery')}
                className={`pb-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                  activeModalTab === 'gallery'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Escolher Imagem Enviada
              </button>
              <button
                type="button"
                onClick={() => setActiveModalTab('upload')}
                className={`pb-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                  activeModalTab === 'upload'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Enviar Nova Imagem
              </button>
            </div>

            {/* CONTEÚDO DA ABA SELECIONADA */}
            {activeModalTab === 'gallery' ? (
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  Selecione qualquer imagem já enviada ao servidor:
                </p>
                {loadingServerImages ? (
                  <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-100 min-h-[160px] animate-pulse">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carregando imagens...</span>
                  </div>
                ) : serverImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-100 min-h-[160px] text-center space-y-3">
                    <p className="text-xs font-black text-slate-700 uppercase tracking-tight">
                      Nenhuma imagem encontrada no servidor.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveModalTab('upload')}
                      className="px-4 py-2 bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg hover:bg-blue-700"
                    >
                      Enviar nova imagem
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 max-h-[30rem] overflow-y-auto p-2 bg-slate-50 rounded-3xl border border-slate-100">
                    {serverImages.map((url, i) => {
                      const isSelected = selectedGalleryImage === url;
                      return (
                        <div
                          key={i}
                          onClick={() => setSelectedGalleryImage(url)}
                          className={`relative aspect-square rounded-xl overflow-hidden border cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-600 ring-2 ring-blue-600 shadow-md scale-95'
                              : 'border-slate-200 hover:border-blue-400'
                          }`}
                        >
                          <img src={url} className="w-full h-full object-cover" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-blue-600/10 flex items-center justify-center">
                              <div className="bg-blue-600 text-white rounded-full p-1 shadow-md">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ABA DE UPLOAD */
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center bg-slate-50 rounded-3xl p-6 min-h-[200px] relative border border-slate-100 overflow-hidden">
                  {previews.main ? (
                    <div className="space-y-4 w-full text-center">
                      <div className="aspect-video w-full max-w-md mx-auto rounded-3xl overflow-hidden border border-slate-200 shadow-md">
                        <img src={previews.main} className="w-full h-full object-cover" />
                      </div>
                      <div className="text-center text-[10px] font-bold text-slate-500 truncate max-w-full px-4">
                        <span className="block text-slate-400 font-semibold uppercase tracking-wider">Caminho / URL Pública:</span>
                        <span className="select-all font-mono">{previews.main.startsWith('blob:') ? 'Pré-visualização Local (Ainda não salvo)' : previews.main}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-3">
                      <ImageIcon className="w-12 h-12 text-slate-300 mx-auto" />
                      <p className="text-xs font-black text-slate-700 uppercase tracking-tight">
                        Nenhuma imagem principal cadastrada para este produto.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* BOTTOM BAR / BOTÕES DE AÇÃO */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsMainImageModalOpen(false);
                  setModalError(null);
                }}
                className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-50"
              >
                Fechar
              </button>
              
              {activeModalTab === 'gallery' ? (
                <button
                  type="button"
                  disabled={modalUploadLoading || !selectedGalleryImage || selectedGalleryImage === previews.main || loadingServerImages}
                  onClick={() => selectedGalleryImage && handleSelectGalleryImage(selectedGalleryImage)}
                  className="px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
                >
                  {modalUploadLoading ? 'Salvando...' : 'Definir como Imagem Principal'}
                </button>
              ) : (
                <>
                  {previews.main && (
                    <button
                      type="button"
                      disabled={modalUploadLoading}
                      onClick={handleModalImageRemove}
                      className="px-5 py-3 rounded-xl bg-red-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {modalUploadLoading ? 'Removendo...' : 'Remover Imagem'}
                    </button>
                  )}

                  <label className="relative cursor-pointer px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/10 hover:bg-blue-700 transition-all flex items-center justify-center disabled:opacity-50">
                    <span>{previews.main ? 'Substituir Imagem' : 'Enviar imagem principal'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={modalUploadLoading}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleModalImageUpload(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



