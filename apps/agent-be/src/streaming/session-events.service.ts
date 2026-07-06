import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ReplaySubject, type Observable } from 'rxjs';

export interface SseEvent {
  event: string;
  data: unknown;
}

@Injectable()
export class SessionEventsService implements OnModuleDestroy {
  private readonly emitters = new Map<string, ReplaySubject<SseEvent>>();

  getEventStream(conversationId: string): Observable<SseEvent> {
    let subject = this.emitters.get(conversationId);
    if (!subject) {
      subject = new ReplaySubject<SseEvent>(100);
      this.emitters.set(conversationId, subject);
    }
    return subject;
  }

  emit(conversationId: string, event: SseEvent): void {
    let subject = this.emitters.get(conversationId);
    if (!subject) {
      subject = new ReplaySubject<SseEvent>(100);
      this.emitters.set(conversationId, subject);
    }
    subject.next(event);
  }

  complete(conversationId: string): void {
    const subject = this.emitters.get(conversationId);
    if (subject) {
      subject.complete();
      this.emitters.delete(conversationId);
    }
  }

  onModuleDestroy(): void {
    const conversationIds = [...this.emitters.keys()];
    for (const conversationId of conversationIds) {
      this.emit(conversationId, { event: 'SESSION_DRAINING', data: {} });
      this.complete(conversationId);
    }
  }
}
