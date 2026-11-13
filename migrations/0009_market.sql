-- 0009_market.sql: Coin market. Items are bought with coins won from cases.
-- Tokens are never spent. The coin balance is case winnings minus these purchases.

CREATE TABLE IF NOT EXISTS market_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  note TEXT,
  price_coins INTEGER NOT NULL CHECK (price_coins > 0),
  image TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  kick_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_coins INTEGER NOT NULL CHECK (price_coins > 0),
  bought_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_purchases_user_item
  ON market_purchases(kick_user_id, item_id);

-- Starter shelf. Prices sit next to what a daily case pays out.
INSERT INTO market_items (title, note, price_coins, image, sort_order, hidden, created_at, updated_at)
SELECT 'Brass Bell', 'A brass bell from the cabinet.', 40, '/img/cabinet/bell.webp',
  1, 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM market_items);

INSERT INTO market_items (title, note, price_coins, image, sort_order, hidden, created_at, updated_at)
SELECT 'Cabinet Star', 'A star from the cabinet.', 90, '/img/cabinet/star.webp',
  2, 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE (SELECT COUNT(*) FROM market_items) = 1;

INSERT INTO market_items (title, note, price_coins, image, sort_order, hidden, created_at, updated_at)
SELECT 'Cut Gem', 'A cut gem from the cabinet.', 180, '/img/cabinet/gem.webp',
  3, 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE (SELECT COUNT(*) FROM market_items) = 2;

INSERT INTO market_items (title, note, price_coins, image, sort_order, hidden, created_at, updated_at)
SELECT 'Gold Crown', 'A gold crown from the cabinet.', 320, '/img/cabinet/crown.webp',
  4, 0, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE (SELECT COUNT(*) FROM market_items) = 3;
