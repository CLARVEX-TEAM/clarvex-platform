// Respuesta CSS ficticia para compilar sin Google Fonts en las pruebas aisladas.
// No valida la apariencia tipográfica y nunca se configura en producción.
module.exports = new Proxy({}, {
  get(_target, url) {
    if (typeof url !== "string" || !url.startsWith("https://fonts.googleapis.com/css2?family=Geist:")) {
      throw new Error("Fuente no prevista en la prueba aislada");
    }
    return "@font-face { font-family: 'Geist'; src: local('Arial'); font-style: normal; font-weight: 100 900; }";
  }
});
