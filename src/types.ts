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
  production_sheet?: string | null;
  category_id: number;
  category_name?: string;
  category_slug?: string;
  stitch_count?: number;
  colors?: string;
  is_new: boolean | number;
  is_featured: boolean | number;
  status: string;
  created_at?: string;
  updated_at?: string;
  gallery?: string[];
  relatedProducts?: Product[];
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
