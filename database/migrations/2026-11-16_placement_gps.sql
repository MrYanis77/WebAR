-- Placement GPS en 3D des animations de lieu (base existante, sans perte de données).
-- mysql -u root webar < database/migrations/2026-11-16_placement_gps.sql
ALTER TABLE animation
  ADD COLUMN position_latitude        DECIMAL(9,6) NULL COMMENT 'Position du modèle ; vide = position du lieu' AFTER transcription_de,
  ADD COLUMN position_longitude       DECIMAL(9,6) NULL AFTER position_latitude,
  ADD COLUMN position_hauteur_m       DECIMAL(5,1) NOT NULL DEFAULT 0 COMMENT 'Socle du modèle au-dessus du sol (m)' AFTER position_longitude,
  ADD COLUMN position_orientation_deg SMALLINT UNSIGNED NULL COMMENT 'Cap de la face avant du modèle (0 = nord) ; vide = face au visiteur' AFTER position_hauteur_m,
  ADD COLUMN position_taille_m        DECIMAL(5,1) NOT NULL DEFAULT 10 COMMENT 'Plus grande dimension du modèle (m)' AFTER position_orientation_deg,
  ADD CONSTRAINT ck_animation_position CHECK ((position_latitude IS NULL) = (position_longitude IS NULL)
    AND (position_latitude IS NULL OR (position_latitude BETWEEN -90 AND 90 AND position_longitude BETWEEN -180 AND 180))),
  ADD CONSTRAINT ck_animation_placement CHECK (position_hauteur_m BETWEEN 0 AND 300 AND position_taille_m BETWEEN 0.5 AND 200
    AND (position_orientation_deg IS NULL OR position_orientation_deg < 360));
