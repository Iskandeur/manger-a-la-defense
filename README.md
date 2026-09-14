# Où manger à La Défense ?

**→ [iskandeur.github.io/manger-a-la-defense](https://iskandeur.github.io/manger-a-la-defense/)**

Il est 12 h 25, tu es au 27ᵉ étage, tu as trente-cinq minutes et aucune idée. C'est le problème que
cette page résout : **321 adresses** de la dalle et des rues autour, filtrées par ce qui est
**ouvert maintenant**, trié par **distance à pied depuis ta tour**.

- 🟢 **Ouvert maintenant**, calculé depuis les horaires OpenStreetMap, réévalué chaque minute.
- 📍 **Depuis où tu es** : choisis ton repère (Grande Arche, CNIT, Cœur Défense, Tour First…) ou
  laisse le GPS faire. Chaque adresse affiche sa distance, son temps de marche et sa direction.
- 🥖 **Par type** — restaurant, sur le pouce, boulangerie, café, bar — et **par envie** : japonais,
  burger, italien, poké, libanais…
- ☀️ **Par critère** : terrasse, végé, halal, à emporter, accès PMR, Wi-Fi.
- 🎲 **Décide pour moi** — parce que le vrai problème du midi, c'est de trancher.

Une seule page HTML. Pas de compte, pas de cookie, pas de traceur, pas de classement sponsorisé.
Tout le calcul se fait dans ton navigateur ; le seul appel réseau sortant est celui des tuiles de la
carte, et uniquement si tu ouvres la carte.

## Ce que ces données ne savent pas

C'est important, alors c'est écrit dans la page aussi :

- **114 adresses sur 321 portent des horaires** dans OpenStreetMap. Les autres s'affichent
  « horaires inconnus » — elles ne sont pas fermées, on ne sait simplement pas. Le filtre
  « ouvert maintenant » les garde donc visibles, signalées comme telles.
- Les horaires viennent de la carte, **pas du restaurant** : un jour férié, des congés ou un
  changement récent ne s'y voient pas.
- **Aucun prix, aucune note, aucun avis.** OSM n'en porte quasiment jamais, et je préfère ne rien
  afficher plutôt que d'inventer un classement.
- Les distances sont **à vol d'oiseau**, converties à 5 km/h. Sur la dalle, ajoute un escalator.

Une erreur, une fermeture, un manquant ? [Corrige-le dans OpenStreetMap](https://www.openstreetmap.org/) —
chaque fiche a un lien « ✏️ Corriger » qui pointe directement le bon objet. Ça profite à tout le
monde, et ça remonte ici à la prochaine extraction.

## Refaire les données

```bash
# 1. extraction Overpass (l'API publique renvoie souvent 504 : les retries sont là pour ça)
curl -sS --fail --retry 12 --retry-all-errors --retry-delay 12 \
  -X POST https://overpass-api.de/api/interpreter \
  --data-urlencode "data@src/overpass.txt" -o src/raw.json

node src/build-data.ts   # raw.json  → data.json (nettoyage, dédoublonnage, distances aux repères)
node src/test-hours.ts   # l'évaluateur d'horaires OSM, sur cas construits + les 114 chaînes réelles
node src/build.ts        # data.json + template.html → index.html autoportant
node src/test-app.ts     # fait tourner l'app dans un faux DOM : filtres, tri, rendu, échappement
```

Zéro dépendance, Node ≥ 22 suffit.

## Licence

Les **données** viennent d'[OpenStreetMap](https://www.openstreetmap.org/copyright) et restent sous
**ODbL**. Le **code** est sous licence MIT — sers-t'en, adapte-le à ton quartier d'affaires.

Fait par **Lupi** 🐺
