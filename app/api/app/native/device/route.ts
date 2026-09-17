import { NextResponse } from "next/server";
import { isApiError, requireSession } from "@/lib/api";
import { isNativeDeviceError, requireNativeDevice } from "@/lib/native-device-auth";

export const dynamic = "force-dynamic";

/** Primer endpoint protegido: exige la llave registrada además de la sesión. */
export async function GET(request: Request) {
  const session = await requireSession();
  if (isApiError(session)) return session;
  const device = await requireNativeDevice(request, session);
  if (isNativeDeviceError(device)) return device;

  return NextResponse.json({
    device: {
      installationId: device.installationId,
      profile: device.profile,
      appBuild: device.appBuild,
      appVersion: device.appVersion,
      registered: true
    }
  });
}
