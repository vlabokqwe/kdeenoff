-- 0014_kdeenoff_monkey_avatars.sql: Switch leaderboard avatar styles to KDeenOff monkey collector editions.

UPDATE leaderboards
SET avatar_style = 'kdeenoff'
WHERE avatar_style IN ('olympus', 'fun-emoji', 'bottts-neutral', 'auto', '');

UPDATE leaderboards
SET avatar_style = 'kdeenoff-luxe'
WHERE avatar_style = 'olympus-gold';

UPDATE lb_players
SET avatar_url = NULL
WHERE avatar_url LIKE '%dicebear.com%';
