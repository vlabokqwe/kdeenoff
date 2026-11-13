/**
 * Lightweight `@nestjs/common` shim for the Cloudflare Worker bundle.
 * Allows sharing 100% of `backend/src/**` domain services without pulling in NestJS DI/Reflect at edge runtime.
 */

export function Injectable(): ClassDecorator {
  return () => {};
}

export function Global(): ClassDecorator {
  return () => {};
}

export function Module(_metadata?: unknown): ClassDecorator {
  return () => {};
}

export function Controller(_prefix?: string | string[]): ClassDecorator {
  return () => {};
}

export function All(_path?: string | string[]): MethodDecorator {
  return () => {};
}

export function Req(): ParameterDecorator {
  return () => {};
}

export function Res(): ParameterDecorator {
  return () => {};
}

export function Param(_property?: string): ParameterDecorator {
  return () => {};
}

export function Query(_property?: string): ParameterDecorator {
  return () => {};
}

export class Logger {
  constructor(private readonly context = "Worker") {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    console.log(`[${this.context}]`, message, ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    console.warn(`[${this.context}]`, message, ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    console.error(`[${this.context}]`, message, ...optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    console.debug(`[${this.context}]`, message, ...optionalParams);
  }
}

