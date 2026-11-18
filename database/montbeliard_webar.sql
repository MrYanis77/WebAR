-- =============================================================================
--  Montbéliard Expériences — base de données MySQL / MariaDB
--  Compatible MySQL 8.0.16+ / 8.4 LTS et MariaDB 10.4+ (XAMPP).
--
--  Reprend les tables du cahier des charges technique (section 7), adaptées à
--  l'application réalisée :
--    - affiches importées par les éditeurs (plus de modèles d'affiche de la Ville),
--      avec format d'impression et position du QR code ;
--    - score détaillé du stade, nom court et catégorie des lieux ;
--    - transcription FR/EN/DE des animations (accessibilité) ;
--    - décisions liées à plusieurs signalements regroupés ;
--    - suppression refusée tant qu'un contenu en dépend (ON DELETE RESTRICT).
--
--  Les fichiers (images, GLB, sons, .mind, PDF) sont stockés dans uploads/ :
--  la base ne garde que leur chemin.
--
--  Utilisation :  mysql -u root -p < database/webar.sql
-- =============================================================================

DROP DATABASE IF EXISTS webar;
CREATE DATABASE webar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE webar;

SET NAMES utf8mb4;
SET time_zone = '+01:00';  -- heure de Paris (hiver) ; l'API convertit en Europe/Paris

-- -----------------------------------------------------------------------------
-- Comptes, sessions, partenaires
-- -----------------------------------------------------------------------------

CREATE TABLE compte (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email               VARCHAR(255) NOT NULL,
  mot_de_passe_hash   VARCHAR(255) NOT NULL COMMENT 'Hachage Argon2id',
  role                ENUM('AGENT','PARTENAIRE') NOT NULL,
  statut              ENUM('EN_ATTENTE','VERIFIE','REFUSE','SUSPENDU') NOT NULL DEFAULT 'EN_ATTENTE'
                      COMMENT 'Compte inactif tant que non vérifié (BF-34)',
  motif_statut        VARCHAR(500) NULL COMMENT 'Motif de refus ou de suspension',
  nom_affiche         VARCHAR(100) NOT NULL COMMENT 'Nom de la personne (agent) ou du contact',
  totp_secret         VARCHAR(255) NULL COMMENT 'Secret TOTP chiffré (agents, BNF-10)',
  echecs_connexion    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Blocage après 5 échecs',
  bloque_jusqua       DATETIME NULL,
  derniere_connexion  DATETIME NULL COMMENT 'Purge des comptes inactifs',
  cree_le             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_compte_email (email),
  KEY ix_compte_role_statut (role, statut),
  CONSTRAINT ck_compte_totp CHECK (role = 'PARTENAIRE' OR statut <> 'VERIFIE' OR totp_secret IS NOT NULL)
) ENGINE=InnoDB COMMENT='Agents de la mairie et partenaires';

-- Table attendue par express-mysql-session.
CREATE TABLE session (
  session_id  VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  expires     INT UNSIGNED NOT NULL,
  data        MEDIUMTEXT NULL,
  PRIMARY KEY (session_id)
) ENGINE=InnoDB;

CREATE TABLE partenaire (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  compte_id          INT UNSIGNED NOT NULL,
  nom_structure      VARCHAR(150) NOT NULL,
  secteur            VARCHAR(100) NOT NULL,
  adresse            VARCHAR(255) NOT NULL,
  contact_telephone  VARCHAR(20) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_partenaire_compte (compte_id),
  CONSTRAINT fk_partenaire_compte FOREIGN KEY (compte_id) REFERENCES compte (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Données limitées au nécessaire (BNF-20)';

CREATE TABLE acceptation_charte (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  compte_id       INT UNSIGNED NOT NULL,
  version_charte  VARCHAR(20) NOT NULL,
  acceptee_le     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_charte_compte_version (compte_id, version_charte),
  CONSTRAINT fk_charte_compte FOREIGN KEY (compte_id) REFERENCES compte (id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='Version de la charte acceptée (BF-41)';

-- -----------------------------------------------------------------------------
-- Fichiers importés (contrôle automatique, BF-36, BNF-19)
-- -----------------------------------------------------------------------------

CREATE TABLE fichier (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  proprietaire_id   INT UNSIGNED NOT NULL,
  type              ENUM('MODELE_3D','SON','IMAGE') NOT NULL,
  usage_fichier     ENUM('AFFICHE','LIEU') NULL COMMENT 'Budget appliqué : affiche 4 Mo / 30 000 triangles, lieu 10 Mo / 100 000',
  nom_original      VARCHAR(255) NOT NULL,
  chemin            VARCHAR(255) NOT NULL COMMENT 'Fichier optimisé, nom généré par le serveur',
  chemin_original   VARCHAR(255) NULL,
  type_mime         VARCHAR(100) NOT NULL,
  taille_octets     INT UNSIGNED NOT NULL,
  largeur_px        SMALLINT UNSIGNED NULL COMMENT 'Image',
  hauteur_px        SMALLINT UNSIGNED NULL COMMENT 'Image',
  nb_triangles      INT UNSIGNED NULL COMMENT 'Modèle 3D',
  texture_max_px    SMALLINT UNSIGNED NULL COMMENT 'Modèle 3D',
  duree_s           DECIMAL(6,2) NULL COMMENT 'Son',
  statut_controle   ENUM('EN_COURS','CONFORME','REFUSE') NOT NULL DEFAULT 'EN_COURS',
  raison_refus      VARCHAR(500) NULL,
  cree_le           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fichier_chemin (chemin),
  KEY ix_fichier_proprietaire (proprietaire_id, type),
  CONSTRAINT fk_fichier_proprietaire FOREIGN KEY (proprietaire_id) REFERENCES compte (id) ON DELETE RESTRICT,
  CONSTRAINT ck_fichier_mime CHECK (type_mime IN ('model/gltf-binary','audio/mpeg','audio/mp4','audio/aac','image/png','image/jpeg','image/webp')),
  CONSTRAINT ck_fichier_refus CHECK (statut_controle <> 'REFUSE' OR raison_refus IS NOT NULL)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Lieux, cibles de reconnaissance, zones d'affichage
-- -----------------------------------------------------------------------------

CREATE TABLE lieu (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nom               VARCHAR(150) NOT NULL,
  nom_court         VARCHAR(20) NOT NULL COMMENT 'Marqueur de la carte',
  categorie_fr      VARCHAR(80) NOT NULL,
  categorie_en      VARCHAR(80) NULL,
  categorie_de      VARCHAR(80) NULL,
  adresse           VARCHAR(255) NOT NULL,
  description_fr    TEXT NOT NULL,
  description_en    TEXT NULL,
  description_de    TEXT NULL,
  latitude          DECIMAL(9,6) NOT NULL,
  longitude         DECIMAL(9,6) NOT NULL,
  rayon_m           SMALLINT UNSIGNED NOT NULL DEFAULT 50 COMMENT 'Rayon de proximité (BF-08)',
  visuel_id         INT UNSIGNED NULL COMMENT 'Image de la fiche',
  acces_libre       BOOLEAN NOT NULL DEFAULT TRUE,
  -- Score du match (Stade uniquement, BF-52)
  equipe_domicile   VARCHAR(30) NULL,
  equipe_exterieur  VARCHAR(30) NULL,
  score_domicile    TINYINT UNSIGNED NULL,
  score_exterieur   TINYINT UNSIGNED NULL,
  competition       VARCHAR(80) NULL,
  etat_match        VARCHAR(40) NULL COMMENT 'Ex. « 90:00 · Victoire »',
  score_maj_le      DATETIME NULL,
  actif             BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Visible sur la carte des visiteurs',
  cree_le           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_lieu_actif (actif),
  CONSTRAINT fk_lieu_visuel FOREIGN KEY (visuel_id) REFERENCES fichier (id) ON DELETE SET NULL,
  CONSTRAINT ck_lieu_rayon CHECK (rayon_m BETWEEN 20 AND 500),
  CONSTRAINT ck_lieu_coord CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB COMMENT='Un nouveau lieu s’ajoute sans modifier le code (BNF-13)';

-- Photos de détails de façade (jour / nuit), compilées en une cible .mind.
CREATE TABLE photo_facade (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lieu_id     INT UNSIGNED NOT NULL,
  fichier_id  INT UNSIGNED NOT NULL,
  moment      ENUM('JOUR','NUIT') NOT NULL DEFAULT 'JOUR',
  detail      VARCHAR(80) NULL COMMENT 'Entrée, tour, logo…',
  PRIMARY KEY (id),
  CONSTRAINT fk_photo_lieu FOREIGN KEY (lieu_id) REFERENCES lieu (id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_fichier FOREIGN KEY (fichier_id) REFERENCES fichier (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE cible (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lieu_id          INT UNSIGNED NULL COMMENT 'Rempli pour une façade ; vide pour une affiche',
  chemin_mind      VARCHAR(255) NOT NULL COMMENT 'Fichier .mind compilé (MindAR)',
  orientation_deg  SMALLINT UNSIGNED NULL COMMENT 'Direction de la façade (0 à 359°)',
  cree_le          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_cible_lieu FOREIGN KEY (lieu_id) REFERENCES lieu (id) ON DELETE CASCADE,
  CONSTRAINT ck_cible_orientation CHECK (orientation_deg IS NULL OR orientation_deg < 360)
) ENGINE=InnoDB;

CREATE TABLE zone_affichage (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nom        VARCHAR(150) NOT NULL,
  adresse    VARCHAR(255) NOT NULL,
  latitude   DECIMAL(9,6) NULL,
  longitude  DECIMAL(9,6) NULL,
  format_max ENUM('A4','A3','A2','A1','A0') NOT NULL DEFAULT 'A2',
  regles     TEXT NULL COMMENT 'Règles d’affichage de la Ville',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Animations et affiches
-- -----------------------------------------------------------------------------

CREATE TABLE animation (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  proprietaire_id   INT UNSIGNED NOT NULL,
  titre             VARCHAR(120) NOT NULL,
  type              ENUM('AFFICHE','LIEU') NOT NULL,
  lieu_id           INT UNSIGNED NULL COMMENT 'Obligatoire si type LIEU',
  modele_id         INT UNSIGNED NOT NULL COMMENT 'Modèle 3D (GLB)',
  son_id            INT UNSIGNED NULL,
  declencheur       ENUM('AFFICHE','MONUMENT','MANUEL') NOT NULL,
  duree_s           SMALLINT UNSIGNED NOT NULL,
  debut             DATETIME NOT NULL COMMENT 'Date de sortie',
  fin               DATETIME NULL COMMENT 'Vide : animation permanente',
  statut            ENUM('BROUILLON','PUBLIEE','SUSPENDUE','RETIREE') NOT NULL DEFAULT 'BROUILLON',
  transcription_fr  TEXT NOT NULL COMMENT 'Transcription du son (BNF-11)',
  transcription_en  TEXT NULL,
  transcription_de  TEXT NULL,
  cree_le           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_animation_diffusion (statut, debut, fin),
  KEY ix_animation_lieu (lieu_id),
  CONSTRAINT fk_animation_proprietaire FOREIGN KEY (proprietaire_id) REFERENCES compte (id) ON DELETE RESTRICT,
  CONSTRAINT fk_animation_lieu FOREIGN KEY (lieu_id) REFERENCES lieu (id) ON DELETE RESTRICT,
  CONSTRAINT fk_animation_modele FOREIGN KEY (modele_id) REFERENCES fichier (id) ON DELETE RESTRICT,
  CONSTRAINT fk_animation_son FOREIGN KEY (son_id) REFERENCES fichier (id) ON DELETE SET NULL,
  CONSTRAINT ck_animation_lieu CHECK (type = 'AFFICHE' OR lieu_id IS NOT NULL),
  CONSTRAINT ck_animation_declencheur CHECK ((type = 'AFFICHE') = (declencheur = 'AFFICHE')),
  CONSTRAINT ck_animation_dates CHECK (fin IS NULL OR fin > debut),
  CONSTRAINT ck_animation_duree CHECK (duree_s BETWEEN 5 AND 1800)
) ENGINE=InnoDB;

CREATE TABLE affiche (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  proprietaire_id       INT UNSIGNED NOT NULL,
  image_id              INT UNSIGNED NOT NULL COMMENT 'Affiche importée (PNG, JPEG, WebP)',
  cible_id              INT UNSIGNED NULL COMMENT 'Cible .mind compilée depuis l’image',
  animation_affiche_id  INT UNSIGNED NOT NULL COMMENT 'Animation qui sort de l’affiche',
  animation_lieu_id     INT UNSIGNED NOT NULL COMMENT 'Animation de lieu promue (BF-31)',
  nom                   VARCHAR(60) NOT NULL,
  accroche              VARCHAR(40) NULL,
  texte                 VARCHAR(300) NOT NULL COMMENT 'Texte montré au visiteur après l’animation',
  code_qr               CHAR(22) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '128 bits aléatoires (base64url), URL /a/<code>',
  format                ENUM('A4','A3','A2','A1','A0') NOT NULL DEFAULT 'A3',
  qr_x                  DECIMAL(5,4) NOT NULL DEFAULT 0.7400 COMMENT 'Position du QR : fraction de la largeur',
  qr_y                  DECIMAL(5,4) NOT NULL DEFAULT 0.7600 COMMENT 'Position du QR : fraction de la hauteur',
  qr_taille             DECIMAL(5,4) NOT NULL DEFAULT 0.2000 COMMENT 'Largeur du QR : fraction de la largeur',
  qr_fond               BOOLEAN NOT NULL DEFAULT TRUE,
  qr_mention            BOOLEAN NOT NULL DEFAULT TRUE,
  zone_id               INT UNSIGNED NULL COMMENT 'Zone attribuée par la mairie (BF-40)',
  zone_proposee_id      INT UNSIGNED NULL COMMENT 'Zone proposée par le partenaire',
  debut                 DATETIME NOT NULL,
  fin                   DATETIME NOT NULL,
  statut                ENUM('BROUILLON','PUBLIEE','SUSPENDUE','RETIREE') NOT NULL DEFAULT 'BROUILLON',
  chemin_pdf            VARCHAR(255) NULL COMMENT 'Affiche prête à imprimer, QR code incrusté',
  cree_le               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_affiche_code_qr (code_qr),
  UNIQUE KEY uk_affiche_cible (cible_id),
  KEY ix_affiche_proprietaire (proprietaire_id),
  KEY ix_affiche_diffusion (statut, debut, fin),
  CONSTRAINT fk_affiche_proprietaire FOREIGN KEY (proprietaire_id) REFERENCES compte (id) ON DELETE RESTRICT,
  CONSTRAINT fk_affiche_image FOREIGN KEY (image_id) REFERENCES fichier (id) ON DELETE RESTRICT,
  CONSTRAINT fk_affiche_cible FOREIGN KEY (cible_id) REFERENCES cible (id) ON DELETE SET NULL,
  -- Une animation utilisée par une affiche ne peut pas être supprimée.
  CONSTRAINT fk_affiche_anim_affiche FOREIGN KEY (animation_affiche_id) REFERENCES animation (id) ON DELETE RESTRICT,
  CONSTRAINT fk_affiche_anim_lieu FOREIGN KEY (animation_lieu_id) REFERENCES animation (id) ON DELETE RESTRICT,
  CONSTRAINT fk_affiche_zone FOREIGN KEY (zone_id) REFERENCES zone_affichage (id) ON DELETE SET NULL,
  CONSTRAINT fk_affiche_zone_proposee FOREIGN KEY (zone_proposee_id) REFERENCES zone_affichage (id) ON DELETE SET NULL,
  CONSTRAINT ck_affiche_dates CHECK (fin > debut),
  CONSTRAINT ck_affiche_qr CHECK (qr_taille BETWEEN 0.05 AND 0.40 AND qr_x BETWEEN 0 AND 1 - qr_taille AND qr_y BETWEEN 0 AND 1),
  CONSTRAINT ck_affiche_code CHECK (CHAR_LENGTH(code_qr) = 22)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Signalements anonymes et décisions (BF-45 à BF-51)
-- -----------------------------------------------------------------------------

CREATE TABLE signalement (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  affiche_id    INT UNSIGNED NULL,
  animation_id  INT UNSIGNED NULL,
  motif         ENUM('ILLICITE','TROMPEUR','CHOQUANT','PARTISAN','ATTEINTE_DROITS','AUTRE') NOT NULL,
  commentaire   VARCHAR(500) NULL COMMENT 'Texte brut, obligatoire si AUTRE',
  statut        ENUM('NOUVEAU','EN_COURS','TRAITE') NOT NULL DEFAULT 'NOUVEAU',
  cree_le       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Aucune identité ni adresse IP (BNF-24)',
  PRIMARY KEY (id),
  KEY ix_signalement_file (statut, cree_le),
  KEY ix_signalement_affiche (affiche_id),
  KEY ix_signalement_animation (animation_id),
  CONSTRAINT fk_signalement_affiche FOREIGN KEY (affiche_id) REFERENCES affiche (id) ON DELETE CASCADE,
  CONSTRAINT fk_signalement_animation FOREIGN KEY (animation_id) REFERENCES animation (id) ON DELETE CASCADE,
  CONSTRAINT ck_signalement_cible CHECK ((affiche_id IS NULL) <> (animation_id IS NULL)),
  CONSTRAINT ck_signalement_commentaire CHECK (motif <> 'AUTRE' OR (commentaire IS NOT NULL AND CHAR_LENGTH(TRIM(commentaire)) > 0))
) ENGINE=InnoDB;

CREATE TABLE decision (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agent_id            INT UNSIGNED NOT NULL,
  contenu_type        ENUM('AFFICHE','ANIMATION','FICHIER','COMPTE') NOT NULL,
  affiche_id          INT UNSIGNED NULL,
  animation_id        INT UNSIGNED NULL,
  fichier_id          INT UNSIGNED NULL,
  compte_vise_id      INT UNSIGNED NULL,
  action              ENUM('MAINTENIR','SUSPENDRE','SUPPRIMER','REACTIVER') NOT NULL,
  motif               VARCHAR(500) NOT NULL COMMENT 'Transmis au partenaire (BF-49)',
  decide_le           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reponse_partenaire  VARCHAR(1000) NULL,
  reexamen_demande    BOOLEAN NOT NULL DEFAULT FALSE,
  reexamen_clos_le    DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_decision_reexamen (reexamen_demande),
  CONSTRAINT fk_decision_agent FOREIGN KEY (agent_id) REFERENCES compte (id) ON DELETE RESTRICT,
  CONSTRAINT fk_decision_affiche FOREIGN KEY (affiche_id) REFERENCES affiche (id) ON DELETE SET NULL,
  CONSTRAINT fk_decision_animation FOREIGN KEY (animation_id) REFERENCES animation (id) ON DELETE SET NULL,
  CONSTRAINT fk_decision_fichier FOREIGN KEY (fichier_id) REFERENCES fichier (id) ON DELETE SET NULL,
  CONSTRAINT fk_decision_compte FOREIGN KEY (compte_vise_id) REFERENCES compte (id) ON DELETE SET NULL,
  CONSTRAINT ck_decision_motif CHECK (CHAR_LENGTH(TRIM(motif)) >= 5)
) ENGINE=InnoDB;

-- Une décision clôt l'ensemble des signalements regroupés sur un même contenu.
CREATE TABLE decision_signalement (
  decision_id     INT UNSIGNED NOT NULL,
  signalement_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (decision_id, signalement_id),
  CONSTRAINT fk_ds_decision FOREIGN KEY (decision_id) REFERENCES decision (id) ON DELETE CASCADE,
  CONSTRAINT fk_ds_signalement FOREIGN KEY (signalement_id) REFERENCES signalement (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Journal et statistiques anonymes
-- -----------------------------------------------------------------------------

CREATE TABLE journal (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  auteur_id       INT UNSIGNED NULL COMMENT 'Vide pour un signalement anonyme ou le système',
  auteur_libelle  VARCHAR(150) NOT NULL COMMENT 'Nom affiché (conservé si le compte est supprimé)',
  action          VARCHAR(50) NOT NULL COMMENT 'Ex. INSCRIPTION, ZONE_ATTRIBUEE, DECISION_SUSPENDRE, SUPPRESSION',
  objet_type      VARCHAR(30) NOT NULL,
  objet_id        INT UNSIGNED NULL,
  objet_libelle   VARCHAR(150) NOT NULL,
  details         JSON NULL,
  cree_le         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_journal_date (cree_le),
  KEY ix_journal_action (action),
  CONSTRAINT fk_journal_auteur FOREIGN KEY (auteur_id) REFERENCES compte (id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Traçabilité de toutes les étapes (BNF-17)';

CREATE TABLE statistique (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type          ENUM('SCAN','LANCEMENT') NOT NULL,
  affiche_id    INT UNSIGNED NULL,
  animation_id  INT UNSIGNED NULL,
  declencheur   ENUM('AFFICHE','MONUMENT','MANUEL') NULL COMMENT 'Pour un lancement',
  heure         DATETIME NOT NULL COMMENT 'Arrondie à l’heure, aucun identifiant',
  PRIMARY KEY (id),
  KEY ix_stat_heure (heure, type),
  KEY ix_stat_affiche (affiche_id, type),
  KEY ix_stat_animation (animation_id, type),
  CONSTRAINT fk_stat_affiche FOREIGN KEY (affiche_id) REFERENCES affiche (id) ON DELETE SET NULL,
  CONSTRAINT fk_stat_animation FOREIGN KEY (animation_id) REFERENCES animation (id) ON DELETE SET NULL,
  CONSTRAINT ck_stat_heure CHECK (MINUTE(heure) = 0 AND SECOND(heure) = 0)
) ENGINE=InnoDB;

-- =============================================================================
-- Vues : règles métier lues par l'API
-- =============================================================================

-- Les 4 conditions de publication d'une affiche (BF-42, service reglePublication).
CREATE VIEW v_affiche_conditions AS
SELECT
  a.id AS affiche_id,
  (c.role = 'AGENT' OR c.statut = 'VERIFIE') AS compte_verifie,
  (
    img.statut_controle = 'CONFORME'
    AND m.statut_controle = 'CONFORME'
    AND (an.son_id IS NULL OR s.statut_controle = 'CONFORME')
  ) AS fichiers_conformes,
  (c.role = 'AGENT' OR EXISTS (SELECT 1 FROM acceptation_charte ac WHERE ac.compte_id = c.id)) AS charte_acceptee,
  (a.zone_id IS NOT NULL) AS zone_attribuee
FROM affiche a
JOIN compte c ON c.id = a.proprietaire_id
JOIN fichier img ON img.id = a.image_id
JOIN animation an ON an.id = a.animation_affiche_id
JOIN fichier m ON m.id = an.modele_id
LEFT JOIN fichier s ON s.id = an.son_id;

CREATE VIEW v_affiche_publiable AS
SELECT
  v.*,
  (v.compte_verifie AND v.fichiers_conformes AND v.charte_acceptee AND v.zone_attribuee) AS publiable
FROM v_affiche_conditions v;

-- Ce que renvoie GET /public/affiches/:code : affiches diffusées en ce moment.
CREATE VIEW v_affiche_diffusee AS
SELECT a.*
FROM affiche a
JOIN v_affiche_publiable p ON p.affiche_id = a.id
JOIN compte c ON c.id = a.proprietaire_id
WHERE a.statut = 'PUBLIEE'
  AND p.publiable
  AND c.statut <> 'SUSPENDU'
  AND NOW() BETWEEN a.debut AND a.fin;

-- Animations actives (BF-22) : publiées et dans leur période de validité.
CREATE VIEW v_animation_active AS
SELECT an.*
FROM animation an
LEFT JOIN lieu l ON l.id = an.lieu_id
WHERE an.statut = 'PUBLIEE'
  AND an.debut <= NOW()
  AND (an.fin IS NULL OR an.fin >= NOW())
  AND (an.lieu_id IS NULL OR l.actif);

-- File des signalements regroupés par contenu, avec compteur (BF-48).
CREATE VIEW v_signalement_groupe AS
SELECT
  IF(s.affiche_id IS NOT NULL, 'AFFICHE', 'ANIMATION') AS contenu_type,
  COALESCE(s.affiche_id, s.animation_id) AS contenu_id,
  COALESCE(af.nom, an.titre) AS contenu_nom,
  COALESCE(af.proprietaire_id, an.proprietaire_id) AS proprietaire_id,
  COUNT(*) AS nb_signalements,
  SUM(s.statut <> 'TRAITE') AS nb_ouverts,
  MAX(s.cree_le) AS dernier_le,
  CASE
    WHEN SUM(s.statut = 'NOUVEAU') > 0 THEN 'NOUVEAU'
    WHEN SUM(s.statut = 'EN_COURS') > 0 THEN 'EN_COURS'
    ELSE 'TRAITE'
  END AS statut
FROM signalement s
LEFT JOIN affiche af ON af.id = s.affiche_id
LEFT JOIN animation an ON an.id = s.animation_id
GROUP BY contenu_type, contenu_id, contenu_nom, proprietaire_id;

-- =============================================================================
-- Données de démonstration (identiques à celles de l'application)
-- Mots de passe : hachages Argon2id à générer par l'API (npm run seed) ;
-- les valeurs ci-dessous sont des marqueurs qui empêchent toute connexion.
-- =============================================================================

INSERT INTO compte (id, email, mot_de_passe_hash, role, statut, motif_statut, nom_affiche, totp_secret, cree_le) VALUES
  (1, 'c.martin@montbeliard.fr',      '$argon2id$A_GENERER', 'AGENT',      'VERIFIE',    NULL, 'Claire Martin',  'A_GENERER_CHIFFRE', '2026-08-01 09:00:00'),
  (2, 'contact@ot-montbeliard.test',  '$argon2id$A_GENERER', 'PARTENAIRE', 'VERIFIE',    NULL, 'Sophie Girard',  NULL, '2026-09-10 08:30:00'),
  (3, 'hugo@festival-momes.test',     '$argon2id$A_GENERER', 'PARTENAIRE', 'VERIFIE',    NULL, 'Hugo Perrin',    NULL, '2026-09-28 16:45:00'),
  (4, 'bureau@marche-noel.test',      '$argon2id$A_GENERER', 'PARTENAIRE', 'VERIFIE',    NULL, 'Nadia Lefèvre',  NULL, '2026-10-14 11:00:00'),
  (5, 'thomas@pages-or.test',         '$argon2id$A_GENERER', 'PARTENAIRE', 'EN_ATTENTE', NULL, 'Thomas Roy',     NULL, '2026-11-07 18:20:00'),
  (6, 'ines@brasserie-faubourg.test', '$argon2id$A_GENERER', 'PARTENAIRE', 'EN_ATTENTE', NULL, 'Inès Morel',     NULL, '2026-11-08 09:05:00'),
  (7, 'paul@escape-w.test',           '$argon2id$A_GENERER', 'PARTENAIRE', 'SUSPENDU',   'Affiche contenant un lien promotionnel externe non autorisé (charte §4).', 'Paul Henry', NULL, '2026-09-18 10:00:00');

INSERT INTO partenaire (id, compte_id, nom_structure, secteur, adresse, contact_telephone) VALUES
  (1, 2, 'Office de Tourisme',       'Tourisme',      '1 rue Henri Mouhot, Montbéliard',        '03 81 00 00 01'),
  (2, 3, 'Festival des Mômes',       'Événementiel',  '8 rue de Belfort, Montbéliard',          '03 81 00 00 02'),
  (3, 4, 'Marché de Noël',           'Association',   'Place Denfert-Rochereau, Montbéliard',   NULL),
  (4, 5, 'Librairie Les Pages d’Or', 'Commerce',      '22 rue des Febvres, Montbéliard',        '03 81 00 00 04'),
  (5, 6, 'Brasserie du Faubourg',    'Restauration',  '5 faubourg de Besançon, Montbéliard',    NULL),
  (6, 7, 'Escape Wurtemberg',        'Autre',         '3 rue Cuvier, Montbéliard',              NULL);

INSERT INTO acceptation_charte (compte_id, version_charte, acceptee_le) VALUES
  (2, '1.0', '2026-09-12 10:00:00'),
  (3, '1.0', '2026-10-02 14:12:00'),
  (4, '1.0', '2026-10-15 09:00:00'),
  (7, '1.0', '2026-09-20 10:00:00');

INSERT INTO fichier (id, proprietaire_id, type, usage_fichier, nom_original, chemin, type_mime, taille_octets, largeur_px, hauteur_px, nb_triangles, texture_max_px, duree_s, statut_controle, raison_refus, cree_le) VALUES
  (1,  1, 'MODELE_3D', 'AFFICHE', 'porte-du-temps.glb',   'uploads/3d/porte-du-temps-1.glb',   'model/gltf-binary', 3350000,  NULL, NULL, 24800,  1024, NULL, 'CONFORME', NULL, '2026-10-29 10:00:00'),
  (2,  1, 'MODELE_3D', 'LIEU',    'legende-lumieres.glb', 'uploads/3d/legende-lumieres-2.glb', 'model/gltf-binary', 8400000,  NULL, NULL, 84000,  2048, NULL, 'CONFORME', NULL, '2026-10-20 10:00:00'),
  (3,  1, 'MODELE_3D', 'LIEU',    'bonal-en-fete.glb',    'uploads/3d/bonal-en-fete-3.glb',    'model/gltf-binary', 7900000,  NULL, NULL, 92000,  2048, NULL, 'CONFORME', NULL, '2026-08-10 10:00:00'),
  (4,  1, 'MODELE_3D', 'LIEU',    'jardins-du-temps.glb', 'uploads/3d/jardins-du-temps-4.glb', 'model/gltf-binary', 12600000, NULL, NULL, 126000, 4096, NULL, 'REFUSE',
       'Poids 12,6 Mo (max. 10 Mo) · 126 000 triangles (max. 100 000) · texture 4096 px (max. 2048 px)', '2026-11-02 11:00:00'),
  (5,  1, 'SON',       'LIEU',    'cloches-noel.mp3',     'uploads/sons/cloches-noel-5.mp3',   'audio/mpeg', 820000,  NULL, NULL, NULL, NULL, 42.00, 'CONFORME', NULL, '2026-10-20 10:05:00'),
  (6,  1, 'SON',       'LIEU',    'ambiance-stade.m4a',   'uploads/sons/ambiance-stade-6.m4a', 'audio/mp4',  1600000, NULL, NULL, NULL, NULL, 75.00, 'CONFORME', NULL, '2026-08-10 10:05:00'),
  (7,  3, 'MODELE_3D', 'AFFICHE', 'mascotte-momes.glb',   'uploads/3d/mascotte-momes-7.glb',   'model/gltf-binary', 2100000, NULL, NULL, 18000, 1024, NULL, 'CONFORME', NULL, '2026-11-03 14:00:00'),
  (8,  3, 'SON',       'AFFICHE', 'fanfare.mp3',          'uploads/sons/fanfare-8.mp3',        'audio/mpeg', 610000,  NULL, NULL, NULL, NULL, 15.00, 'EN_COURS', NULL, '2026-11-09 08:58:00'),
  (9,  4, 'MODELE_3D', 'AFFICHE', 'chalets.glb',          'uploads/3d/chalets-9.glb',          'model/gltf-binary', 2800000, NULL, NULL, 21500, 1024, NULL, 'CONFORME', NULL, '2026-11-04 09:00:00'),
  -- Fichiers des affiches importées
  (10, 1, 'IMAGE', NULL, 'noel-au-chateau.jpg',   'uploads/affiches/noel-au-chateau-10.jpg',   'image/jpeg', 2400000, 3508, 4961, NULL, NULL, NULL, 'CONFORME', NULL, '2026-10-30 09:50:00'),
  (11, 3, 'IMAGE', NULL, 'festival-des-momes.png','uploads/affiches/festival-des-momes-11.png','image/png',  5100000, 3508, 4961, NULL, NULL, NULL, 'CONFORME', NULL, '2026-11-09 08:40:00'),
  (12, 4, 'IMAGE', NULL, 'marche-de-noel.jpg',    'uploads/affiches/marche-de-noel-12.jpg',    'image/jpeg', 1900000, 4961, 3508, NULL, NULL, NULL, 'CONFORME', NULL, '2026-11-04 09:20:00'),
  (13, 1, 'IMAGE', NULL, 'bonal-en-fete.jpg',     'uploads/affiches/bonal-en-fete-13.jpg',     'image/jpeg', 2700000, 3508, 4961, NULL, NULL, NULL, 'CONFORME', NULL, '2026-08-14 15:30:00');

INSERT INTO lieu (id, nom, nom_court, categorie_fr, categorie_en, categorie_de, adresse, description_fr, description_en, description_de, latitude, longitude, rayon_m,
                  equipe_domicile, equipe_exterieur, score_domicile, score_exterieur, competition, etat_match, score_maj_le, actif) VALUES
  (1, 'Château des Ducs de Wurtemberg', 'Château', 'Patrimoine & histoire', 'Heritage & history', 'Erbe & Geschichte', 'Cour du Château, Montbéliard',
   'Dominant la ville depuis son éperon rocheux, le château témoigne de quatre siècles de présence des ducs de Wurtemberg à Montbéliard. Ses deux tours rondes, la tour Henriette et la tour Frédéric, abritent aujourd’hui le musée.',
   'Overlooking the town from its rocky spur, the castle bears witness to four centuries of the Dukes of Württemberg in Montbéliard. Its two round towers, Henriette and Frédéric, now house the museum.',
   'Das Schloss thront auf seinem Felsvorsprung über der Stadt und zeugt von vier Jahrhunderten württembergischer Herzöge in Mömpelgard. Seine beiden Rundtürme beherbergen heute das Museum.',
   47.509690, 6.798520, 50, NULL, NULL, NULL, NULL, NULL, NULL, NULL, TRUE),
  (2, 'Stade Auguste-Bonal', 'Stade Bonal', 'Sport & émotions', 'Sport & emotions', 'Sport & Emotionen', 'Impasse de la Forge, Montbéliard',
   'Inauguré en 1931, le stade Bonal est le théâtre historique du FC Sochaux-Montbéliard et de ses plus grandes émotions sportives. L’animation affiche le score du dernier match en direct.',
   'Opened in 1931, Stade Bonal is the historic home of FC Sochaux-Montbéliard and its greatest sporting moments. The animation shows the latest match score live.',
   'Das 1931 eröffnete Stade Bonal ist die historische Heimat des FC Sochaux-Montbéliard. Die Animation zeigt den Spielstand des letzten Spiels live.',
   47.512220, 6.811110, 80, 'FCSM', 'ASNL', 2, 1, 'Championnat National', '90:00 · Victoire', '2026-11-08 21:52:00', TRUE),
  (3, 'Parc du Près-la-Rose', 'Près-la-Rose', 'Nature & sciences', 'Nature & science', 'Natur & Wissenschaft', 'Rue du Près-la-Rose, Montbéliard',
   'Parc scientifique au bord de l’Allan, le Près-la-Rose mêle jardins, sculptures et expériences ludiques autour des sciences.',
   'A science park on the banks of the Allan, mixing gardens, sculptures and playful experiments.',
   'Ein Wissenschaftspark am Ufer der Allan mit Gärten, Skulpturen und spielerischen Experimenten.',
   47.504600, 6.803700, 60, NULL, NULL, NULL, NULL, NULL, NULL, NULL, FALSE);

INSERT INTO cible (id, lieu_id, chemin_mind, orientation_deg) VALUES
  (1, 1, 'uploads/cibles/chateau-facade.mind', 205),
  (2, 2, 'uploads/cibles/stade-facade.mind',   120),
  (3, NULL, 'uploads/cibles/affiche-1.mind', NULL),
  (4, NULL, 'uploads/cibles/affiche-2.mind', NULL),
  (5, NULL, 'uploads/cibles/affiche-3.mind', NULL),
  (6, NULL, 'uploads/cibles/affiche-4.mind', NULL);

INSERT INTO zone_affichage (id, nom, adresse, latitude, longitude, format_max, regles, active) VALUES
  (1, 'Place Saint-Martin — panneau 1', 'Place Saint-Martin',  47.509400, 6.799300, 'A2', 'Format A2 maximum. Pas d’affichage sur la façade du temple (secteur protégé).', TRUE),
  (2, 'Rue de la Schliffe — vitrine 4', 'Rue de la Schliffe',  47.507900, 6.797100, 'A3', 'Vitrine municipale, format A3. Durée maximale 6 semaines.', TRUE),
  (3, 'Gare — hall voyageurs',          'Place de la Gare',    47.510300, 6.803400, 'A2', 'Accord SNCF requis. Format A2.', TRUE),
  (4, 'Esplanade du stade — totem',     'Impasse de la Forge', 47.511300, 6.809400, 'A1', 'Réservé aux événements sportifs et culturels. Format A1.', TRUE),
  (5, 'Près-la-Rose — entrée nord',     'Rue du Près-la-Rose', 47.505500, 6.803100, 'A2', 'Panneau extérieur, affiche plastifiée obligatoire.', FALSE);

INSERT INTO animation (id, proprietaire_id, titre, type, lieu_id, modele_id, son_id, declencheur, duree_s, debut, fin, statut, transcription_fr, transcription_en, transcription_de) VALUES
  (1, 1, 'Le réveil des Ducs', 'LIEU', 1, 2, 5, 'MONUMENT', 420, '2026-09-01 10:00:00', NULL, 'PUBLIEE',
   'Roulement de tambours. Les bannières des Wurtemberg se déploient sur les tours tandis qu’une voix raconte l’arrivée du duc Frédéric en 1581.',
   'Drum roll. The Württemberg banners unfurl on the towers while a voice tells of Duke Frederick’s arrival in 1581.',
   'Trommelwirbel. Die württembergischen Banner entfalten sich an den Türmen, während eine Stimme von der Ankunft Herzog Friedrichs 1581 erzählt.'),
  (2, 1, 'La légende des lumières', 'LIEU', 1, 2, 5, 'MONUMENT', 720, '2026-12-01 17:30:00', '2027-01-05 23:00:00', 'PUBLIEE',
   'Carillon de Noël. Une arche de lumière dorée s’élève au-dessus de la porte du château, la neige tombe et le conteur ouvre la légende.',
   'Christmas chimes. A golden arch of light rises above the castle gate, snow falls and the storyteller begins the legend.',
   'Weihnachtsglocken. Ein goldener Lichtbogen erhebt sich über dem Schlosstor, Schnee fällt und der Erzähler beginnt die Legende.'),
  (3, 1, 'Bonal en fête', 'LIEU', 2, 3, 6, 'MONUMENT', 300, '2026-08-15 09:00:00', NULL, 'PUBLIEE',
   'Clameur de la foule. Le logo du club tourne au-dessus de la tribune et le tableau d’affichage révèle le score du dernier match.',
   'Crowd roar. The club logo spins above the stand and the scoreboard reveals the latest match score.',
   'Jubel der Menge. Das Vereinslogo dreht sich über der Tribüne und die Anzeigetafel zeigt den letzten Spielstand.'),
  (4, 1, 'Les jardins du temps', 'LIEU', 3, 4, NULL, 'MONUMENT', 480, '2027-04-01 10:00:00', '2027-09-30 20:00:00', 'BROUILLON',
   'Chants d’oiseaux et bruissement des feuilles.', 'Birdsong and rustling leaves.', 'Vogelgesang und Blätterrauschen.'),
  (5, 1, 'La porte du temps — Teaser 3D', 'AFFICHE', NULL, 1, 5, 'AFFICHE', 20, '2026-11-01 00:00:00', '2027-01-05 23:00:00', 'PUBLIEE',
   'Une porte de pierre s’ouvre dans l’affiche ; des flocons lumineux s’en échappent.',
   'A stone door opens in the poster; glowing snowflakes escape from it.',
   'Ein Steintor öffnet sich im Plakat; leuchtende Schneeflocken entweichen.'),
  (6, 3, 'La mascotte des Mômes', 'AFFICHE', NULL, 7, 8, 'AFFICHE', 15, '2026-11-01 00:00:00', '2027-08-31 23:00:00', 'PUBLIEE',
   'Fanfare joyeuse. La mascotte saute hors de l’affiche et salue.',
   'Cheerful brass band. The mascot jumps out of the poster and waves.',
   'Fröhliche Blaskapelle. Das Maskottchen springt aus dem Plakat und winkt.'),
  (7, 4, 'Flocons du marché', 'AFFICHE', NULL, 9, NULL, 'AFFICHE', 18, '2026-11-01 00:00:00', '2026-12-31 23:00:00', 'PUBLIEE',
   'Musique de boîte à musique ; des chalets miniatures s’illuminent.',
   'Music-box melody; miniature chalets light up.',
   'Spieluhrmelodie; Miniaturhütten leuchten auf.');

INSERT INTO affiche (id, proprietaire_id, image_id, cible_id, animation_affiche_id, animation_lieu_id, nom, accroche, texte, code_qr, format,
                     qr_x, qr_y, qr_taille, qr_fond, qr_mention, zone_id, zone_proposee_id, debut, fin, statut) VALUES
  (1, 1, 10, 3, 5, 2, 'Noël au château', 'Montbéliard présente',
   'Une histoire prend vie. Spectacle en réalité augmentée chaque soir du 1er décembre au 5 janvier.',
   'Nq3XkL9pWz2Vb7Rt1Mc5yA', 'A2', 0.7400, 0.7600, 0.2000, TRUE, TRUE, 1, NULL, '2026-11-01 00:00:00', '2027-01-05 23:00:00', 'PUBLIEE'),
  (2, 3, 11, 4, 6, 1, 'Festival des Mômes', 'Été 2027',
   'Trois jours de spectacles pour toute la famille au pied du château.',
   'Fm8TqP2zLx4Hn6Wd0Ks3vB', 'A3', 0.0400, 0.7600, 0.2000, TRUE, TRUE, NULL, 2, '2026-12-01 00:00:00', '2027-08-31 23:00:00', 'BROUILLON'),
  (3, 4, 12, 5, 7, 2, 'Marché de Noël', 'Lumières de Noël',
   '150 chalets, place Denfert-Rochereau, du 28 novembre au 24 décembre.',
   'Mk2RvT7yQa9Ze4Lp1Xb6nC', 'A3', 0.7600, 0.6800, 0.1800, TRUE, FALSE, 2, NULL, '2026-11-01 00:00:00', '2026-12-31 23:00:00', 'PUBLIEE'),
  (4, 1, 13, 6, 5, 3, 'Bonal en fête', 'Saison 2026–2027',
   'Vivez chaque match en réalité augmentée devant le stade.',
   'Bf5YwN3kPs8Gd2Hq7Tz0jD', 'A1', 0.7400, 0.7600, 0.2000, TRUE, TRUE, 4, NULL, '2026-08-15 00:00:00', '2027-06-30 23:00:00', 'PUBLIEE');

INSERT INTO signalement (id, affiche_id, animation_id, motif, commentaire, statut, cree_le) VALUES
  (1, 3, NULL, 'TROMPEUR', 'Les dates annoncées ne correspondent pas au programme officiel du marché.', 'NOUVEAU', '2026-11-08 17:42:00'),
  (2, 3, NULL, 'TROMPEUR', 'Le nombre de chalets annoncé semble faux.', 'NOUVEAU', '2026-11-08 19:03:00'),
  (3, NULL, 6, 'CHOQUANT', 'Le son démarre très fort et a fait peur à mon enfant.', 'EN_COURS', '2026-11-07 15:20:00'),
  (4, 4, NULL, 'AUTRE', 'Le QR code semblait renvoyer vers une page vide, mais cela fonctionne en réessayant.', 'TRAITE', '2026-10-21 12:10:00');

INSERT INTO decision (id, agent_id, contenu_type, affiche_id, compte_vise_id, action, motif, decide_le, reponse_partenaire, reexamen_demande) VALUES
  (1, 1, 'AFFICHE', 4, NULL, 'MAINTENIR', 'Contenu conforme ; problème réseau ponctuel sans lien avec l’affiche.', '2026-10-21 15:00:00', NULL, FALSE),
  (2, 1, 'COMPTE', NULL, 7, 'SUSPENDRE', 'Affiche contenant un lien promotionnel externe non autorisé (charte §4).', '2026-10-30 11:30:00',
   'Nous avons retiré le lien, merci de réexaminer notre compte.', TRUE);

INSERT INTO decision_signalement (decision_id, signalement_id) VALUES (1, 4);

INSERT INTO journal (auteur_id, auteur_libelle, action, objet_type, objet_id, objet_libelle, details, cree_le) VALUES
  (1,    'Claire Martin',            'SUSPENSION',      'Compte',    7, 'Escape Wurtemberg',        JSON_OBJECT('motif', 'Lien externe non autorisé'), '2026-10-30 11:30:00.000'),
  (1,    'Claire Martin',            'ZONE_ATTRIBUEE',  'Affiche',   3, 'Marché de Noël',           JSON_OBJECT('zone', 'Rue de la Schliffe — vitrine 4'), '2026-11-04 09:10:00.000'),
  (4,    'Marché de Noël',           'PUBLICATION',     'Affiche',   3, 'Marché de Noël',           NULL, '2026-11-04 09:30:00.000'),
  (1,    'Claire Martin',            'PUBLICATION',     'Animation', 2, 'La légende des lumières',  JSON_OBJECT('debut', '2026-12-01', 'fin', '2027-01-05'), '2026-11-05 15:40:00.000'),
  (NULL, 'Visiteur anonyme',         'SIGNALEMENT',     'Animation', 6, 'La mascotte des Mômes',    JSON_OBJECT('motif', 'CHOQUANT'), '2026-11-07 15:20:00.000'),
  (5,    'Librairie Les Pages d’Or', 'INSCRIPTION',     'Compte',    5, 'Librairie Les Pages d’Or', NULL, '2026-11-07 18:20:00.000'),
  (6,    'Brasserie du Faubourg',    'INSCRIPTION',     'Compte',    6, 'Brasserie du Faubourg',    NULL, '2026-11-08 09:05:00.000'),
  (NULL, 'Visiteur anonyme',         'SIGNALEMENT',     'Affiche',   3, 'Marché de Noël',           JSON_OBJECT('motif', 'TROMPEUR'), '2026-11-08 17:42:00.000'),
  (NULL, 'Visiteur anonyme',         'SIGNALEMENT',     'Affiche',   3, 'Marché de Noël',           JSON_OBJECT('motif', 'TROMPEUR'), '2026-11-08 19:03:00.000'),
  (1,    'Claire Martin',            'SCORE_MAJ',       'Lieu',      2, 'Stade Auguste-Bonal',      JSON_OBJECT('score', 'FCSM 2 – 1 ASNL'), '2026-11-08 21:52:00.000'),
  (3,    'Festival des Mômes',       'IMPORT_FICHIER',  'Fichier',   8, 'fanfare.mp3',              JSON_OBJECT('controle', 'lancé'), '2026-11-09 08:58:00.000');

INSERT INTO statistique (type, affiche_id, animation_id, declencheur, heure) VALUES
  ('SCAN',      1, NULL, NULL,       '2026-11-08 17:00:00'),
  ('LANCEMENT', 1, 5,    'AFFICHE',  '2026-11-08 17:00:00'),
  ('SCAN',      4, NULL, NULL,       '2026-11-08 20:00:00'),
  ('LANCEMENT', NULL, 3, 'MONUMENT', '2026-11-08 21:00:00'),
  ('LANCEMENT', NULL, 1, 'MANUEL',   '2026-11-09 10:00:00');

-- =============================================================================
-- Compte applicatif aux droits limités (sécurité, section 8) — à adapter
-- =============================================================================
-- CREATE USER 'webar_api'@'localhost' IDENTIFIED BY '<mot de passe fort>';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON webar.* TO 'webar_api'@'localhost';
