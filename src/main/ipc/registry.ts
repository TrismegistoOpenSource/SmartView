import { ipcMain } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc/contracts'

/**
 * Wrapper tipizzato sopra ipcMain.handle: il canale deve esistere in
 * IpcContracts e l'handler deve rispettarne request/response.
 */
export function handle<C extends IpcChannel>(
  channel: C,
  handler: (request: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>
): void {
  ipcMain.handle(channel, (_event, request) => handler(request as IpcRequest<C>))
}
