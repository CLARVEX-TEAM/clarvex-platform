/**
 * Cómo va el reparto de la app en la tienda.
 *
 * Vive aparte de la ruta, sin Prisma, para poder probarlo: `lib/prisma` lanza
 * fuera de la configuración de integración y eso hace imposible cubrir con
 * pruebas la lógica que decide quién aparece como al día y quién no. Es la
 * misma razón por la que `lib/attendance-roll-call-plan.ts` está separado.
 */

export type AparatoCrudo = {
  userId: string;
  appBuild: number | null;
  appVersion: string | null;
  updatedAt: Date | string;
};

export type PersonaCruda = { id: string; name: string };

export type EstadoPersona = {
  id: string;
  nombre: string;
  /** `null` cuando no hay ningún aparato suyo registrado. */
  appBuild: number | null;
  appVersion: string | null;
  /** Cuántos aparatos suyos hay. En el celular compartido de tienda hay más de uno. */
  aparatos: number;
  alDia: boolean;
};

export type Reparto = {
  versionPublicada: number | null;
  nombrePublicado: string | null;
  total: number;
  conApp: number;
  alDia: number;
  gente: EstadoPersona[];
};

/**
 * ⚠️ **De cada persona se toma su aparato MÁS NUEVO, no el último registrado.**
 * El teléfono de la tienda lo usan varias personas y cada sesión reescribe el
 * dueño del token: alguien puede tener un aparato viejo sin actualizar y el
 * suyo al día, y ordenar por fecha lo dejaría figurando como atrasado. Lo que
 * se quiere saber es si esa persona PUEDE ver la versión nueva.
 *
 * ⚠️ **Un aparato sin `appBuild` no es «versión cero».** Son los que se
 * registraron antes de que se guardara la versión: cuentan como que tienen la
 * app, pero no como al día, porque no se sabe. Tratarlos como cero los pintaría
 * a todos de atrasados el día del despliegue.
 */
export function resumirReparto({
  gente,
  aparatos,
  versionPublicada,
  nombrePublicado
}: {
  gente: PersonaCruda[];
  aparatos: AparatoCrudo[];
  versionPublicada: number | null;
  nombrePublicado: string | null;
}): Reparto {
  const porPersona = new Map<string, AparatoCrudo[]>();
  for (const aparato of aparatos) {
    const suyos = porPersona.get(aparato.userId);
    if (suyos) suyos.push(aparato);
    else porPersona.set(aparato.userId, [aparato]);
  }

  const estados: EstadoPersona[] = gente.map((persona) => {
    const suyos = porPersona.get(persona.id) ?? [];
    let mejor: AparatoCrudo | null = null;
    for (const aparato of suyos) {
      if (aparato.appBuild === null) continue;
      if (mejor === null || mejor.appBuild === null || aparato.appBuild > mejor.appBuild) mejor = aparato;
    }
    const build = mejor?.appBuild ?? null;
    return {
      id: persona.id,
      nombre: persona.name,
      appBuild: build,
      appVersion: mejor?.appVersion ?? null,
      aparatos: suyos.length,
      // Sin versión publicada no se puede afirmar que nadie esté al día.
      alDia: versionPublicada !== null && build !== null && build >= versionPublicada
    };
  });

  return {
    versionPublicada,
    nombrePublicado,
    total: estados.length,
    conApp: estados.filter((e) => e.aparatos > 0).length,
    alDia: estados.filter((e) => e.alDia).length,
    gente: estados
  };
}
