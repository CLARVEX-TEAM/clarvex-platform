const webpush = require('web-push');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@adrianluna.mx',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
(async () => {
  console.log('VAPID public (12):', (process.env.VAPID_PUBLIC_KEY||'(vacío)').slice(0,12));
  console.log('VAPID private set:', Boolean(process.env.VAPID_PRIVATE_KEY));
  const subs = await prisma.pushSubscription.findMany({ include: { user: { select: { name: true } } } });
  console.log('Suscripciones en DB:', subs.length, '\n');
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: 'Prueba push', body: 'Diagnóstico de notificaciones', tag: 'diagnostico' })
      );
      console.log('OK    ', (s.user?.name||'?').padEnd(28), s.endpoint.slice(0,45));
    } catch (e) {
      console.log('ERROR ', (s.user?.name||'?').padEnd(28), 'status', e.statusCode, '|', String(e.body||e.message||'').slice(0,70));
    }
  }
  await prisma.$disconnect();
})();
