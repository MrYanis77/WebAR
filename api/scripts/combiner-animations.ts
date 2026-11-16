// Ajoute l'animation « toutes ensemble » aux modèles 3D déjà importés qui ont plusieurs animations
// (les nouveaux imports la reçoivent lors du contrôle automatique). Usage : npm run combiner-animations
import { prisma } from '../src/db.js'
import { cheminAbsolu } from '../src/services/stockage.js'
import { ajouterAnimationCombinee } from '../src/traitements/animationCombinee.js'

const modeles = await prisma.fichier.findMany({ where: { type: 'MODELE_3D', nb_clips: { gt: 1 } }, select: { id: true, nom_original: true, chemin: true } })
for (const m of modeles) {
  const taille = await ajouterAnimationCombinee(cheminAbsolu(m.chemin))
  if (taille) await prisma.fichier.update({ where: { id: m.id }, data: { taille_octets: taille } })
  console.log(`${m.nom_original} : ${taille ? 'animation combinée ajoutée' : 'déjà à jour ou fichier compressé'}`)
}
if (!modeles.length) console.log('Aucun modèle à plusieurs animations.')
await prisma.$disconnect()
