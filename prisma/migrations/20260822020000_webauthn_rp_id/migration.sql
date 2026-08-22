-- Dominio de cada credencial biométrica.
--
-- Una credencial WebAuthn vale SOLO en el dominio donde se registró. Al mudar
-- la app a otro dominio, las viejas dejan de servir — y sin este dato la app no
-- podía distinguirlas, así que seguía ofreciendo «Entrar con huella» para
-- después fallar con «no hay llaves de acceso».
--
-- Las filas existentes se marcan con el dominio de siempre: es el único que ha
-- existido, así que la afirmación es cierta, no una suposición.

ALTER TABLE "WebAuthnCredential" ADD COLUMN "rpId" TEXT;

UPDATE "WebAuthnCredential" SET "rpId" = 'app.adrianluna.mx' WHERE "rpId" IS NULL;

CREATE INDEX "WebAuthnCredential_userId_rpId_idx" ON "WebAuthnCredential"("userId", "rpId");
