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
--    - suppression refusée tant qu'un contenu en dépend (ON DELETE RESTRICT) ;
--    - modèles 3D GLB jusqu'à 100 Mo, avec leurs animations intégrées (clips glTF)
--      enregistrées à l'import ; chaque animation choisit le clip à jouer.
--
--  Les fichiers (images, GLB, sons, .mind, PDF) sont stockés dans uploads/ :
--  la base ne garde que leur chemin.
--
--  Le script ne contient aucune donnée : le premier compte agent se crée avec
--  « npm run creer-agent », le reste depuis le back-office.
--
--  Utilisation (base déjà créée, ex. « webar ») :
--    mysql -u root webar < database/montbeliard_webar.sql
--  ou phpMyAdmin > base webar > Importer.
--  ATTENTION : supprime puis recrée les tables et vues de l'application.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS v_signalement_groupe, v_animation_active, v_modele_3d, v_affiche_diffusee, v_affiche_publiable, v_affiche_conditions;
DROP TABLE IF EXISTS statistique, journal, decision_signalement, decision, signalement, affiche, animation,
  zone_affichage, cible, photo_facade, lieu, fichier_clip, fichier, acceptation_charte, partenaire, session, compte;
SET FOREIGN_KEY_CHECKS = 1;

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
  echecs_connexion    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Blocage après 5 échecs',
  bloque_jusqua       DATETIME NULL,
  derniere_connexion  DATETIME NULL COMMENT 'Purge des comptes inactifs',
  cree_le             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_compte_email (email),
  KEY ix_compte_role_statut (role, statut)
) ENGINE=InnoDB COMMENT='Agents de la mairie et partenaires (double authentification des agents : code à usage unique envoyé par mail, conservé dans la session)';

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
  usage_fichier     ENUM('AFFICHE','LIEU') NULL COMMENT 'Budget de complexité : affiche 30 000 triangles, lieu 100 000',
  nom_original      VARCHAR(255) NOT NULL,
  chemin            VARCHAR(255) NOT NULL COMMENT 'Fichier optimisé, nom généré par le serveur',
  chemin_original   VARCHAR(255) NULL,
  type_mime         VARCHAR(100) NOT NULL,
  taille_octets     INT UNSIGNED NOT NULL,
  largeur_px        SMALLINT UNSIGNED NULL COMMENT 'Image',
  hauteur_px        SMALLINT UNSIGNED NULL COMMENT 'Image',
  nb_triangles      INT UNSIGNED NULL COMMENT 'Modèle 3D',
  texture_max_px    SMALLINT UNSIGNED NULL COMMENT 'Modèle 3D',
  nb_clips          SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Modèle 3D : animations intégrées au GLB (voir fichier_clip)',
  duree_s           DECIMAL(6,2) NULL COMMENT 'Son',
  statut_controle   ENUM('EN_COURS','CONFORME','REFUSE') NOT NULL DEFAULT 'EN_COURS',
  raison_refus      VARCHAR(500) NULL,
  controle_termine_le DATETIME NULL COMMENT 'Contrôle automatique terminé : aperçu prêt, en attente de validation',
  cree_le           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fichier_chemin (chemin),
  KEY ix_fichier_proprietaire (proprietaire_id, type),
  CONSTRAINT fk_fichier_proprietaire FOREIGN KEY (proprietaire_id) REFERENCES compte (id) ON DELETE RESTRICT,
  CONSTRAINT ck_fichier_mime CHECK (type_mime IN ('model/gltf-binary','audio/mpeg','audio/mp4','audio/aac','image/png','image/jpeg','image/webp')),
  CONSTRAINT ck_fichier_refus CHECK (statut_controle <> 'REFUSE' OR raison_refus IS NOT NULL),
  -- Tailles maximales (Mo décimaux, comme l'application) : modèle 3D 100 Mo, image 30 Mo, son 2 Mo.
  CONSTRAINT ck_fichier_taille CHECK (
    (type = 'MODELE_3D' AND taille_octets <= 100000000)
    OR (type = 'IMAGE' AND taille_octets <= 30000000)
    OR (type = 'SON' AND taille_octets <= 2000000)
  ),
  CONSTRAINT ck_fichier_clips CHECK (type = 'MODELE_3D' OR nb_clips = 0),
  CONSTRAINT ck_fichier_mime_type CHECK (
    (type = 'MODELE_3D' AND type_mime = 'model/gltf-binary')
    OR (type = 'SON' AND type_mime LIKE 'audio/%')
    OR (type = 'IMAGE' AND type_mime LIKE 'image/%')
  )
) ENGINE=InnoDB;

-- Animations intégrées à un fichier GLB (gltf.animations), lues à l'import.
CREATE TABLE fichier_clip (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fichier_id  INT UNSIGNED NOT NULL,
  indice      SMALLINT UNSIGNED NOT NULL COMMENT 'Position du clip dans le fichier GLB',
  nom         VARCHAR(100) NOT NULL COMMENT 'Nom du clip (ex. « Ouverture », « Idle »)',
  duree_s     DECIMAL(8,3) NOT NULL,
  nb_pistes   SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Pistes animées (positions, rotations, morphs…)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_clip_indice (fichier_id, indice),
  UNIQUE KEY uk_clip_fichier (fichier_id, id) COMMENT 'Cible de la clé composite animation → clip',
  CONSTRAINT fk_clip_fichier FOREIGN KEY (fichier_id) REFERENCES fichier (id) ON DELETE CASCADE,
  CONSTRAINT ck_clip_duree CHECK (duree_s > 0)
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
  clip_id           INT UNSIGNED NULL COMMENT 'Clip du GLB à jouer ; vide = tous les clips du modèle',
  lecture           ENUM('BOUCLE','UNE_FOIS') NOT NULL DEFAULT 'BOUCLE',
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
  -- Le clip doit appartenir au modèle 3D de l'animation (clé composite, ignorée si clip_id est vide).
  CONSTRAINT fk_animation_clip FOREIGN KEY (modele_id, clip_id) REFERENCES fichier_clip (fichier_id, id) ON DELETE RESTRICT,
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
  lieu_id               INT UNSIGNED NOT NULL COMMENT 'Lieu promu : la carte s’ouvre dessus après l’animation (BF-31, BF-32)',
  animation_lieu_id     INT UNSIGNED NULL COMMENT 'Spectacle du lieu mis en avant (facultatif, doit porter sur le lieu promu)',
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
  KEY ix_affiche_lieu (lieu_id),
  CONSTRAINT fk_affiche_proprietaire FOREIGN KEY (proprietaire_id) REFERENCES compte (id) ON DELETE RESTRICT,
  CONSTRAINT fk_affiche_image FOREIGN KEY (image_id) REFERENCES fichier (id) ON DELETE RESTRICT,
  CONSTRAINT fk_affiche_cible FOREIGN KEY (cible_id) REFERENCES cible (id) ON DELETE SET NULL,
  -- Une animation utilisée par une affiche ne peut pas être supprimée.
  CONSTRAINT fk_affiche_anim_affiche FOREIGN KEY (animation_affiche_id) REFERENCES animation (id) ON DELETE RESTRICT,
  CONSTRAINT fk_affiche_anim_lieu FOREIGN KEY (animation_lieu_id) REFERENCES animation (id) ON DELETE RESTRICT,
  -- Un lieu promu par une affiche ne peut pas être supprimé.
  CONSTRAINT fk_affiche_lieu FOREIGN KEY (lieu_id) REFERENCES lieu (id) ON DELETE RESTRICT,
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

-- Modèles 3D avec leurs animations intégrées (bibliothèque du back-office).
CREATE VIEW v_modele_3d AS
SELECT
  f.id, f.proprietaire_id, f.nom_original, f.usage_fichier, f.statut_controle,
  ROUND(f.taille_octets / 1000000, 1) AS taille_mo,
  f.nb_triangles, f.texture_max_px,
  COUNT(c.id) AS nb_clips,
  COALESCE(MAX(c.duree_s), 0) AS duree_max_s,
  GROUP_CONCAT(c.nom ORDER BY c.indice SEPARATOR ', ') AS clips
FROM fichier f
LEFT JOIN fichier_clip c ON c.fichier_id = f.id
WHERE f.type = 'MODELE_3D'
GROUP BY f.id, f.proprietaire_id, f.nom_original, f.usage_fichier, f.statut_controle, f.taille_octets, f.nb_triangles, f.texture_max_px;

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
-- Compte applicatif aux droits limités (sécurité, section 8) — à adapter
-- =============================================================================
-- CREATE USER 'webar_api'@'localhost' IDENTIFIED BY '<mot de passe fort>';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON webar.* TO 'webar_api'@'localhost';
