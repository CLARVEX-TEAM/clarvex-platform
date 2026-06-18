// Logros del asesor calculados desde su historial de KPIs (sin base de datos).
// Pura y testeable; no toca la lógica de KPIs ni comisiones.

export type Achievement = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
};

type AchievementKpi = {
  date?: string;
  dailySales: number;
  dailyGoal: number;
  monthlySales: number;
  monthlyGoal: number;
  upt: number;
  ranking: number;
};

export function computeAchievements(input: {
  userKpis: AchievementKpi[];
  todayKey: string;
  streakBest: number;
}): Achievement[] {
  const worked = input.userKpis.filter((k) => k.dailyGoal > 0 && (k.date ?? "") <= input.todayKey);
  const daysMetGoal = worked.filter((k) => k.dailySales >= k.dailyGoal).length;
  const bestDayPct = worked.reduce((max, k) => Math.max(max, k.dailyGoal > 0 ? k.dailySales / k.dailyGoal : 0), 0);
  const rankings = input.userKpis.map((k) => k.ranking).filter((r) => r > 0);
  const bestRank = rankings.length ? Math.min(...rankings) : 0;
  const monthDone = input.userKpis.some((k) => k.monthlyGoal > 0 && k.monthlySales >= k.monthlyGoal);
  const maxUpt = input.userKpis.reduce((max, k) => Math.max(max, k.upt ?? 0), 0);

  const def: Array<Omit<Achievement, "unlocked"> & { unlocked: boolean }> = [
    { id: "primera-meta", emoji: "🎯", title: "Primera meta", description: "Cumple tu meta diaria una vez", unlocked: daysMetGoal >= 1 },
    { id: "cinco-metas", emoji: "🖐️", title: "5 metas", description: "Cumple 5 días tu meta", unlocked: daysMetGoal >= 5 },
    { id: "diez-metas", emoji: "💪", title: "10 metas", description: "Cumple 10 días tu meta", unlocked: daysMetGoal >= 10 },
    { id: "racha-3", emoji: "🔥", title: "En racha", description: "3 días seguidos cumpliendo meta", unlocked: input.streakBest >= 3 },
    { id: "racha-7", emoji: "⚡", title: "Imparable", description: "7 días seguidos cumpliendo meta", unlocked: input.streakBest >= 7 },
    { id: "racha-14", emoji: "🚀", title: "En llamas", description: "14 días seguidos cumpliendo meta", unlocked: input.streakBest >= 14 },
    { id: "sobre-meta", emoji: "📈", title: "Sobre meta", description: "Llega al 120% en un día", unlocked: bestDayPct >= 1.2 },
    { id: "mes-cumplido", emoji: "💯", title: "Mes cumplido", description: "Alcanza tu meta mensual", unlocked: monthDone },
    { id: "top-3", emoji: "🏅", title: "Top 3", description: "Quedar entre los 3 mejores", unlocked: bestRank > 0 && bestRank <= 3 },
    { id: "lider", emoji: "👑", title: "Líder", description: "Llegar al #1 del ranking", unlocked: bestRank === 1 },
    { id: "upt-pro", emoji: "🛍️", title: "UPT Pro", description: "Alcanza un UPT de 2 o más", unlocked: maxUpt >= 2 }
  ];

  return def;
}
