export interface Restaurant {
  id: string;
  name: string;
  address: string;
  is_open: boolean;
  categories: string | null;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price_cordobas: number;
  category: string | null;
  image_url: string | null;
  is_available: boolean;
  deleted_at: string | null;
}