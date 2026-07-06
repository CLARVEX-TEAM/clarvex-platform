"use client";

import { useParams } from "next/navigation";
import { ConteoDetailView } from "@/components/conteos/ConteoDetail";

export default function EscritorioConteoDetallePage() {
  const { id } = useParams<{ id: string }>();
  return <ConteoDetailView countId={id} desktop />;
}
