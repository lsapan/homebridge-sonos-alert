import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'

import { AlertSwitch } from './alertSwitch'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings'
import SonosManager from './sonos'
import { Config } from './types'

export class SonosAlertPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic

    public config: Config
    public sonos?: SonosManager

    // A mapping of existing accessories which will be populated by configureAccessory as homebridge loads
    // In our case, each accessory corresponds to an alert's switch
    public readonly accessories: { [uuid: string]: PlatformAccessory} = {}

    constructor(
        public readonly log: Logger,
        config: PlatformConfig,
        public readonly api: API,
    ) {
        // Update our config type
        this.config = config as Config

        // Polyfill for homebridge < 1.8.0
        if (!log.success) log.success = log.info

        // Ensure we've been configured
        const alerts = this.config?.alerts
        if (!this.config?.name || !alerts?.length || !alerts[0]?.rooms || alerts[0].rooms.length === 0) {
            this.log.error('No alerts have been set in the plugin config yet, please add some.')
            return
        }

        // Set up our Sonos manager
        this.sonos = new SonosManager(this)

        // We use this hook to create our accessory if it wasn't restored by homebridge
        this.api.on('didFinishLaunching', () => {
            this.log.debug('Platform didFinishLaunching')
            this.prepAlertSwitches()
        })
    }

    // Called for each existing switch as homebridge loads (before didFinishLaunching)
    configureAccessory(accessory: PlatformAccessory) {
        this.log.debug(`Loading accessory ${accessory.displayName} (${accessory.UUID}) from cache`)
        this.accessories[accessory.UUID] = accessory
    }

    // Connects existing switches, and creates new ones as needed
    prepAlertSwitches() {
        const newAccessories: PlatformAccessory[] = []
        const activeUUIDs: string[] = []
        for (const alert of this.config.alerts) {
            // Generate the UUID for this alert and check if we already have a switch for it
            const uuid = this.api.hap.uuid.generate(alert.name)
            let accessory = this.accessories[uuid]

            // Create the switch if it doesn't exist
            if (!accessory) {
                this.log.debug(`Adding new accessory ${alert.name} (${uuid})`)
                accessory = new this.api.platformAccessory(alert.name, uuid)
                newAccessories.push(accessory)
            }

            // Initialize our switch handler
            new AlertSwitch(this, accessory, alert, this.sonos!)
            activeUUIDs.push(uuid)
        }

        // Register any newly created accessories with homebridge
        if (newAccessories.length) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, newAccessories)

        // Clean up old switches
        Object.entries(this.accessories).forEach(([uuid, accessory]) => {
            if (!activeUUIDs.includes(uuid)) {
                this.log.debug(`Removing old accessory ${accessory.displayName} (${uuid})`)
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
                delete this.accessories[uuid]
            }
        })
    }
}
