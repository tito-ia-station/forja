# Forja

Pipeline de procesamiento de documentos educativos basado en NestJS. Lee documentos de Directus (finewebstudio), los encola en Redis/BullMQ, los procesa con Ollama y guarda artículos estructurados de vuelta en Directus.

## Arquitectura

```
Directus (fw_documents) → BullMQ (Redis) → Ollama (llama3.2:3b) → Directus (fw_articles)
```

## Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores:

| Variable | Descripción | Default |
|---|---|---|
| `DIRECTUS_URL` | URL del servidor Directus | `http://localhost:8057` |
| `DIRECTUS_TOKEN` | Token de API estático de Directus | — |
| `REDIS_HOST` | Host de Redis | `localhost` |
| `REDIS_PORT` | Puerto de Redis | `6379` |
| `OLLAMA_URL` | URL del servidor Ollama | `http://localhost:11434` |
| `OLLAMA_MODEL` | Modelo a usar en Ollama | `llama3.2:3b` |
| `OLLAMA_TIMEOUT_MS` | Timeout para llamadas a Ollama (ms) | `30000` |
| `WORKER_ROLE` | Rol del worker | `worker` |
| `MIN_EDU_SCORE` | Puntuación mínima para procesar documentos | `4.5` |
| `BATCH_SIZE` | Tamaño de lote al leer de Directus | `50` |
| `PORT` | Puerto de la API REST | `3001` |
| `OPENCLAW_NOTIFY` | Activar alertas via OpenClaw | `true` |
| `ERROR_RATE_THRESHOLD` | Umbral de tasa de error | `0.1` |
| `DLQ_ALERT_THRESHOLD` | Umbral de alertas en Dead Letter Queue | `100` |

## Ejecución local

### Requisitos
- Node.js 20+
- Redis corriendo en localhost:6379
- Directus con colecciones `fw_documents`, `fw_sections`, `fw_articles`
- Ollama con modelo `llama3.2:3b`

### Pasos

```bash
# Clonar e instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Modo desarrollo
npm run start:dev

# Iniciar el procesamiento
curl -X POST http://localhost:3001/queue/start
```

## API REST

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Estado del servicio |
| `POST` | `/queue/start` | Inicia la ingesta de documentos |
| `DELETE` | `/queue/stop` | Vacía la cola |
| `GET` | `/queue/stats` | Estadísticas de la cola |
| `GET` | `/articles` | Lista artículos procesados |
| `GET` | `/articles?status=done` | Filtrar artículos por estado |
| `GET` | `/stats` | Estadísticas completas del pipeline |

## Monitoreo

```bash
# Ver estadísticas en tiempo real
curl http://localhost:3001/stats
```

Respuesta ejemplo:
```json
{
  "queue": { "waiting": 150, "active": 1, "completed": 200, "failed": 3 },
  "dlq": { "count": 3 },
  "processing_rate": "203 docs/hour",
  "eta_minutes": 44,
  "worker_role": "worker",
  "ollama_status": "ok"
}
```

## Despliegue en Dokploy

### 1. Crear el servicio

1. En Dokploy, crear un nuevo servicio de tipo **Application**
2. Conectar el repositorio Git con el código de Forja
3. Seleccionar **Dockerfile** como método de build

### 2. Configurar variables de entorno

En la sección **Environment** del servicio, añadir todas las variables de `.env.example` con los valores de producción:

```
DIRECTUS_URL=https://tu-directus.ejemplo.com
DIRECTUS_TOKEN=tu-token-de-produccion
REDIS_HOST=redis
REDIS_PORT=6379
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2:3b
MIN_EDU_SCORE=4.5
PORT=3001
```

### 3. Configurar Redis como servicio

En Dokploy, añadir un servicio **Redis** y conectarlo a la misma red que Forja. Usar el nombre del servicio (`redis`) como `REDIS_HOST`.

### 4. Escalar workers

Para procesar más rápido, escalar horizontalmente en Dokploy:

1. Ir a **Scaling** del servicio
2. Aumentar el número de réplicas (p.ej. 3-5)
3. Cada réplica actúa como worker independiente con `concurrency=1`

> **Nota:** Con múltiples workers, BullMQ garantiza que cada job es procesado por un solo worker.

### 5. Iniciar el procesamiento

Tras el despliegue:

```bash
curl -X POST https://tu-forja.ejemplo.com/queue/start
```

## Circuit Breaker de Ollama

Si Ollama falla 5 veces consecutivas, el circuit breaker se activa:
- Los jobs nuevos fallan inmediatamente (sin llamar a Ollama)
- Se envía una alerta via OpenClaw
- Para resetear, reiniciar el servicio

## Alertas

Forja envía alertas via `openclaw system event` en estos casos:
- Circuit breaker de Ollama activado
- Job movido a Dead Letter Queue
- Error rate supera el umbral configurado
