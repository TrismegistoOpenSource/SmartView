/// <reference types="vite/client" />
import type { SmartPdfApi } from '@shared/ipc/api'

declare global {
  interface Window {
    smartpdf: SmartPdfApi
  }
}

export {}
