import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { exec } from 'child_process';

export class OllamaCircuitOpenError extends Error {
  constructor() {
    super('Ollama circuit breaker is open — too many consecutive failures');
    this.name = 'OllamaCircuitOpenError';
  }
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private consecutiveFailures = 0;
  private readonly CIRCUIT_THRESHOLD = 5;
  private circuitOpen = false;

  constructor(private configService: ConfigService) {}

  get isCircuitOpen(): boolean {
    return this.circuitOpen;
  }

  private notify(message: string): void {
    const enabled = this.configService.get<boolean>('alerts.openclawNotify');
    if (!enabled) return;
    exec(`openclaw system event --text "${message}" --mode now`, (err) => {
      if (err) this.logger.warn(`OpenClaw notify failed: ${err.message}`);
    });
  }

  async generate(content: string): Promise<{
    title: string;
    summary: string;
    key_points: string[];
    topic: string;
    edu_level: string;
    quality_score: number;
  }> {
    if (this.circuitOpen) {
      throw new OllamaCircuitOpenError();
    }

    const url = this.configService.get<string>('ollama.url');
    const model = this.configService.get<string>('ollama.model');
    const timeoutMs = this.configService.get<number>('ollama.timeoutMs');

    const prompt = `Eres un editor educativo. Analiza el siguiente texto en español y extrae información de valor educativo.

Texto:
${content}

Responde ÚNICAMENTE con JSON válido sin texto adicional:
{
  "title": "título descriptivo del artículo en español",
  "summary": "resumen de 2-3 oraciones en español",
  "key_points": ["punto clave 1", "punto clave 2", "punto clave 3"],
  "topic": "tema principal en español",
  "edu_level": "basico|intermedio|avanzado",
  "quality_score": 7.5
}`;

    try {
      this.logger.log(`🤖 Prompt enviado (${content.length} chars) | model: ${model}`);
      const startTime = Date.now();

      const response = await axios.post(
        `${url}/api/generate`,
        { model, prompt, stream: false },
        { timeout: timeoutMs },
      );

      const elapsed = Date.now() - startTime;
      const evalCount = response.data?.eval_count ?? '?';
      this.logger.log(`✅ Respuesta recibida en ${elapsed}ms | ${evalCount} tokens`);

      const rawText: string = response.data?.response || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn(`⚠️ JSON inválido de Ollama, raw: ${rawText.slice(0, 100)}`);
        throw new Error('No JSON found in Ollama response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      this.consecutiveFailures = 0;
      return parsed;
    } catch (error) {
      if (error instanceof OllamaCircuitOpenError) throw error;

      this.consecutiveFailures += 1;
      this.logger.warn(`Ollama failure #${this.consecutiveFailures}: ${error.message}`);

      if (this.consecutiveFailures >= this.CIRCUIT_THRESHOLD) {
        this.circuitOpen = true;
        this.logger.error(`🔴 Circuit breaker ABIERTO tras ${this.consecutiveFailures} fallos consecutivos`);
        this.notify('ALERTA Forja: Ollama no responde en worker');
      }

      throw error;
    }
  }

  resetCircuit(): void {
    this.circuitOpen = false;
    this.consecutiveFailures = 0;
    this.logger.log('Ollama circuit breaker reset');
  }
}
