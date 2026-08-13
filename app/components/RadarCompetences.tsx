// components/RadarCompetences.tsx

import { View, Text as RNText, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';

type Axe = { label: string; valeur: number }; // valeur normalisée entre 0 et 1

export default function RadarCompetences({ axes, taille = 260 }: { axes: Axe[]; taille?: number }) {
  const centre = taille / 2;
  const rayonMax = taille / 2 - 40; // marge réservée aux labels
  const niveaux = 4;

  if (axes.length < 3) {
    return (
      <View style={[styles.conteneurVide, { width: taille, height: taille }]}>
        <RNText style={styles.texteVide}>
          Ajoute au moins 3 piliers pour afficher le graphique de progression.
        </RNText>
      </View>
    );
  }

  function pointPourAxe(index: number, valeur: number) {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const r = rayonMax * valeur;
    return { x: centre + r * Math.cos(angle), y: centre + r * Math.sin(angle) };
  }

  const pointsDonnees = axes
    .map((axe, i) => {
      const p = pointPourAxe(i, axe.valeur);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <View style={{ width: taille, height: taille }}>
      <Svg width={taille} height={taille}>
        {/* Grille de fond : polygones concentriques */}
        {Array.from({ length: niveaux }).map((_, niveauIndex) => {
          const fraction = (niveauIndex + 1) / niveaux;
          const pointsGrille = axes
            .map((_, i) => {
              const p = pointPourAxe(i, fraction);
              return `${p.x},${p.y}`;
            })
            .join(' ');
          return (
            <Polygon key={niveauIndex} points={pointsGrille} fill="none" stroke="#E7E5E4" strokeWidth={1} />
          );
        })}

        {/* Axes : lignes du centre vers chaque sommet */}
        {axes.map((_, i) => {
          const p = pointPourAxe(i, 1);
          return <Line key={i} x1={centre} y1={centre} x2={p.x} y2={p.y} stroke="#E7E5E4" strokeWidth={1} />;
        })}

        {/* Polygone de données du joueur */}
        <Polygon points={pointsDonnees} fill="#EA580C" fillOpacity={0.25} stroke="#EA580C" strokeWidth={2} />

        {/* Points sur chaque sommet */}
        {axes.map((axe, i) => {
          const p = pointPourAxe(i, axe.valeur);
          return <Circle key={i} cx={p.x} cy={p.y} r={4} fill="#EA580C" />;
        })}

        {/* Labels des piliers, légèrement au-delà du rayon max */}
        {axes.map((axe, i) => {
          const p = pointPourAxe(i, 1.18);
          return (
            <SvgText key={i} x={p.x} y={p.y} fontSize={11} fontWeight="600" fill="#57534E" textAnchor="middle">
              {axe.label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneurVide: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  texteVide: { color: '#78716C', fontSize: 13, textAlign: 'center', fontStyle: 'italic' },
});