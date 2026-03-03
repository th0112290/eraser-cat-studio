import { createHash } from "node:crypto";

export type AlertLevel = "info" | "warn" | "error";

export type AlertMessage = {
  source: string;
  title: string;
  level: AlertLevel;
  body: string;
  metadata?: Record<string, unknown>;
};

export interface Notifier {
  notify(message: AlertMessage): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async notify(message: AlertMessage): Promise<void> {
    const line = `[alert][${message.level}] ${message.source} :: ${message.title}`;
    console.log(line);
    console.log(message.body);
    if (message.metadata) {
      console.log(JSON.stringify(message.metadata));
    }
  }
}

export class MockEmailNotifier implements Notifier {
  constructor(private readonly to: string) {}

  async notify(message: AlertMessage): Promise<void> {
    const digest = createHash("sha256")
      .update(`${message.source}|${message.title}|${message.level}`)
      .digest("hex")
      .slice(0, 12);

    console.log(`[alert-email-stub] to=${this.to} id=${digest} level=${message.level}`);
    console.log(`subject=${message.title}`);
    console.log(message.body);
  }
}

export class CompositeNotifier implements Notifier {
  constructor(private readonly notifiers: Notifier[]) {}

  async notify(message: AlertMessage): Promise<void> {
    for (const notifier of this.notifiers) {
      await notifier.notify(message);
    }
  }
}

export function createDefaultNotifier(input?: {
  emailTo?: string;
  includeConsole?: boolean;
}): Notifier {
  const includeConsole = input?.includeConsole ?? true;
  const emailTo = input?.emailTo?.trim() ?? process.env.ALERT_EMAIL_TO?.trim();

  const notifiers: Notifier[] = [];

  if (includeConsole) {
    notifiers.push(new ConsoleNotifier());
  }

  if (emailTo) {
    notifiers.push(new MockEmailNotifier(emailTo));
  }

  return new CompositeNotifier(notifiers);
}
