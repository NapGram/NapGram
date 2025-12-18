import { PluginHost } from './internal/host';

export class PluginRuntime {
  static async start(options?: { defaultInstances?: number[] }) {
    return await PluginHost.start(options);
  }

  static async stop() {
    return await PluginHost.stop();
  }

  static async reload(options?: { defaultInstances?: number[] }) {
    return await PluginHost.reload(options);
  }

  static getLastReport() {
    return PluginHost.getLastReport();
  }
}
