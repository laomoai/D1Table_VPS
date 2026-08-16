export const ASSISTANT_ASK = 'mowen:assistant-ask'

export function askAssistant(text: string, send = false) {
  window.dispatchEvent(new CustomEvent(ASSISTANT_ASK, { detail: { text, send } }))
}
