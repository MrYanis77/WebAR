-- Dossiers de la bibliothèque « Fichiers 3D & sons » : on range ensemble l'affiche, son modèle 3D et son
-- son pour les associer plus facilement. Un dossier est un simple nom partagé par ses fichiers.
-- mysql -u root webar < database/migrations/2026-11-21_dossiers_fichiers.sql
ALTER TABLE fichier
  ADD COLUMN dossier VARCHAR(80) NULL DEFAULT NULL COMMENT 'Dossier de rangement (affiche, modèle 3D, son)' AFTER nom_original,
  ADD INDEX ix_fichier_dossier (proprietaire_id, dossier);
