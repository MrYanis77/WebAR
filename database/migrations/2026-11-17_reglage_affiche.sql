-- Animation d'affiche : position (devant / au-dessus) et taille par rapport à l'affiche (base existante).
-- mysql -u root webar < database/migrations/2026-11-17_reglage_affiche.sql
ALTER TABLE animation
  ADD COLUMN affiche_position ENUM('DEVANT','DESSUS') NOT NULL DEFAULT 'DEVANT' AFTER position_taille_m,
  ADD COLUMN affiche_taille   DECIMAL(3,1) NOT NULL DEFAULT 1.5 COMMENT 'Taille du modèle en hauteurs d’affiche' AFTER affiche_position,
  ADD CONSTRAINT ck_animation_affiche_taille CHECK (affiche_taille BETWEEN 0.3 AND 5);
