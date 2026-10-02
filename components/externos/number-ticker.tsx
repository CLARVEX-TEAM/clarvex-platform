"use client"

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
// ⚠️ Importado de `framer-motion`, NO de `motion/react` como venia del
// registro. Son la MISMA libreria con dos nombres de paquete: dejarlo como
// llego instalaba una segunda copia de 800 KB para exportar exactamente los
// mismos tres hooks. En un telefono de tienda eso se paga en cada carga.
import { useInView, useMotionValue, useReducedMotion, useSpring } from "framer-motion"

import { cn } from "@/lib/utils"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(direction === "down" ? value : startValue)
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  })
  const isInView = useInView(ref, { once: true, margin: "0px" })

  /*
   * ⚠️ **Con movimiento reducido el número NO cuenta: aparece ya puesto.**
   *
   * Su hermano `shine-border` ya se apagaba solo --usa `motion-safe:`-- y el
   * comentario de `ConteosList` avisaba de que a los demás «hay que frenarlos
   * a mano». Nadie lo hizo, así que en Conteos el avance subía en espiral para
   * todo el mundo, también para quien pidió al sistema que no se moviera nada.
   *
   * Se frena en ORIGEN y no en cada pantalla: así vale igual para el checklist
   * y el escritorio, que también lo usan.
   */
  const reduce = useReducedMotion()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    if (isInView) {
      // Sin espera y sin recorrido: el dato se enseña, que es lo que importa.
      if (reduce) {
        motionValue.jump(direction === "down" ? startValue : value)
      } else {
        timer = setTimeout(() => {
          motionValue.set(direction === "down" ? startValue : value)
        }, delay * 1000)
      }
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [motionValue, isInView, delay, value, direction, startValue, reduce])

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) {
          ref.current.textContent = Intl.NumberFormat("en-US", {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
          }).format(Number(latest.toFixed(decimalPlaces)))
        }
      }),
    [springValue, decimalPlaces]
  )

  return (
    <span
      ref={ref}
      className={cn(
        "inline-block tracking-wider text-black tabular-nums dark:text-white",
        className
      )}
      {...props}
    >
      {startValue}
    </span>
  )
}
