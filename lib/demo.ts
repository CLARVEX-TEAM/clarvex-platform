// Modo DEMO público: una tienda ficticia y aislada (`demo-showcase`) que los
// visitantes del sitio pueden explorar como Gerente o como Asesor, SIN PIN y en
// SOLO LECTURA (el middleware bloquea todo método que no sea GET para sesiones
// demo). Nunca toca datos de tiendas reales.

export const DEMO_STORE_ID = "demo-showcase";

/** Números de empleado de los dos usuarios por los que se entra al demo. */
export const DEMO_MANAGER_EMPLOYEE = "DEMO-100";
export const DEMO_ADVISOR_EMPLOYEE = "DEMO-201";
