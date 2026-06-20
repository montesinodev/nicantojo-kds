create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  position int default 0,
  created_at timestamp default now()
);

create index if not exists idx_menu_categories_restaurant
on menu_categories(restaurant_id);