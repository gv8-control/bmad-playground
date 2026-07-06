import { Injectable } from '@nestjs/common';
import { ReplaySubject, type Observable } from 'rxjs';

export interface SseEvent {
  event: string;
  data: unknown;
}

@Injectable()
export class SessionEventsService {
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
    const subject = this.emitters.get(conversationId);
    if (subject) {
      subject.next(event);
    }
  }

  complete(conversationId: string): void {
    const subject = this.emitters.get(conversationId);
    if (subject) {
      subject.complete();
      this.emitters.delete(conversationId);
    }
  }
}
