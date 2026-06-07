export function serializeEvidence(item: { id: string; url: string; fileName: string | null; mimeType: string | null; note: string | null; uploadedById: string; createdAt: Date; uploadedBy: { name: string; photoUrl: string | null } }) {
  return { id: item.id, url: item.url, fileName: item.fileName, mimeType: item.mimeType, note: item.note, uploadedById: item.uploadedById, uploadedBy: item.uploadedBy, createdAt: item.createdAt.toISOString() };
}

export function serializeComment(item: { id: string; body: string; authorId: string; createdAt: Date; updatedAt: Date; author: { name: string; photoUrl: string | null } }) {
  return { id: item.id, body: item.body, authorId: item.authorId, author: item.author, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}
