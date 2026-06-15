-- Comentarios en comunicados: extiende el modelo polimórfico Comment.
ALTER TABLE "Comment" ADD COLUMN "announcementId" TEXT;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Comment_storeId_announcementId_createdAt_idx"
  ON "Comment"("storeId", "announcementId", "createdAt");
