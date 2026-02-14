export interface OutboundAdapter {
  readonly id: string;
  sendText(text: string): Promise<boolean>;
}
