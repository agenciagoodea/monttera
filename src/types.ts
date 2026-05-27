export interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id?: number | null;
  image?: string;
  description?: string;
  status: string;
  sort_order: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  price: number;
  sale_price?: number | null;
  image: string;
  image_alt?: string | null;
  production_sheet?: string | null;
  category_id: number;
  category_name?: string;
  category_slug?: string;
  parent_category_name?: string;
  parent_category_slug?: string;
  stitch_count?: number;
  colors?: string;
  is_new: boolean | number;
  is_featured: boolean | number;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
  sku?: string | null;
  brand?: string | null;
  model?: string | null;
  tags?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  gallery?: ProductGalleryImage[];
  relatedProducts?: Product[];
  categories?: {
    id: number;
    name: string;
    slug: string;
    parent_id?: number | null;
    parent_name?: string | null;
    parent_slug?: string | null;
  }[];
}

export interface ProductGalleryImage {
  id: number;
  product_id: number;
  url: string;
  full_url: string;
  alt_text?: string;
  is_featured?: number | boolean;
  created_at?: string | null;
  file_type?: string | null;
}

export interface CartItem {
  product_id: number;
  product_name: string;
  product_slug: string;
  product_image: string | null;
  price: number;
  quantity: number;
}

export interface Order {
  id: number;
  customer_id: number;
  subtotal: number;
  total: number;
  status: 'pending' | 'waiting_payment' | 'paid' | 'rejected' | 'cancelled';
  payment_method: string | null;
  payment_id: string | null;
  created_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  name: string;
  price: number;
  quantity: number;
}
