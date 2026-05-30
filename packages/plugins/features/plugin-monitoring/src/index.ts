import type { NapGramPlugin, PluginContext } from '@napgram/sdk'
import { monitoringRoutes } from '@napgram/web-interfaces'

const plugin: NapGramPlugin = {
    id: 'monitoring',
    name: 'Monitoring',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose monitoring and health endpoints',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Monitoring plugin installed')

        ctx.web.registerRoutes((app: any) => {
            monitoringRoutes(app)
        })
    },
}

export default plugin
