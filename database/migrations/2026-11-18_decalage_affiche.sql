-- Animation d'affiche : déplacement du modèle autour de l'affiche, en mètres, depuis sa position de
-- départ (devant / au-dessus) : x vers la droite, y vers le haut, z vers le visiteur. Le modèle reste
-- dans un rayon de 3 m (le visiteur scanne l'affiche entre 0,5 et 3 m, BNF-05).
-- mysql -u root webar < database/migrations/2026-11-18_decalage_affiche.sql
ALTER TABLE animation
  ADD COLUMN affiche_decalage_x DECIMAL(4,2) NOT NULL DEFAULT 0.00 COMMENT 'Déplacement vers la droite (m)' AFTER affiche_taille,
  ADD COLUMN affiche_decalage_y DECIMAL(4,2) NOT NULL DEFAULT 0.00 COMMENT 'Déplacement vers le haut (m)' AFTER affiche_decalage_x,
  ADD COLUMN affiche_decalage_z DECIMAL(4,2) NOT NULL DEFAULT 0.00 COMMENT 'Déplacement vers le visiteur (m)' AFTER affiche_decalage_y,
  ADD CONSTRAINT ck_animation_affiche_decalage CHECK (
    affiche_decalage_x * affiche_decalage_x + affiche_decalage_y * affiche_decalage_y + affiche_decalage_z * affiche_decalage_z <= 9.1
  );
