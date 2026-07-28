/**
 * Contorno EXACTO de la "C" del logo, vectorizado del icono oficial (viewBox 512).
 *
 * Vive aquí y no en cada componente que lo dibuja: SplashIntro y ClarvexIcon lo
 * comparten, así que el logo no puede volver a quedar desincronizado entre una
 * pantalla y otra.
 */
export const CLARVEX_C_PATH =
  "M 256.824 87.486 C 256.084 87.202, 246.708 92.062, 235.989 98.285 C 225.270 104.509, 207.582 114.753, 196.681 121.050 C 185.781 127.348, 161.706 141.310, 143.181 152.079 L 109.500 171.657 109.244 256.800 L 108.989 341.943 112.244 343.616 C 114.035 344.536, 132.375 355.057, 153 366.997 C 173.625 378.936, 196.350 392.076, 203.500 396.196 C 210.650 400.316, 225.159 408.707, 235.742 414.843 C 246.325 420.980, 255.415 426, 255.943 426 C 256.470 426, 283.586 410.561, 316.201 391.690 C 348.815 372.820, 381.256 354.072, 388.290 350.029 C 395.325 345.986, 401.244 342.413, 401.443 342.089 C 401.643 341.765, 394.762 337.484, 386.153 332.576 C 377.544 327.668, 355.969 315.180, 338.208 304.826 C 320.447 294.472, 305.710 286, 305.458 286 C 305.206 286, 305 297.915, 305 312.477 C 305 338.860, 304.992 338.959, 302.750 340.330 C 301.512 341.087, 293.975 345.444, 286 350.012 C 278.025 354.580, 268.222 360.271, 264.215 362.659 C 260.208 365.046, 256.558 367, 256.105 367 C 255.652 367, 245.655 361.454, 233.890 354.676 C 222.126 347.897, 200.912 335.679, 186.750 327.524 L 161 312.696 161 256.534 L 161 200.372 167.250 196.851 C 170.688 194.914, 191.938 182.670, 214.473 169.643 C 238.289 155.876, 256.065 146.195, 256.922 146.523 C 257.733 146.835, 267.668 152.449, 279 159 C 290.332 165.551, 300.368 171.204, 301.302 171.562 C 302.236 171.921, 303 172.742, 303 173.387 C 303 174.032, 296.813 178.123, 289.250 182.478 C 281.688 186.833, 262.043 198.224, 245.597 207.790 C 229.150 217.356, 214.637 225.664, 213.347 226.252 L 211 227.321 211 255.259 L 211 283.198 214.750 280.944 C 216.813 279.704, 220.975 277.263, 224 275.519 C 227.025 273.775, 257.850 255.769, 292.500 235.505 C 327.150 215.242, 360.675 195.646, 367 191.958 C 373.325 188.271, 383.787 182.167, 390.249 178.396 L 401.998 171.538 397.249 168.740 C 394.637 167.201, 388 163.331, 382.500 160.140 C 377 156.949, 357.875 145.868, 340 135.517 C 322.125 125.165, 296.400 110.239, 282.834 102.349 C 269.268 94.458, 257.563 87.770, 256.824 87.486";

/**
 * ClarvexIcon — el logo de la marca.
 *
 * Antes era un dibujo distinto: un círculo con una "C" de arco y una palomita,
 * que no correspondía a la identidad actual. La pantalla de acceso mostraba ese
 * icono viejo mientras el splash, en la misma sesión, ya mostraba el hexágono.
 *
 * `rounded` controla la forma del fondo: cuadrado redondeado (como el icono de
 * la app en el escritorio del teléfono) o sin fondo, para colocarlo sobre una
 * superficie que ya tenga el suyo.
 */
export function ClarvexIcon({
  size = 56,
  rounded = true
}: {
  size?: number;
  /** Fondo azul con esquinas redondeadas. Desactívalo para usar solo la "C". */
  rounded?: boolean;
}) {
  // El id del degradado incluye el tamaño para no colisionar cuando hay varios
  // iconos en la misma página: dos <defs> con el mismo id y el navegador aplica
  // el primero a todos.
  const gradientId = `clarvex-brand-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="CLARVEX"
    >
      {rounded ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="512" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#3F7DFF" />
              <stop offset="1" stopColor="#15316E" />
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="112" fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path d={CLARVEX_C_PATH} fill={rounded ? "#FFFFFF" : "currentColor"} fillRule="evenodd" />
    </svg>
  );
}
