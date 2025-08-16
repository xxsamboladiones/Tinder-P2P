// Browser-compatible EventEmitter implementation
export class EventEmitter {
  private events: Map<string, Function[]> = new Map()

  addEventListener(event: string, listener: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event)!.push(listener)
  }

  removeEventListener(event: string, listener: Function): void {
    const listeners = this.events.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.events.get(event)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args)
        } catch (error) {
          console.error('Event listener error:', error)
        }
      })
    }
  }

  on(event: string, listener: Function): void {
    this.addEventListener(event, listener)
  }

  off(event: string, listener: Function): void {
    this.removeEventListener(event, listener)
  }

  removeAllListeners(): void {
    this.events.clear()
  }
}