import { ejecutar } from './composio'
import { leerConfig } from './estado'

export type EstadoWhatsapp = 'enviado' | 'sin_conectar' | 'no_acepto' | 'error'

/**
 * Manda la confirmación con una plantilla aprobada de WhatsApp Business. Sin cuenta, número y
 * plantilla configurados no envía nada y lo reporta, para que Marco no prometa algo que no pasó.
 */
export async function enviarConfirmacion(
  env: Env,
  d: { telefono: string; paciente: string; servicio: string; doctor: string; cuando: string },
): Promise<EstadoWhatsapp> {
  const c = await leerConfig(env)
  if (!c.whatsapp_account || !c.whatsapp_phone_id || !c.whatsapp_plantilla || !env.COMPOSIO_API_KEY) return 'sin_conectar'
  try {
    await ejecutar(env, { id: c.whatsapp_account, usuario: c.composio_user_id }, 'WHATSAPP_SEND_TEMPLATE_MESSAGE', {
      phone_number_id: c.whatsapp_phone_id,
      to_number: `52${d.telefono}`,
      template_name: c.whatsapp_plantilla,
      language_code: 'es_MX',
      components: [{
        type: 'body',
        parameters: [d.paciente, d.servicio, d.cuando, d.doctor].map((text) => ({ type: 'text', text })),
      }],
    }, 4000)
    return 'enviado'
  } catch (err) {
    console.error(JSON.stringify({ evento: 'error_whatsapp', error: String(err) }))
    return 'error'
  }
}
