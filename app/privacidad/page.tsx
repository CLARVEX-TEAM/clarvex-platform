import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Aviso de Privacidad · CLARVEX Team",
  description: "Aviso de privacidad integral de CLARVEX Team."
};

// NOTA PARA EL RESPONSABLE: este aviso es una base conforme a la LFPDPPP y su
// Reglamento. Antes de publicarlo, complete los datos entre [corchetes] y
// hágalo revisar por su área legal. Actualice la fecha al final ante cualquier
// cambio.
export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-volt">
        <ArrowLeft size={16} /> Volver
      </Link>

      <article className="space-y-5 text-[15px] leading-7 text-ink">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Aviso de Privacidad</h1>
          <p className="text-sm font-semibold text-muted">CLARVEX Team</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. Responsable de sus datos personales</h2>
          <p>
            CLARVEX, representada por su representante legal Jesús Adrián Hernández Luna (en adelante, “el
            Responsable”), con domicilio en Loma Alta 164, Las Lomas Residencial, Nuevo León, es responsable del
            tratamiento de los datos personales que se recaban a través de la aplicación CLARVEX Team, conforme a
            la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), su
            Reglamento y demás normativa aplicable.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. Datos personales que se recaban</h2>
          <p>Para el funcionamiento de la aplicación se tratan las siguientes categorías de datos:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li><span className="font-bold text-ink">Identificación:</span> nombre, número de empleado, fotografía de perfil, fecha de nacimiento y fecha de ingreso.</li>
            <li><span className="font-bold text-ink">Autenticación:</span> un PIN de acceso (que se almacena cifrado, nunca en texto claro) y, de forma opcional, una credencial biométrica. La biometría (huella o rostro) <span className="font-bold text-ink">no sale de su dispositivo</span>: la aplicación solo guarda una clave pública para verificar el acceso.</li>
            <li><span className="font-bold text-ink">Laborales y de desempeño:</span> ventas, metas, indicadores (KPIs), comisiones, horarios, asistencia, tareas y pendientes, evidencias fotográficas, comunicados, encuestas, reconocimientos y mensajes del chat interno.</li>
            <li><span className="font-bold text-ink">Técnicos:</span> la suscripción para notificaciones push y la dirección IP, usada únicamente para limitar intentos de acceso y proteger la cuenta.</li>
          </ul>
          <p>No se recaban datos personales sensibles distintos a los aquí señalados.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Finalidades del tratamiento</h2>
          <p><span className="font-bold">Finalidades primarias</span> (necesarias para la relación laboral y el uso de la app):</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Operación diaria de la tienda: planes, horarios, pendientes y comunicación interna.</li>
            <li>Gestión y visualización del desempeño individual y de equipo.</li>
            <li>Cálculo y consulta de comisiones.</li>
            <li>Autenticación y seguridad del acceso a la cuenta.</li>
          </ul>
          <p>No se realiza tratamiento con finalidades secundarias (mercadotecnia, publicidad o prospección comercial).</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. Transferencias y encargados</h2>
          <p>
            Sus datos se alojan con proveedores de infraestructura que actúan como encargados del tratamiento
            (por ejemplo, servicios de hospedaje y de almacenamiento en la nube). Estos proveedores tratan los
            datos únicamente por cuenta del Responsable y conforme a este aviso.
            <span className="font-bold"> El Responsable no vende ni comercializa sus datos personales.</span>
            No se realizan transferencias que requieran su consentimiento conforme al artículo 37 de la LFPDPPP,
            salvo las exigidas por autoridad competente.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. Derechos ARCO y revocación</h2>
          <p>
            Usted puede ejercer sus derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO), así como
            revocar su consentimiento, enviando una solicitud a contacto@clarvex.adrianluna.mx. La solicitud
            deberá indicar su nombre, número de empleado y una descripción clara de los datos o el derecho que
            desea ejercer. El Responsable dará respuesta en los plazos que marca la LFPDPPP.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">6. Tecnologías de rastreo</h2>
          <p>
            La aplicación utiliza una cookie de sesión estrictamente necesaria para mantener su acceso, y
            notificaciones push que solo se activan si usted las autoriza en su dispositivo. No se emplean
            cookies publicitarias ni herramientas de analítica de terceros.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. Cambios al aviso</h2>
          <p>
            Este aviso puede actualizarse. Cualquier modificación se reflejará en esta misma página, indicando la
            fecha de última actualización.
          </p>
        </section>

        <p className="pt-2 text-sm font-semibold text-muted">Última actualización: 4 de julio de 2026.</p>
      </article>
    </main>
  );
}
