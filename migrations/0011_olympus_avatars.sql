-- 0011_olympus_avatars.sql: Replace external DiceBear avatars with built-in Olympus medallion generator.

UPDATE leaderboards
SET avatar_style = 'olympus'
WHERE avatar_style IN ('fun-emoji', 'bottts-neutral', 'auto', '');

UPDATE lb_players
SET avatar_url = NULL;
