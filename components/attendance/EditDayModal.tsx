"use client";

import { useState } from "react";
import type { AttendanceStatus } from "@/lib/attendance";
import { dayLabel, STATUS_LABEL, type AttendanceRecord } from "@/lib/attendance-view";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AppSelect } from "@/components/forms";
import { Capa } from "@/components/Capa";

export const EDITABLE_STATUSES: AttendanceStatus[] = ["ON_TIME", "LATE", "ABSENT", "EXCUSED", "REST", "VACATION", "PAID_DAY", "INVENTORY"];

/**
 * Corrección manual de un día. Va a nómina, así que se audita en el servidor y a
 * partir de aquí el archivo ya no la pisa (source=MANUAL). El saldo del banco de
 * horas se recalcula solo de la entrada/salida capturadas.
 */
export function EditDayModal({ record, name, onClose, onSaved }: { record: AttendanceRecord; name: string; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<AttendanceStatus>(record.status);
  const [arrivedAt, setArrivedAt] = useState(record.arrivedAt ?? "");
  const [leftAt, setLeftAt] = useState(record.leftAt ?? "");
  const [note, setNote] = useState(record.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: record.userId,
          date: record.date,
          status,
          arrivedAt: arrivedAt || null,
          leftAt: leftAt || null,
          note: note.trim() || null
        })
      });
      if (!response.ok) {
        const detail = await response.json().then((d: { error?: string }) => d.error).catch(() => null);
        throw new Error(detail ?? "No se pudo guardar la corrección.");
      }
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la corrección.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "min-h-11 w-full rounded-2xl border border-line bg-panel px-3 text-sm font-bold text-ink outline-hidden focus:border-volt";

  return (
    /* ⚠️ En `Capa` --portal al `body`-- o la barra de abajo lo tapa: dentro de
       una pantalla, un `fixed` queda atrapado en el contexto de apilamiento
       del envoltorio. El porqué, en `components/Capa.tsx`. */
    <Capa>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-4 sm:items-center" onClick={onClose}>
      <Card className="w-full max-w-sm p-4" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-semibold text-ink">Corregir día</p>
        <p className="mb-3 text-xs font-semibold text-muted">{name} · {dayLabel(record.date)}</p>

        <div className="mb-3">
          <AppSelect
            label="Estatus"
            value={status}
            onChange={(valor) => setStatus(valor as AttendanceStatus)}
            options={EDITABLE_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] ?? value }))}
          />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-xs font-bold text-muted">Entrada</span>
            <input type="time" value={arrivedAt} onChange={(event) => setArrivedAt(event.target.value)} className={inputClass} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-bold text-muted">Salida</span>
            <input type="time" value={leftAt} onChange={(event) => setLeftAt(event.target.value)} className={inputClass} />
          </label>
        </div>

        <label className="mb-3 grid gap-1">
          <span className="text-xs font-bold text-muted">Nota (por qué se corrige)</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="Ej. no marcó salida en el POS" className={inputClass} />
        </label>

        {error ? <p className="mb-2 text-xs font-semibold text-orchid">{error}</p> : null}

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button type="button" variant="primary" onClick={() => void save()} disabled={saving} className="flex-1">
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </Card>
    </div>
    </Capa>
  );
}

