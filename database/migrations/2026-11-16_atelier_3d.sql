-- Atelier 3D : réglages des modèles et optimisation par le serveur (base existante, sans perte de données).
-- mysql -u root webar < database/migrations/2026-11-16_atelier_3d.sql
ALTER TABLE fichier
  ADD COLUMN reglages_3d  JSON NULL COMMENT 'Atelier 3D : échelle, rotation, ancrage, hauteur, vitesse, luminosité' AFTER controle_termine_le,
  ADD COLUMN optimisation JSON NULL COMMENT 'Dernière optimisation glTF-Transform : paramètres, mesures avant/après' AFTER reglages_3d;
