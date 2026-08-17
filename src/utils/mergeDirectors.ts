interface DirectorLike {
  name: string;
  photoUrl?: string;
  isPrimaryDirector?: boolean;
}

/**
 * Combina até 2 co-diretores (mesmo cargo de Diretoria) num único nome/card
 * mesclado. O diretor principal (isPrimaryDirector, ver OrgNode) vem sempre
 * primeiro — define a ordem do nome — e o card mostra só a foto DELE (não
 * divide nem cai para a foto do co-diretor): a Diretoria é papel global e o
 * card único não deve depender de qual co-diretor tem uma foto cadastrada.
 */
export function mergeDirectors<T extends DirectorLike>(
  directors: T[],
): { name: string; photoUrl?: string } {
  const sorted = [...directors].sort(
    (a, b) => (b.isPrimaryDirector ? 1 : 0) - (a.isPrimaryDirector ? 1 : 0),
  );
  // Achata nomes que já contenham " & " (dados legados) e remove duplicatas
  const allNames = [...new Set(
    sorted.flatMap(d => d.name.split(/\s+&\s+/).map(n => n.trim()).filter(Boolean)),
  )];
  return {
    name: allNames.join(' & '),
    photoUrl: sorted[0]?.photoUrl,
  };
}
