# Marco: agente de voz y centro de control para una clínica dental

Marco contesta las llamadas de una clínica dental: agenda, cambia y cancela citas, responde dudas y pasa las urgencias a una persona. Junto a él hay un centro de control para que el dueño vea sus llamadas, grabaciones, costos y velocidad, y pueda ajustarlo sin tocar código.

Todos los datos son ficticios: la Clínica Dental Alborada, sus doctores, precios y pacientes no existen.

## Qué resuelve

| Problema | Con Marco |
|---|---|
| ~80 llamadas al día, 30% se pierden | Contesta todas, las 24 horas |
| Recepción saturada | Resuelve solo citas y preguntas frecuentes |
| 4 doctores con horarios distintos | Un calendario por doctor en una sola cuenta de Google |
| Dobles citas por agenda manual | Candado por doctor antes de crear cada evento |
| Cerrado fuera de horario | Agenda a cualquier hora |

Las cifras son de ejemplo.

## Cómo está armado

```
Paciente → Twilio/SIP → Marco (ElevenLabs: Scribe + Claude Haiku 5.5 + Flash v2.5)
                          │ webhooks /tools/*
                          ▼
                 Cloudflare Worker ── Composio ──> Google Calendar (1 por doctor)
                   │       │                       Google Sheets (base de datos)
                   │       │                       WhatsApp Business
                   │       └── Durable Object: candado, índice, config y bitácora
                   └── Panel React + API /api/* + cron que sincroniza llamadas
```

Una llamada sigue este orden: saluda y detecta el motivo, pide nombre y teléfono, revisa disponibilidad, propone 2 o 3 horarios, agenda en Google Calendar y confirma por WhatsApp.

## El centro de control

- **Resumen:** llamadas, citas, costo, tiempo de respuesta y comparación antes y después.
- **Llamadas:** grabación, transcripción, herramientas usadas, costo y evaluación automática de cada una.
- **Agenda:** vista por doctor, leída directo de Google Calendar.
- **Pacientes** y **Pendientes:** historial y lo que necesita a una persona, con las urgencias primero.
- **Marco:** instrucciones, voz, modelo y límites editables, con prueba de llamada desde el navegador.
- **Conocimiento:** documentos que Marco consulta.
- **Costos y velocidad:** gasto real, proyección al mes y comparación de modelos.
- **Conexiones:** estado de cada pieza e instalación en Google.

## Estructura

| Ruta | Qué contiene |
|---|---|
| `agent/` | Marco: prompt, base de conocimiento, herramientas y ajustes |
| `src/worker/herramientas.ts` | Endpoints que Marco llama durante la llamada |
| `src/worker/agenda.ts` | Disponibilidad y reservas sin dobles citas |
| `src/worker/hoja.ts` | Google Sheets como base de datos |
| `src/worker/composio.ts` | Conexión con Composio |
| `src/worker/sincronizar.ts` | Lleva las llamadas de ElevenLabs a la hoja |
| `src/worker/instalar.ts` | Crea la hoja y los calendarios |
| `src/worker/catalogo.ts` y `demo.ts` | Datos de la clínica y datos de ejemplo |
| `src/app/` | Panel en React |

## Cómo instalarlo

Necesitas cuentas de Cloudflare, ElevenLabs y Composio, con Google Sheets y Google Calendar conectados en Composio.

1. Instala dependencias y prepara las variables locales.

   ```bash
   npm install
   ```

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   ```bash
   npm run types
   ```

2. Crea el agente en ElevenLabs con lo que hay en `agent/`: el prompt, los documentos, los ajustes de `configuracion.json` y las 6 herramientas de `herramientas.json`. En cada herramienta reemplaza `${WORKER_URL}` y `${TOOLS_SECRET}`.

3. Pon el ID de tu agente en `AGENT_ID` dentro de `wrangler.jsonc` y publica.

   ```bash
   npm run deploy
   ```

4. Carga los secretos, uno por uno: `OWNER_PASSWORD`, `SESSION_SECRET`, `TOOLS_SECRET`, `ELEVENLABS_API_KEY` y `COMPOSIO_API_KEY`.

   ```bash
   npx wrangler secret put OWNER_PASSWORD
   ```

5. Entra al panel, abre **Conexiones** y haz clic en **Instalar en Google**.

Sin llave de Composio ni hoja instalada, el panel funciona en vista previa con datos de ejemplo en memoria y lo avisa. Lo que se agenda en ese modo no se guarda en Google.

## Estado

**Probado con Google real y conversaciones reales por texto:** agendar, cambiar, cancelar, urgencias, sincronización a la hoja, grabaciones y costos en el panel, y reservas simultáneas del mismo horario.

**Sin probar o sin conectar:**

- Audio real de micrófono y llamadas por teléfono.
- Transferencia de urgencias a una persona: requiere un número de Twilio o SIP y un teléfono real. Sin ella, Marco deja un pendiente urgente en el panel.
- Confirmación por WhatsApp: el código existe, pero nunca ha enviado un mensaje. Sin conexión, Marco no la promete.
- La API REST de Composio con llaves de proyecto: solo se probó el camino con llaves `ck_`.

## Decisiones

- **Sheets es la base de datos y Calendar la verdad de la agenda.** La hoja se escribe después de crear el evento para no hacer esperar al paciente.
- **Índice en el Durable Object.** Marco no recorre la hoja durante una llamada: pacientes, citas y llamadas también se guardan por teléfono y por día. La hoja sigue siendo la fuente de verdad, y el índice se reconstruye cada hora.
- **Lectura por páginas.** Las llaves `ck_` de Composio solo funcionan por su servidor MCP, que recorta respuestas de más de unos 35 KB.
- **Base de conocimiento en el prompt, sin RAG.** Mientras sea chica responde más rápido y la búsqueda no puede fallar. Si crece mucho, conviene pasarla a RAG.
- **Lo que más cuesta es la voz.** Cerca del 97% del costo de cada llamada. Acortar llamadas ahorra más que cambiar de modelo.
- **Sin tope de tokens en Haiku.** El largo de las respuestas se controla desde el prompt.

## Antes de usarlo con pacientes reales

- Borra los datos de ejemplo: las filas con `es_demo=1` en la hoja y sus eventos en los calendarios.
- Revisa el aviso de privacidad y si Google Sheets es adecuado para guardar datos de salud.
- Define quién atiende las urgencias: Marco promete que el doctor de guardia devuelve la llamada en 15 minutos.

## Licencia

[MIT](LICENSE).
